#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""定向补齐文献元数据（默认只动某个 collection，且**只填空字段**，绝不覆盖已有值）。

为什么需要：`build_resource3_bib.py` 生成的 resource3.bib 里只有 144/466 条带 year、
0 条带 journal（PDF 正文里本来就难抽），入库后这些行在界面上是"空年份/空期刊"。
本脚本用两条**高置信**来源补齐：

1) 有 DOI 的行 → Crossref `/works/<doi>`（title/container-title/year/volume/issue/page/abstract）。
   结果缓存在 `data/crossref_cache.json`，可中断重跑。
2) 中文知网 PDF 的**所在目录即刊名**（`知网-耐火材料-al2o3-sic-c-3.28` → `耐火材料`），
   目录名来源于当初的采集目录结构，确定性高，不需要猜。

用法：
  python3 backend_impl/scripts/enrich_literature.py --collection r3            # 干跑（只报告）
  python3 backend_impl/scripts/enrich_literature.py --collection r3 --apply    # 写库
  python3 backend_impl/scripts/enrich_literature.py --collection r3 --apply --fix-cjk-spaces
"""

import argparse
import html
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"
CACHE_DEFAULT = REPO / "data" / "crossref_cache.json"

CNKI_PREFIX = "知网-"
UA = "ASC-literature-enrich/1.0 (mailto:noreply@example.com)"


def _get_json(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def s(value) -> str:
    """列值安全转字符串：year 等列是 INTEGER，可能是 int/None。"""
    return "" if value is None else str(value).strip()


def strip_jats(text: str) -> str:
    """Crossref 的 abstract 是 JATS XML，去掉标签与多余空白。"""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_entity(text: str) -> str:
    """Crossref 字段里常有 HTML 实体（`The Minerals, Metals &amp; Materials Society`）→ 还原。"""
    return html.unescape(text or "").strip()


def crossref_meta(doi: str, cache: dict, timeout: int = 25, pause: float = 0.2):
    """DOI → {'title','journal','year','volume','number','pages','abstract'}；失败返回 None（并缓存空值）。"""
    key = doi.strip().lower()
    if key in cache:
        return cache[key]
    meta = None
    try:
        data = _get_json("https://api.crossref.org/works/" + urllib.parse.quote(key), timeout=timeout).get("message") or {}
        year = ""
        parts = ((data.get("issued") or {}).get("date-parts") or [[]])[0]
        if parts and parts[0]:
            year = str(parts[0])
        meta = {
            "title": clean_entity((data.get("title") or [""])[0]),
            "journal": clean_entity((data.get("container-title") or [""])[0]),
            "year": year,
            "volume": str(data.get("volume") or "").strip(),
            "number": str(data.get("issue") or "").strip(),
            "pages": str(data.get("page") or "").strip(),
            "abstract": clean_entity(strip_jats(data.get("abstract") or ""))[:4000],
        }
    except Exception as error:  # 网络/404 都缓存为空，避免反复重试
        print(f"  [warn] crossref 失败 {key}: {error}", file=sys.stderr)
        meta = None
    cache[key] = meta
    time.sleep(pause)
    return meta


def year_from_doi(doi: str) -> str:
    """CNKI 系 DOI 自带出版年（Crossref 无收录）：
    `10.13957/j.cnki.tcxb.2017.06.023` → 2017；`10.3969/j.issn.1001-1935.2013.06.014` → 2013。
    取 DOi 中第一个"恰为 4 位数且落在 1900–2030"的段（ISSN 段含短横线，不会被误取）。"""
    for seg in re.split(r"[./]", s(doi)):
        if re.fullmatch(r"(19|20)\d{2}", seg) and 1900 <= int(seg) <= 2030:
            return seg
    return ""


def journal_from_path(path: str) -> str:
    """知网采集目录名即刊名：`知网-耐火材料-al2o3-sic-c-3.28` → `耐火材料`。"""
    if not path:
        return ""
    for seg in re.split(r"[/\\]", path):
        if seg.startswith(CNKI_PREFIX):
            rest = seg[len(CNKI_PREFIX):]
            name = rest.split("-")[0].strip()
            return name if len(name) >= 2 else ""
    return ""


CJK_CLASS = r"\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60"


def title_is_trustworthy(title: str) -> bool:
    """与去重脚本同一判据：文件扩展名 / 过短 → 视为 PDF 抽取产物（封面页、生产文件名）。"""
    t = s(title)
    if re.search(r"\.(pmd|pdf|docx|xlsx|indd|qxd|xml|htm|html)\b", t, re.I):
        return False
    if re.search(r"[\u2e80-\u9fff]", t):
        return len(re.sub(r"\s+", "", t)) >= 6
    return len(t.split()) >= 4


def collapse_cjk_spaces(title: str) -> str:
    """PDF 文本抽取常把中日文字符之间插进空格（`高 炉 出 銑樋`）→ 去掉 CJK 与 CJK/数字之间的空格。"""
    if not title:
        return title
    title = re.sub(rf"(?<=[{CJK_CLASS}])[ \t]+(?=[{CJK_CLASS}0-9])", "", title)
    title = re.sub(rf"(?<=[0-9])[ \t]+(?=[{CJK_CLASS}])", "", title)
    return re.sub(r"\s{2,}", " ", title).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_DEFAULT))
    ap.add_argument("--collection", default="r3", help="目标 collection（默认 r3；传 '' 表示全部）")
    ap.add_argument("--cache", default=str(CACHE_DEFAULT))
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--fix-cjk-spaces", action="store_true", help="顺带把标题里中日文之间的空格去掉")
    ap.add_argument("--replace-implausible-titles", action="store_true",
                    help="标题是 PDF 抽取产物（`AFV CoverSheet` / `5_REM_372_MET.pmd`）且 Crossref 有标题时，替换之")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    cache_path = Path(args.cache)
    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    where = "is_delete=0"
    params = []
    if args.collection:
        where += " AND collection = ?"
        params.append(args.collection)
    rows = conn.execute(
        f"SELECT lit_id,title,authors,journal,year,volume,number,pages,doi,abstract,attachment FROM literature WHERE {where}",
        params,
    ).fetchall()
    if args.limit:
        rows = rows[: args.limit]
    print(f"目标行数: {len(rows)}（collection={args.collection or '全部'}）")

    stats = {"rows": len(rows), "crossref_ok": 0, "crossref_miss": 0, "replaced_title": 0, "filled_year": 0, "filled_journal": 0,
             "filled_volume": 0, "filled_number": 0, "filled_pages": 0, "filled_abstract": 0,
             "filled_title": 0, "fixed_title": 0, "updated": 0}
    updates = []
    for index, row in enumerate(rows, 1):
        patch = {}
        # 1) Crossref（有 DOI 时）
        doi = s(row["doi"])
        if doi:
            meta = crossref_meta(doi, cache)
            if meta:
                stats["crossref_ok"] += 1
                if not s(row["year"]) and meta["year"]:
                    patch["year"] = meta["year"]
                if not s(row["journal"]) and meta["journal"]:
                    patch["journal"] = meta["journal"]
                if not s(row["volume"]) and meta["volume"]:
                    patch["volume"] = meta["volume"]
                if not s(row["number"]) and meta["number"]:
                    patch["number"] = meta["number"]
                if not s(row["pages"]) and meta["pages"]:
                    patch["pages"] = meta["pages"]
                if not s(row["abstract"]) and meta["abstract"]:
                    patch["abstract"] = meta["abstract"]
                if not s(row["title"]) and meta["title"]:
                    patch["title"] = meta["title"]
                elif (args.replace_implausible_titles and meta["title"] and s(row["title"])
                      and not title_is_trustworthy(row["title"])):
                    patch["title"] = meta["title"]
                    stats["replaced_title"] = stats.get("replaced_title", 0) + 1
            else:
                stats["crossref_miss"] += 1
        # 2) 中文知网：目录名即刊名
        if not s(patch.get("journal")) and not s(row["journal"]):
            journal = journal_from_path(row["attachment"] or "")
            if journal:
                patch["journal"] = journal
        # 3) CNKI 系 DOI 自带年份（Crossref 查不到）
        if not s(patch.get("year")) and not s(row["year"]):
            year_from_d = year_from_doi(doi)
            if year_from_d:
                patch["year"] = year_from_d
        # 4) 修 Crossref 历史写入的 HTML 实体（&amp; 等）
        for col in ("title", "journal"):
            current = s(row[col])
            if "&amp;" in current or "&lt;" in current or "&gt;" in current or "&#" in current:
                patch[col] = clean_entity(current)
        # 5) 顺带修 PDF 抽取造成的 CJK 间空格
        if args.fix_cjk_spaces and row["title"]:
            fixed = collapse_cjk_spaces(s(row["title"]))
            if fixed != s(row["title"]):
                patch["title"] = fixed
                stats["fixed_title"] += 1

        if patch:
            updates.append((patch, row["lit_id"]))
            for key in ("year", "journal", "volume", "number", "pages", "abstract", "title"):
                if key in patch and not s(row[key]):
                    stats[f"filled_{key}"] = stats.get(f"filled_{key}", 0) + 1
        if index % 50 == 0:
            print(f"  … 已处理 {index}/{len(rows)}（缓存 {len(cache)}）", flush=True)

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print("样例补丁（前 3）:")
    for patch, lit_id in updates[:3]:
        print("   ", lit_id, {k: str(v)[:60] for k, v in patch.items()})

    if args.apply:
        for patch, lit_id in updates:
            sets = ", ".join(f"{k} = ?" for k in patch)
            conn.execute(f"UPDATE literature SET {sets}, update_time = CURRENT_TIMESTAMP WHERE lit_id = ?",
                         [*patch.values(), lit_id])
        conn.commit()
        stats["updated"] = len(updates)
        print(f"已写入 {len(updates)} 行")
    else:
        print(f"[DRY-RUN] 待写入 {len(updates)} 行（加 --apply 生效）")

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"crossref 缓存: {cache_path}（{len(cache)} 条）")
    conn.close()


if __name__ == "__main__":
    main()
