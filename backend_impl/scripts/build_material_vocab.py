#!/usr/bin/env python3
"""物料词表归束生成器 —— 以 L3（ML base 89）为基准，产出 canonical 快照。

设计（对齐 docs/material-vocabulary-unification-plan.md 的 S1–S4）：
  * **不落 SQLite**：canonical 只以本脚本产出的 `data/material_vocab.json` 快照为权威，
    另外输出人审队列 `data/material_vocab_queue.csv`。SQLite 仅被**只读**用于交叉校验与业务别名收集。
  * **粒度约定**：品类（canonical material，material_id 0..88 **冻结**）；牌号/厂家/代号 → alias；
    粒级 → 独立字段（别名自带 particle_min/max + material_particle_size）；工艺参数（加水量/加胶量）→
    external_ref.kind='process_param'，不进原料轴。
  * **零猜测**：精确/唯一归一命中才自动接受；歧义与无对应一律进队列，绝不猜。

输入（只读）：
  L3 backend_impl/python/model_predict/FEATURE/outputs/material_map.json        # 89 base（基准）
  L6 _code/output/material_mapping_20260728.json                                # 197 条（主桥：名称+类别+化学式+粒径）
  L5 _code/output/map_merged.json                                               # 96 优化器原料（自有索引）
  L4 _code/output/material_name_mapping_20260728.json                           # 121 原始名→统一名（辅桥/校验）
  DB backend_impl/data/sqlite/database.db（只读）                                # material_base(_rule) / mc_material / ml_formula_component

用法：
  python3 backend_impl/scripts/build_material_vocab.py            # 生成 + 打印审计
  python3 backend_impl/scripts/build_material_vocab.py --check    # 只校验已生成快照（不写文件）
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
L3_PATH = REPO / "backend_impl/python/model_predict/FEATURE/outputs/material_map.json"
L5_PATH = REPO / "_code/output/map_merged.json"
L6_PATH = REPO / "_code/output/material_mapping_20260728.json"
L4_PATH = REPO / "_code/output/material_name_mapping_20260728.json"
DB_PATH = REPO / "backend_impl/data/sqlite/database.db"
OUT_PATH = REPO / "data/material_vocab.json"
QUEUE_PATH = REPO / "data/material_vocab_queue.csv"

# 工艺参数（非原料）：优化器原料轴里的这两项对应 X_global，而不是物料
PROCESS_PARAM_RE = re.compile(r"^(加水量|加胶量|水量|胶量|结合剂用量)$")
PROCESS_PARAM_KEYS = {"加水量", "加胶量"}

GREEK = {"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta"}
CLASS_WORDS = ("超微粉", "微粉", "细粉", "粉料", "粉体", "粉末", "颗粒", "粒料", "骨料", "细料", "粉")
SIZE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[-~–—]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)?|(\d+(?:\.\d+)?)\s*(?:目)")


def norm_name(value: str) -> str:
    """名称归一化键：全角→半角、小写、去括号后缀(牌号/厂家)、去类别词与分隔符、晶型希腊字母转拉丁。"""
    text = str(value or "").strip().replace("\u3000", " ")
    text = re.sub(r"[\uFF01-\uFF5E]", lambda m: chr(ord(m.group(0)) - 0xFEE0), text).lower()
    for greek, latin in GREEK.items():
        text = text.replace(greek, latin)
    text = re.sub(r"(?<![a-z0-9])a[-\u2010-\u2015]?(?=al2o3| alumina)", "alpha-", text)
    text = re.sub(r"[（(][^）)]*[）)]", "", text)
    stripped = text
    for word in CLASS_WORDS:
        stripped = stripped.replace(word, "")
    # 纯类别名（如「微粉」）剥离后会变空，此时保留原形，避免归一化自毁
    if stripped.strip():
        text = stripped
    return re.sub(r"[\s_·・\-—－#/]", "", text)


def split_size(key: str):
    """把 '80均质矾土1-3mm' / '98黑碳化硅粉200目（铁沟组专用）' 拆成 (名称部分, min, max)。"""
    text = str(key or "")
    match = SIZE_RE.search(text)
    if not match:
        return text, None, None
    body = (text[: match.start()] + text[match.end():]).strip(" -（()）")
    if match.group(3):  # 目数
        mesh = float(match.group(3))
        mm = 0.15 / mesh if mesh else None  # 与前端/桥接一致的近似（目→mm）
        return body, mm, mm
    low = float(match.group(1))
    high = float(match.group(2))
    return body, min(low, high), max(low, high)


def suggest_candidates(name: str, materials: list, limit: int = 3) -> str:
    """为人工队列生成候选 base（仅建议，不构成自动映射）。"""
    def grams(value):
        text = norm_name(value)
        return {text[i:i + 2] for i in range(len(text) - 1)} if len(text) > 1 else {text}
    target = grams(name)
    if not target:
        return ""
    scored = []
    for m in materials:
        other = grams(m["name"])
        if not other:
            continue
        shared = len(target & other)
        score = shared / max(1, len(target | other))
        if shared:
            scored.append((round(score, 3), m["name"]))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return "|".join(f"{name_}({score})" for score, name_ in scored[:limit])


def sha1(path: Path) -> str:
    try:
        return hashlib.sha1(path.read_bytes()).hexdigest()[:12]
    except OSError:
        return "missing"


# ───────────────────────── 输入装载 ─────────────────────────

def load_inputs():
    l3 = json.loads(L3_PATH.read_text(encoding="utf-8"))["materials"]
    l5 = json.loads(L5_PATH.read_text(encoding="utf-8"))
    l6 = json.loads(L6_PATH.read_text(encoding="utf-8"))
    l4 = json.loads(L4_PATH.read_text(encoding="utf-8"))
    business = {"bases": [], "rules": [], "components": [], "bank_components": {}}
    if DB_PATH.exists():
        con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        try:
            cur = con.cursor()
            business["bases"] = list(cur.execute("SELECT base_id, base_name, material_id FROM material_base"))
            business["rules"] = list(cur.execute(
                "SELECT r.rule_id, r.kind, r.pattern, b.base_name FROM material_base_rule r "
                "LEFT JOIN material_base b ON b.base_id = r.target_base_id"))
            business["components"] = list(cur.execute(
                "SELECT DISTINCT json_extract(component_list, '$[0][0]') FROM mc_material"))
            business["ml_components"] = list(cur.execute(
                "SELECT DISTINCT material_id, json_extract(component_features, '$.base') FROM ml_formula_component"))
        except sqlite3.Error as exc:  # 表缺失/字段差异不应让生成失败
            business["error"] = str(exc)
        finally:
            con.close()
    return l3, l5, l6, l4, business


# ───────────────────────── 生成 ─────────────────────────

def build():
    l3, l5, l6, l4, business = load_inputs()
    optimizer_names = list(l5["metadata"]["material_names"]) if l5.get("metadata") else \
        list(l5.get("material_map", {}).keys())
    optimizer_index = {name: idx for idx, name in enumerate(optimizer_names)}

    # S1：基准（material_id 冻结 0..88，名称取 L3）
    materials = []
    by_norm = {}
    for item in l3:
        mid = int(item["material_id"])
        entry = {
            "material_id": mid,
            "base_id": f"BASE_{mid + 1:06d}",
            "name": str(item["name"]),
            "category": "", "formula": "", "elements": {},
            "status": "active",
            "samples": item.get("samples"),
        }
        materials.append(entry)
        by_norm[norm_name(entry["name"])] = mid
    name_by_id = {m["material_id"]: m["name"] for m in materials}

    # S1 校验：SQLite 注册表与 ml_formula_component 反查必须与 L3 一致
    checks = []
    db_bases = {int(r[2]): str(r[1]) for r in business.get("bases", []) if r[2] not in (None, "")}
    mismatch = [(k, v, name_by_id.get(k)) for k, v in db_bases.items() if name_by_id.get(k) != v]
    checks.append({"name": "material_base.id↔name 与 L3 一致", "passed": not mismatch, "detail": mismatch[:5]})
    ml_pairs = {(int(float(r[0])), str(r[1])) for r in business.get("ml_components", []) if r[0] is not None}
    ml_mismatch = [(mid, base, name_by_id.get(mid)) for mid, base in ml_pairs if name_by_id.get(mid) != base]
    checks.append({"name": "ml_formula_component.material_id↔base 与 L3 一致", "passed": not ml_mismatch,
                   "detail": ml_mismatch[:5], "pairs": len(ml_pairs)})

    aliases: list[dict] = []
    queue: list[dict] = []
    alias_seen: set[tuple] = set()
    alias_owner: dict[str, set] = {}   # 归一化名 → 可能的 material_id 集合（用于解析与歧义检测）

    def add_alias(alias, material_id, kind, source, confidence, size_min=None, size_max=None):
        key = (str(alias), size_min, size_max)   # 去重按原始名，保留牌号/厂家等不同写法
        if not str(alias).strip() or key in alias_seen:
            return False
        alias_seen.add(key)
        norm = norm_name(alias)
        if norm:
            alias_owner.setdefault(norm, set()).add(material_id)
        aliases.append({
            "alias": str(alias),
            "alias_norm": norm_name(alias),
            "material_id": material_id,
            "kind": kind,
            "particle_min": size_min,
            "particle_max": size_max,
            "source": source,
            "confidence": confidence,
        })
        return True

    def match_material(name):
        """名称 → (material_id, how)；只接受精确或唯一命中；歧义返回 ('ambiguous', 候选)。

        解析顺序（零猜测）：基准名精确归一 → 别名表归一 → 双向唯一包含（基准名/别名键）。
        """
        key = norm_name(name)
        if not key:
            return None, None
        if key in by_norm:
            return by_norm[key], "exact-norm"
        if key in alias_owner:
            owners = alias_owner[key]
            if len(owners) == 1:
                return next(iter(owners)), "alias-norm"
            return None, ("ambiguous", sorted(name_by_id[h] for h in owners))
        hits = {mid for norm, mid in by_norm.items() if len(norm) >= 2 and (key in norm or norm in key)}
        alias_hits = {mid for norm, owners in alias_owner.items()
                      if len(norm) >= 2 and (key in norm or norm in key) for mid in owners}
        hits |= alias_hits
        if len(hits) == 1:
            return next(iter(hits)), "unique-contain"
        if len(hits) > 1:
            return None, ("ambiguous", sorted(name_by_id[h] for h in hits))
        return None, None

    # 基准名自身作为 canonical 别名
    for m in materials:
        add_alias(m["name"], m["material_id"], "canonical", "L3", 1.0)

    # S2：L6 主桥（197 条 → 拆粒级 → 归到 base）
    particle_sizes: dict[int, set] = {}
    l6_hits = 0
    for key, meta in l6.items():
        body, size_min, size_max = split_size(key)
        mid, how = match_material(body)
        if isinstance(how, tuple):
            queue.append({"level": "alias_ambiguous", "external_name": key, "source": "L6",
                          "candidates": "|".join(how[1]), "suggestion": "人工选择命中 base"})
            continue
        if mid is None:
            queue.append({"level": "alias_unmatched", "external_name": key, "source": "L6",
                          "candidates": "", "suggestion": f"类别={meta.get('category') or '未知'}；无同名 base"})
            continue
        l6_hits += 1
        add_alias(key, mid, "synonym", "L6", 1.0 if size_min is None else 0.95, size_min, size_max)
        if body != key:
            add_alias(body, mid, "synonym", "L6", 1.0)
        if size_min is not None:
            particle_sizes.setdefault(mid, set()).add((size_min, size_max))
        # 富化品类属性（首次命中为准）
        target = materials[mid]
        if not target["category"] and meta.get("category"):
            target["category"] = str(meta["category"])
        if not target["formula"] and meta.get("formula"):
            target["formula"] = str(meta["formula"])
        if not target["elements"] and meta.get("elements"):
            target["elements"] = meta["elements"]

    # S3：L5 优化器 96 名全量处置
    external_refs = []
    for name in optimizer_names:
        if name in PROCESS_PARAM_KEYS or PROCESS_PARAM_RE.match(str(name)):
            external_refs.append({"system": "optimizer", "external_name": name,
                                  "external_index": optimizer_index.get(name),
                                  "material_id": None, "kind": "process_param", "match": "keyword"})
            continue
        mid, how = match_material(name)
        if isinstance(how, tuple):
            external_refs.append({"system": "optimizer", "external_name": name,
                                  "external_index": optimizer_index.get(name),
                                  "material_id": None, "kind": "unresolved", "match": "ambiguous"})
            queue.append({"level": "optimizer_ambiguous", "external_name": name, "source": "L5",
                          "candidates": "|".join(how[1]), "suggestion": "人工选择命中 base"})
            continue
        if mid is None:
            # 别名表兜底（L6 命中过的键未必同名于 L5）
            alias_hit = next((a for a in aliases if a["alias_norm"] == norm_name(name)), None)
            if alias_hit:
                mid, how = alias_hit["material_id"], f"alias:{alias_hit['source']}"
        if mid is None:
            external_refs.append({"system": "optimizer", "external_name": name,
                                  "external_index": optimizer_index.get(name),
                                  "material_id": None, "kind": "unresolved", "match": "none"})
            queue.append({"level": "optimizer_unmatched", "external_name": name, "source": "L5",
                          "candidates": suggest_candidates(name, materials) or "（无相似 base）",
                          "suggestion": "无对应 base：需人工判定；或该原料确实不在 L3 基准内（如需优化则须扩优化器原料空间）"})
            continue
        external_refs.append({"system": "optimizer", "external_name": name,
                              "external_index": optimizer_index.get(name),
                              "material_id": mid, "kind": "material", "match": how})
        add_alias(name, mid, "legacy", "L5", 1.0 if how == "exact-norm" else 0.9)

    # S4：L4 辅桥交叉校验（其"统一名"是第三套命名，仅作校验/补漏）
    l4_conflicts = []
    for raw, unified in (l4.get("mapping") or {}).items():
        if not unified:
            continue
        mid, how = match_material(unified)
        if mid is None:
            continue
        existing = next((r for r in external_refs if r["external_name"] == raw), None)
        if existing and existing["material_id"] not in (None, mid):
            l4_conflicts.append({"external_name": raw, "L4": unified, "L4_material": name_by_id.get(mid),
                                 "resolved": name_by_id.get(existing["material_id"])})
            continue
        add_alias(raw, mid, "synonym", "L4", 0.8)
    if l4_conflicts:
        for item in l4_conflicts:
            queue.append({"level": "l4_conflict", "external_name": item["external_name"], "source": "L4",
                          "candidates": f"{item['L4_material']}|{item['resolved']}",
                          "suggestion": "L4 与 L5/L6 结论冲突，以哪个为准需人工确认"})

    # S5（只读侧）：业务别名与业务组件名 → 收集可解析项，其余进队列
    for rule_id, kind, pattern, base_name in business.get("rules", []):
        mid, how = match_material(base_name or "")
        if mid is None:
            queue.append({"level": "business_rule_unresolved", "external_name": str(pattern), "source": "material_base_rule",
                          "candidates": str(base_name), "suggestion": "规则目标 base 未在基准中解析到"})
            continue
        add_alias(pattern, mid, "alias_rule", f"business_rule:{kind}", 1.0)
    for (name,) in business.get("components", []):
        if not name:
            continue
        mid, how = match_material(name)
        if mid is None:
            queue.append({"level": "business_component_unmatched", "external_name": str(name), "source": "mc_material",
                          "candidates": "", "suggestion": f"可尝试绑定到 base（解析失败）"})
        else:
            add_alias(name, mid, "business", "mc_material", 0.7)

    # S6：属性词表（优化器 19 ↔ 预测 4 属性×工况 ↔ 业务 y_feature_keys）
    property_vocab = []
    prop_axis = {"bulk_density": "体积密度", "cold_modulus": "常温抗折强度",
                 "crushing_strength": "常温耐压强度", "linear_change": "线变化率"}
    for name, idx in (l5.get("property_map") or {}).items():
        m = re.match(r"^(.*?)\[([^\]]+)\]$", name)
        base_cn, cond = (m.group(1), m.group(2)) if m else (name, "")
        key = next((k for k, v in prop_axis.items() if v == base_cn), "")
        property_vocab.append({"system": "optimizer", "name": name, "index": idx,
                               "property": key or base_cn, "condition": cond, "property_zh": base_cn})
    for key, zh in prop_axis.items():
        property_vocab.append({"system": "predict", "name": key, "index": None,
                               "property": key, "condition": "", "property_zh": zh})

    # S7：粒级表（来自 L6）
    particle_size_rows = [{"material_id": mid, "size_min": lo, "size_max": hi, "source": "L6"}
                          for mid, sizes in sorted(particle_sizes.items()) for lo, hi in sorted(sizes)]

    # 覆盖率
    targets_by_material: dict[int, list[str]] = {}
    for ref in external_refs:
        if ref["kind"] == "material" and ref["material_id"] is not None:
            targets_by_material.setdefault(ref["material_id"], []).append(ref["external_name"])
    bases_status = {"unique": 0, "multiple": 0, "none": 0}
    base_coverage = []
    for m in materials:
        targets = sorted(targets_by_material.get(m["material_id"], []))
        status = "unique" if len(targets) == 1 else ("multiple" if targets else "none")
        bases_status[status] += 1
        base_coverage.append({"material_id": m["material_id"], "name": m["name"], "status": status, "targets": targets})
        if status == "none":
            queue.append({"level": "base_without_optimizer", "external_name": m["name"], "source": "L3",
                          "candidates": suggest_candidates(m["name"], [x for x in materials if x["material_id"] != m["material_id"]]),
                          "suggestion": f"类别={m['category'] or '未知'}；优化器原料空间无对应（若需约束须扩空间/重训，见 W1）"})

    ref_kind = {}
    for ref in external_refs:
        ref_kind[ref["kind"]] = ref_kind.get(ref["kind"], 0) + 1

    snapshot = {
        "version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "generated_by": "backend_impl/scripts/build_material_vocab.py",
        "policy": "以 L3（material_id 冻结 0..88）为基准；别名多对一；粒级独立字段；工艺参数不进原料轴；零猜测",
        "sources": {
            "L3_material_map": {"path": str(L3_PATH.relative_to(REPO)), "sha1_12": sha1(L3_PATH), "count": len(l3)},
            "L6_material_mapping": {"path": str(L6_PATH.relative_to(REPO)), "sha1_12": sha1(L6_PATH), "count": len(l6)},
            "L5_map_merged": {"path": str(L5_PATH.relative_to(REPO)), "sha1_12": sha1(L5_PATH), "count": len(optimizer_names)},
            "L4_name_mapping": {"path": str(L4_PATH.relative_to(REPO)), "sha1_12": sha1(L4_PATH),
                                "count": len(l4.get("mapping") or {})},
            "business_db": {"path": str(DB_PATH.relative_to(REPO)), "sha1_12": sha1(DB_PATH)},
        },
        "checks": checks,
        "materials": materials,
        "aliases": aliases,
        "external_refs": external_refs,
        "particle_sizes": particle_size_rows,
        "property_vocab": property_vocab,
        "base_coverage": base_coverage,
        "queue": queue,
        "stats": {
            "materials": len(materials),
            "aliases": len(aliases),
            "external_refs": len(external_refs),
            "external_ref_kinds": ref_kind,
            "optimizer_names": len(optimizer_names),
            "base_status": bases_status,
            "l6_matched": l6_hits,
            "queue": len(queue),
            "queue_by_level": {lv: sum(1 for q in queue if q["level"] == lv) for lv in sorted({q["level"] for q in queue})},
        },
    }
    return snapshot


def write_outputs(snapshot):
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    with QUEUE_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["level", "external_name", "source", "candidates", "suggestion"])
        writer.writeheader()
        for row in snapshot["queue"]:
            writer.writerow(row)


def report(snapshot):
    s = snapshot["stats"]
    print(json.dumps({
        "materials": s["materials"],
        "aliases": s["aliases"],
        "external_refs": s["external_refs"],
        "external_ref_kinds": s["external_ref_kinds"],
        "base_status": s["base_status"],
        "l6_matched": s["l6_matched"],
        "queue": s["queue"],
        "queue_by_level": s["queue_by_level"],
    }, ensure_ascii=False, indent=2))
    for check in snapshot["checks"]:
        mark = "PASS" if check["passed"] else "FAIL"
        print(f"[{mark}] {check['name']}" + (f" → {check['detail']}" if check.get("detail") else ""))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只校验：读取已生成快照并检查不变式，不写文件")
    args = parser.parse_args()
    if args.check:
        if not OUT_PATH.exists():
            print(f"缺少快照: {OUT_PATH}", file=sys.stderr)
            return 2
        snapshot = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        report(snapshot)
        problems = [c for c in snapshot["checks"] if not c["passed"]]
        return 1 if problems else 0
    snapshot = build()
    write_outputs(snapshot)
    report(snapshot)
    print(f"\n-> {OUT_PATH.relative_to(REPO)}\n-> {QUEUE_PATH.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
