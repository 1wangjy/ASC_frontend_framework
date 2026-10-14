#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文献库重复行合并（跨 collection 也处理）。

背景：resource3 入库时，少数图片版/封面版 PDF 的正文抽取拿到的是**生产文件名或期刊封面**，
导致标题变成 `AFV CoverSheet` / `5_REM_372_MET.pmd`，再去重就配不上；也有个别 DOI 解析错了
（标题是耐火材料论文，DOI 却是心脏病学刊）。于是库中出现"同一篇文献两行"。

本脚本按三个键找重复组（任一命中即同组）：
  1) 归一化 DOI（小写、去尾点）
  2) 归一化标题（仅保留字母数字与 CJK）
  3) dedupe_key
每组保留一行（优先：有附件的 > 有 DOI 的 > lit_id 早的），把其余行的附件行改挂到保留行、
把空字段从被合并行补到保留行，最后把被合并行 `is_delete=1`（软删除，可回溯）。

用法：
  python3 backend_impl/scripts/repair_literature_dupes.py                # 干跑
  python3 backend_impl/scripts/repair_literature_dupes.py --apply
  python3 backend_impl/scripts/repair_literature_dupes.py --only r3      # 只处理含 r3 的重复组
"""

import argparse
import json
import re
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"

MERGE_FIELDS = ("title", "authors", "journal", "year", "volume", "number", "pages", "doi", "abstract", "note", "entry_type")


def s(value) -> str:
    return "" if value is None else str(value).strip()


def norm_title(t: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", (t or "").lower())


def norm_doi(d: str) -> str:
    return s(d).lower().rstrip(".")


class DSU:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def title_is_trustworthy(title: str) -> bool:
    """标题是否可信：有文件扩展名或过短（如 `AFV CoverSheet`、`5_REM_372_MET.pmd`）视为抽取产物。"""
    t = s(title)
    if re.search(r"\.(pmd|pdf|docx|xlsx|indd|qxd|xml|htm|html)\b", t, re.I):
        return False
    if re.search(r"[\u2e80-\u9fff]", t):
        return len(re.sub(r"\s+", "", t)) >= 6
    return len(t.split()) >= 4


def build_groups(rows, scores):
    """rows: [(lit_id, collection, title, doi, dedupe_key, attachment, has_file)]

    合并依据（任一）：
      1) 归一化 DOI 相同 —— 同一篇；
      2) dedupe_key 相同 —— 同一篇（含无 DOI 的中文条目）；
      3) 归一化标题相同，且**一方没有 DOI，或该标题可信**（多词/长标题）。
         注意：DOI 不同且标题只是"同一批文件抽出来的垃圾名"（如封面页 `AFV CoverSheet`）时**不合并**，
         那是不同论文，属于标题待修，而不是重复。
    """
    dsu = DSU()
    seen_title, seen_doi, seen_key = {}, {}, {}
    for lit_id, _c, title, doi, dkey, _att, _hf in rows:
        dsu.find(lit_id)
        tk, dk = norm_title(title), norm_doi(doi)
        if tk:
            if tk in seen_title:
                other = seen_title[tk]
                other_doi = next(norm_doi(r[3]) for r in rows if r[0] == other)
                if (not dk and other_doi) or (not other_doi and dk) or title_is_trustworthy(title):
                    dsu.union(other, lit_id)
            else:
                seen_title[tk] = lit_id
        if dk:
            if dk in seen_doi:
                dsu.union(seen_doi[dk], lit_id)
            else:
                seen_doi[dk] = lit_id
        if dkey:
            if dkey in seen_key:
                dsu.union(seen_key[dkey], lit_id)
            else:
                seen_key[dkey] = lit_id
    groups = {}
    for lit_id, coll, title, doi, dkey, att, has_file in rows:
        groups.setdefault(dsu.find(lit_id), []).append(
            {"lit_id": lit_id, "collection": coll, "title": title, "doi": doi,
             "dedupe_key": dkey, "attachment": att, "has_file": has_file, "score": scores.get(lit_id, 0)})
    return [g for g in groups.values() if len(g) > 1]


def pick_survivor(group):
    """保留行：元数据最完整者优先（附件会随后迁移，因此有附件不是首要因素）。"""
    return sorted(group, key=lambda r: (r.get("score", 0), 1 if r["has_file"] else 0, r["lit_id"] < "LIT999999"), reverse=True)[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_DEFAULT))
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", default="", help="只处理含该 collection 的重复组（如 r3）")
    ap.add_argument("--hard-delete", action="store_true",
                    help="直接删除被合并行（字段与附件已迁移）。注意：文献列表接口不过滤 is_delete，"
                         "软删除的重复行仍会显示，因此合并去重应使用硬删。")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT l.lit_id, l.collection, l.title, l.doi, l.dedupe_key, l.attachment,
                  (SELECT COUNT(*) FROM lit_file f WHERE f.lit_id = l.lit_id) AS file_count,
                  ((COALESCE(l.title,'')<>'') + (COALESCE(l.authors,'')<>'') + (COALESCE(l.journal,'')<>'') +
                   (COALESCE(l.year,'')<>'') + (COALESCE(l.volume,'')<>'') + (COALESCE(l.number,'')<>'') +
                   (COALESCE(l.pages,'')<>'') + (COALESCE(l.doi,'')<>'') + (COALESCE(l.abstract,'')<>'')) AS score
           FROM literature l WHERE l.is_delete = 0""").fetchall()
    items = [(r["lit_id"], r["collection"], r["title"], r["doi"], r["dedupe_key"], r["attachment"], r["file_count"] > 0)
             for r in rows]
    scores = {r["lit_id"]: r["score"] for r in rows}
    groups = build_groups(items, scores)
    if args.only:
        groups = [g for g in groups if any(x["collection"] == args.only for x in g)]
    print(f"总行数 {len(items)}｜重复组 {len(groups)}（涉及 {sum(len(g) for g in groups)} 行）")

    plan = []
    for group in groups:
        survivor = pick_survivor(group)
        losers = [x for x in group if x["lit_id"] != survivor["lit_id"]]
        plan.append({"keep": survivor, "drop": losers})

    report = []
    for entry in plan:
        keep = entry["keep"]
        drop_ids = [x["lit_id"] for x in entry["drop"]]
        # 被合并行里"有值而保留行为空"的字段
        patches = {}
        for col in MERGE_FIELDS:
            if not s(conn.execute(f"SELECT {col} FROM literature WHERE lit_id=?", (keep["lit_id"],)).fetchone()[0]):
                for x in entry["drop"]:
                    value = conn.execute(f"SELECT {col} FROM literature WHERE lit_id=?", (x["lit_id"],)).fetchone()[0]
                    if s(value):
                        patches[col] = value
                        break
        files = sum(f[0] for f in conn.execute(
            f"SELECT COUNT(*) FROM lit_file WHERE lit_id IN ({','.join('?' * len(drop_ids))})", drop_ids)) if drop_ids else 0
        report.append({"keep": keep["lit_id"], "keep_collection": keep["collection"],
                       "drop": [{"lit_id": x["lit_id"], "collection": x["collection"],
                                 "title": s(x["title"])[:40], "doi": s(x["doi"])} for x in entry["drop"]],
                       "fill_fields": {k: s(v)[:40] for k, v in patches.items()},
                       "move_files": files})
        if args.apply:
            for col, value in patches.items():
                conn.execute(f"UPDATE literature SET {col}=?, update_time=CURRENT_TIMESTAMP WHERE lit_id=?", (value, keep["lit_id"]))
            if files:
                # 附件改挂到保留行（同 (lit_id,kind,filename) 已存在则删除被合并行的那条）
                conn.execute(
                    f"""UPDATE OR IGNORE lit_file SET lit_id=? WHERE lit_id IN ({','.join('?' * len(drop_ids))})""",
                    [keep["lit_id"], *drop_ids])
                conn.execute(f"DELETE FROM lit_file WHERE lit_id IN ({','.join('?' * len(drop_ids))})", drop_ids)
            if args.hard_delete:
                conn.execute(f"DELETE FROM literature WHERE lit_id IN ({','.join('?' * len(drop_ids))})", drop_ids)
            else:
                conn.execute(f"UPDATE literature SET is_delete=1, update_time=CURRENT_TIMESTAMP "
                             f"WHERE lit_id IN ({','.join('?' * len(drop_ids))})", drop_ids)
    if args.apply:
        conn.commit()
    print(json.dumps(report, ensure_ascii=False, indent=2)[:4000])
    mode = "硬删" if args.hard_delete else "软删"
    print(f"[{'APPLY' if args.apply else 'DRY-RUN'}] 合并组 {len(plan)}｜待{mode} {sum(len(p['drop']) for p in plan)} 行")
    conn.close()


if __name__ == "__main__":
    main()
