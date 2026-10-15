#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 ML 数据集的原始记录导入「数据管理」四张业务表（配方/原料/物性/测试）。

**主源**（真源，字段最全）：`../_code/private_data/addtional/extractor/output/{yangquan,zibo}_formulas_clean/*.json`
  —— Clean Canonical 五段结构（formula / components[].component_tests / formula_tests.product_tests / metadata）。
**回退源**：`ml_formula` + `ml_formula_component`（batch183 无 clean JSON；亦可用于交叉校验）。

导入范围：默认只导 **ML 数据集里的 780 条配方**（= `ml_formula` 的 recipe_id 集合；已核对为真源子集）。
四表映射（平台契约，见 findings F27/F29/F31）：
  MC 原料表 `mc_material`   ← 组分（身份 = factory + material_name + spec + particle_size，**按粒级实例化**）
  MP 物性表 `mp_properties` ← 组分化学(11 键) + 物料物性(7 键)，物性文档 schemaVersion 3
  MR 配方表 `mr_formula`    ← 配方（component_list=[名称, mc_id, meta, ratio]）+ 用途/加水量/硬化时间
  TP 测试表 `tp_test_properties` ← `formula_tests.product_tests[]`（每条测试一项测量，含 test_stage/温度）

硬约束（后端 newDbService.js 会拒，脚本必须自保证）：
  · 组件名可解析到 enabled 的 material_base；ratio ∈ (0,100] 且**和 = 100±0.01**；同配方不得重复引用同一 MC。
  · ID 形如 `MC_000001`（下划线 + 6 位，9 字符）。

用法：
  python3 backend_impl/scripts/import_ml_formulas.py                # 干跑（默认，不写库）
  python3 backend_impl/scripts/import_ml_formulas.py --apply        # 写库（幂等：先删自己创建的行）
  python3 backend_impl/scripts/import_ml_formulas.py --source-root <extractor/output 目录>
  python3 backend_impl/scripts/import_ml_formulas.py --all-sources  # 真源全部 2814 条（默认只导 ML 子集 780）
"""

import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"
SOURCE_ROOT_DEFAULT = REPO.parent / "_code" / "private_data" / "addtional" / "extractor" / "output"
BASE_LIST = REPO / "data" / "handover" / "base_list.json"
BASE_MAPPING = REPO / "data" / "handover" / "V1_base_mapping.json"
PROPERTIES_CONFIG = HERE.parent / "src" / "config" / "properties-config.json"

FACTORY_DIR = {"yangquan": "yangquan_formulas_clean", "zibo": "zibo_formulas_clean"}

# ML y 键 → 平台测试物性名（裸名，需存在于 testProperties；缺失者由 ensure_vocab 追加）
Y_TO_TEST_PROPERTY = {
    "bulk_density": "bulkDensity",
    "cold_modulus": "flexuralStrength",
    "crushing_strength": "compressiveStrength",
    "linear_change": "permanentLineChange",
    "apparent_porosity": "apparentPorosity",
    "wear": "abrasionResistance",
}
# ML 组分物性键 → 平台纯物料物性名
COMP_PROPERTY_TO_PURE = {
    "bulk_density": "bulkDensity",
    "true_density": "trueDensity",
    "water_absorption": "waterAbsorption",
    "porosity": "porosity",
    "d50": "particleSize",
}
CHEMICAL_KEYS = ["SiC", "SiO2", "AL2O3", "Fe2O3", "TiO2", "CaO", "MgO", "K2O", "Na2O", "PH", "loi"]
PACKAGING_RE = re.compile(r"集装袋|袋装|普黑|PA胶|包装")

# 幂等标记（沿用既有物化脚本约定，便于同一套清理逻辑）
MC_BATCH_PREFIX = "ML-"
MR_CREATOR_PREFIX = "ml-ingest:"
MR_NAME_PREFIX = "[ML] "
TP_COND_PREFIX = "ML数据集: "
SCHEMA_VERSION = 3


def s(value):
    return "" if value is None else str(value).strip()


def num(value):
    """字符串/数值 → float，非法或空 → None（clean JSON 里化学值是字符串）。"""
    if value is None or value == "":
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out


def j(obj):
    return json.dumps(obj, ensure_ascii=False)


class Minter:
    """`MC_000001` 风格的 9 字符 ID：前缀 + 下划线 + 6 位，续接库里已有的最大号。"""

    def __init__(self, conn):
        self.conn = conn

    def _max(self, table, column, prefix):
        row = self.conn.execute(
            f"SELECT MAX(CAST(substr({column}, {len(prefix) + 2}) AS INTEGER)) FROM {table} "
            f"WHERE {column} LIKE ?||'%'", (prefix,)).fetchone()
        return row[0] or 0

    def mint(self, table, column, prefix):
        n = self._max(table, column, prefix) + 1
        return f"{prefix}_{n:06d}"


# ───────────────────────── 词表（测试物性裸名）─────────────────────────

def verify_vocab():
    """**只读校验**：确认测试物性裸名在服务端词表中可用。

    为什么不需要改词表：`config/properties-def.js` 的 `LEGACY_TEST_PROPERTIES` 会把带工况后缀的条目
    （如 `bulkDensity(110Cx24H)`、`permanentLineChange(1450Cx24H)`）剥成裸名并补 temperature(+duration) 字段，
    因此 `bulkDensity/flexuralStrength/compressiveStrength/permanentLineChange/apparentPorosity` 本来就可写。
    这里只报告缺失项，绝不改写 `properties-config.json`（避免 500 行格式噪音与全局副作用）。
    """
    cfg = json.loads(PROPERTIES_CONFIG.read_text(encoding="utf-8"))
    raw = {it["name"] for it in cfg.get("testProperties") or []}
    bare = set()
    for name in raw:
        bare.add(name)
        match = re.match(r"^(.+)\(\d+C(?:x\d+H)?\)$", name)   # 剥后缀后即裸名
        if match:
            bare.add(match.group(1))
    pure = {it["name"] for it in cfg.get("pureMaterialProperties") or []}
    needed_test = set(Y_TO_TEST_PROPERTY.values())
    needed_pure = set(COMP_PROPERTY_TO_PURE.values())
    missing_test = sorted(needed_test - bare)
    missing_pure = sorted(needed_pure - pure)
    return {"missing_test": missing_test, "missing_pure": missing_pure,
            "test_available": sorted(needed_test & bare), "pure_available": sorted(needed_pure & pure)}


def load_base_names():
    names = set(json.loads(BASE_LIST.read_text(encoding="utf-8")))
    mapping = json.loads(BASE_MAPPING.read_text(encoding="utf-8"))
    alias = {}
    for row in mapping:
        alias[s(row.get("new_name"))] = s(row.get("base_name"))
        if s(row.get("base_name")):
            names.add(s(row.get("base_name")))
    return names, alias


def resolve_base_name(material_name, spec, base_names, alias):
    """把源材料名解析到注册表规范名：精确 → 别名 → 名称包含规范名 → 原名（标 unresolved）。"""
    raw = s(material_name)
    if raw in base_names:
        return raw, True
    if raw in alias:
        return alias[raw], True
    for name in sorted(base_names, key=len, reverse=True):
        if name and (name in raw or name in s(spec)):
            return name, True
    for key, target in alias.items():
        if key and (key in raw or key in s(spec)):
            return target, True
    return raw, False


def iter_source_records(source_root, factories, ml_subset, all_sources):
    """产出 (factory, formula_id, record)；默认只产 ML 子集内的配方。"""
    for factory in factories:
        directory = Path(source_root) / FACTORY_DIR[factory]
        if not directory.exists():
            print(f"[warn] 源目录不存在：{directory}", file=sys.stderr)
            continue
        for path in sorted(directory.glob("*.json")):
            formula_id = path.stem.split("_")[0]
            if not all_sources and (factory, formula_id) not in ml_subset:
                continue
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
            except Exception as error:
                print(f"[warn] 解析失败 {path.name}: {error}", file=sys.stderr)
                continue
            yield factory, formula_id, record, path


def iter_ml_records(conn, factories):
    """回退源：ml_formula*（batch183 无 clean JSON，或被显式指定时使用）。"""
    rows = conn.execute(
        "SELECT dataset_source, recipe_id, n_components, y_labels FROM ml_formula ORDER BY dataset_source, recipe_id").fetchall()
    comps = {}
    for row in conn.execute(
            "SELECT dataset_source, recipe_id, comp_index, material_id, ratio_pct, component_features "
            "FROM ml_formula_component ORDER BY dataset_source, recipe_id, comp_index"):
        comps.setdefault((row["dataset_source"], row["recipe_id"]), []).append(row)
    for source, recipe_id, _n, y_labels in rows:
        if factories and source not in factories:
            continue
        components = []
        for comp in comps.get((source, recipe_id), []):
            try:
                feats = json.loads(comp["component_features"] or "{}")
            except Exception:
                feats = {}
            components.append({
                "material_name": s(feats.get("base")) or f"{source}-{comp['material_id']}",
                "spec": "",
                "ratio_pct": comp["ratio_pct"],
                "particle_size": f"{num(feats.get('particle_size_mean')) or ''}-{num(feats.get('particle_size_std')) or ''}".strip("-"),
                "batch": "",
                "component_tests": {
                    "chemical": {k: feats.get(k) for k in CHEMICAL_KEYS},
                    "property_inspection": {
                        "bulk_density": feats.get("bulk_density"),
                        "true_density": feats.get("true_density"),
                        "water_absorption": feats.get("water_absorption"),
                        "porosity": feats.get("porosity"),
                        "d50": feats.get("d50"),
                    },
                },
            })
        product_tests = []
        try:
            y = json.loads(y_labels or "{}")
        except Exception:
            y = {}
        if isinstance(y, dict):
            per_temp = {}
            for prop, conds in y.items():
                if not isinstance(conds, dict):
                    continue
                for cond, value in conds.items():
                    temp = None
                    match = re.match(r"^\s*(\d+)", s(cond))
                    if match:
                        temp = int(match.group(1))
                    for one in re.split(r"\s*/\s*", s(value)):
                        if one:
                            per_temp.setdefault(temp, {}).setdefault(prop, []).append(one)
            for temp, props in per_temp.items():
                row = {"test_stage": "ML 拟合数据集", "temperature": temp, "source_table": "ml_formula.y_labels"}
                for prop, values in props.items():
                    row[prop] = values[0]
                product_tests.append(row)
        yield source, recipe_id, {
            "source_factory": source,
            "formula": {"formula_id": recipe_id, "purpose": "", "product_name": ""},
            "components": components,
            "formula_tests": {"matched": bool(product_tests), "product_tests": product_tests},
            "metadata": {"origin": "ml_formula(回退源)"},
        }, None


# ───────────────────────── 记录 → 四表载荷 ─────────────────────────

def build_document(properties, custom=None):
    """物性文档（schemaVersion 3）：properties[name] = [ {fields:{...}, raw} ]。"""
    document = {"schemaVersion": SCHEMA_VERSION, "properties": {}, "customProperties": custom or []}
    for name, measurements in properties.items():
        if measurements:
            document["properties"][name] = measurements
    return document


NOT_APPLICABLE = "N/A"


def measurement(value, unit="", temperature=NOT_APPLICABLE, duration=NOT_APPLICABLE, raw=""):
    """测量项：缺工况时显式写 `N/A`（界面 `formatDisplayField` 把缺失值渲染成 UNKNOWN，写 N/A 才语义正确）。"""
    fields = {"value": {"value": value, "unit": unit}}
    fields["temperature"] = {"value": temperature, "unit": "" if isinstance(temperature, str) else "℃"}
    fields["duration"] = {"value": duration, "unit": "" if isinstance(duration, str) else "h"}
    return {"fields": fields, "raw": raw or " ".join(str(item) for item in (value, temperature, duration) if item is not None)}


def component_properties(component, issues):
    """组分 → (MC 身份键, MP 物性文档, 规范名, 追踪信息)。"""
    tests = component.get("component_tests") or {}
    chemical = tests.get("chemical") or {}
    inspection = tests.get("property_inspection") or {}
    custom = []
    for key in CHEMICAL_KEYS:
        value = num(chemical.get(key))
        if value is not None:
            custom.append({"name": key, "value": value, "unit": "%"})
    properties = {}
    for key, target in COMP_PROPERTY_TO_PURE.items():
        value = num(inspection.get(key))
        if value is None:
            continue
        unit = {"bulkDensity": "g/cm³", "trueDensity": "g/cm³", "waterAbsorption": "%",
                "porosity": "%", "particleSize": "mm"}.get(target, "")
        properties[target] = [measurement(value, unit, raw=f"{value}")]  # 无工况 → 温度/时长 N/A
    for key in ("moisture", "ph"):
        value = num(inspection.get(key))
        if value is not None:
            custom.append({"name": key, "value": value, "unit": ""})
    return properties, custom


def product_test_document(record, issues):
    """formula_tests.product_tests[] → TP 物性文档（每条测试一项测量；temperature=None 记 N/A）。"""
    product_tests = (record.get("formula_tests") or {}).get("product_tests") or []
    properties = {}
    stages = {}
    skipped = 0
    for test in product_tests:
        stage = s(test.get("test_stage")) or "未标注"
        temperature = test.get("temperature")
        for source_key, target in Y_TO_TEST_PROPERTY.items():
            value = num(test.get(source_key))
            if value is None:
                continue
            unit = {"bulkDensity": "g/cm³", "flexuralStrength": "MPa", "compressiveStrength": "MPa",
                    "permanentLineChange": "%", "apparentPorosity": "%", "abrasionResistance": "cm³"}[target]
            raw = f"{value}" + (f";{temperature}℃" if temperature is not None else ";无工况")
            properties.setdefault(target, []).append(
                measurement(value, unit,
                            temperature=temperature if temperature is not None else NOT_APPLICABLE,
                            raw=f"{raw} [{stage}]"))
            stages.setdefault(target, set()).add(stage)
        if temperature is None:
            skipped += 1
    if skipped:
        issues.append(f"test_stage 含 {skipped} 条 temperature=None 的测试（按‘无工况’保留，未丢弃）")
    return build_document(properties), {k: sorted(v) for k, v in stages.items()}


def normalize_ratios(rows, factory, issues):
    """组分解重（同身份相加）→ 过滤包装行 → 归一化到 100±0.01；返回 (rows, 原始和, 说明)。"""
    kept = []
    for row in rows:
        ratio = num(row.get("ratio_pct"))
        name = s(row.get("material_name"))
        if ratio is None or ratio <= 0:
            issues.append(f"跳过无有效配比的组分：{name!r}")
            continue
        if ratio > 100 or PACKAGING_RE.search(name):
            issues.append(f"跳过非组分材料（包装）：{name!r} ratio={ratio}")
            continue
        kept.append((name, s(row.get("spec")), s(row.get("particle_size")), ratio, row))
    merged = {}
    order = []
    for name, spec, size, ratio, row in kept:
        key = (name, spec, size)
        if key not in merged:
            merged[key] = {"ratio": 0.0, "row": row, "copies": 0}
            order.append(key)
        merged[key]["ratio"] += ratio
        merged[key]["copies"] += 1
    rows_out = []
    for key in order:
        item = merged[key]
        if item["copies"] > 1:
            issues.append(f"合并重复组分 {key[0]!r}×{item['copies']}（比例相加）")
        rows_out.append((key, item["ratio"], item["row"]))
    original_sum = sum(item[1] for item in rows_out)
    scale = 100.0 / original_sum if original_sum else 0
    normalized = [{"identity": key, "ratio": round(ratio * scale, 4), "row": row} for key, ratio, row in rows_out]
    # 逐项保留 4 位小数后微调最大项，保证和恰好落在 100±0.01
    total = sum(item["ratio"] for item in normalized)
    if normalized and abs(total - 100) > 1e-9:
        biggest = max(normalized, key=lambda item: item["ratio"])
        biggest["ratio"] = round(biggest["ratio"] + (100.0 - total), 4)
    return normalized, round(original_sum, 4)


# ───────────────────────── 主流程 ─────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_DEFAULT))
    ap.add_argument("--source-root", default=str(SOURCE_ROOT_DEFAULT))
    ap.add_argument("--apply", action="store_true", help="写库（默认干跑）")
    ap.add_argument("--all-sources", action="store_true", help="真源全部（默认只导 ML 数据集的子集）")
    ap.add_argument("--factories", default="yangquan,zibo", help="逗号分隔；回退源可加 batch183")
    ap.add_argument("--limit", type=int, default=0)

    args = ap.parse_args()

    factories = [x.strip() for x in args.factories.split(",") if x.strip()]
    base_names, alias = load_base_names()
    vocab = verify_vocab()
    print(f"词表校验（只读）：测试侧可用 {vocab['test_available']}｜缺失 {vocab['missing_test'] or '无'}"
          f"；纯物料侧可用 {vocab['pure_available']}｜缺失 {vocab['missing_pure'] or '无'}")
    if vocab["missing_test"] or vocab["missing_pure"]:
        issues.append(f"词表缺失（需人工决定）：test={vocab['missing_test']} pure={vocab['missing_pure']}")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    ml_subset = {(r["dataset_source"], r["recipe_id"]) for r in
                 conn.execute("SELECT dataset_source, recipe_id FROM ml_formula")}
    print(f"ML 数据集配方数 {len(ml_subset)}（{'全部真源' if args.all_sources else '仅导入该子集'}）")

    stats = {"formulas": 0, "mc": 0, "mp": 0, "mr": 0, "tp": 0, "skipped": 0,
             "unresolved_names": 0, "ratio_rescaled": 0, "ratio_deviation": []}
    issues = []
    unresolved = set()
    # 原料跨配方复用：身份键 → mc_id
    material_ids = {}
    records = []
    for factory, formula_id, record, path in iter_source_records(
            args.source_root, [f for f in factories if f in FACTORY_DIR], ml_subset, args.all_sources):
        records.append((factory, formula_id, record, path))
    # batch183 等无 clean JSON 的来源走 ml_formula 回退
    fallback = [f for f in factories if f not in FACTORY_DIR] or (
        ["batch183"] if not args.all_sources else [])
    for factory, formula_id, record, path in iter_ml_records(conn, fallback):
        records.append((factory, formula_id, record, path))
    if args.limit:
        records = records[: args.limit]
    print(f"待处理配方 {len(records)} 条")

    if args.apply:
        conn.execute("BEGIN")
        deleted = cleanup_previous(conn)
        print("清理上次导入：", deleted)

    minter = Minter(conn)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for factory, formula_id, record, path in records:
        components = record.get("components") or []
        if not components:
            stats["skipped"] += 1
            issues.append(f"{factory}/{formula_id} 无组分，跳过")
            continue
        normalized, original_sum = normalize_ratios(components, factory, issues)
        if not normalized:
            stats["skipped"] += 1
            issues.append(f"{factory}/{formula_id} 归一化后无有效组分，跳过")
            continue
        if abs(original_sum - 100) > 0.01:
            stats["ratio_rescaled"] += 1
            if len(stats["ratio_deviation"]) < 40:
                stats["ratio_deviation"].append(f"{factory}/{formula_id}: 原始和 {original_sum}")

        component_list = []
        for item in normalized:
            row = item["row"]
            material_name = s(row.get("material_name"))
            spec = s(row.get("spec"))
            size = s(row.get("particle_size"))
            identity = (factory, material_name, spec, size)
            base_name, resolved = resolve_base_name(material_name, spec, base_names, alias)
            if not resolved:
                unresolved.add(f"{factory}:{material_name}|{spec}")
                stats["unresolved_names"] += 1
            if identity not in material_ids:
                properties, custom = component_properties(row, issues)
                mc_id = minter.mint("mc_material", "mc_id", "MC")
                mp_id = minter.mint("mp_properties", "mp_id", "MP")
                meta = {"factory": factory, "material_name": material_name, "spec": spec,
                        "particle_size": size, "batch": s(row.get("batch")),
                        "source_file": path.name if path else "(ml_formula)",
                        "ratio_ref": item["ratio"], "orig_ratio_sum": original_sum}
                if args.apply:
                    conn.execute(
                        "INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time, is_delete) "
                        "VALUES (?,?,?,?,?,?,0)",
                        # 自定义属性必须内嵌进 v3 文档：界面 normalizePropertyDocument 的 v3 分支只读文档自身，
                        # 第二列（custom_properties）仅在旧式 {fixed: [...], custom: [...]} 结构下生效。
                        (mp_id, j(build_document(properties, custom)), j(custom), j([mc_id]), now, now))
                    conn.execute(
                        "INSERT INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, create_time, update_time, is_delete) "
                        "VALUES (?,?,?,?,0,?,?,0)",
                        (mc_id, f"{MC_BATCH_PREFIX}{factory}-{formula_id}", "其他",
                         j([[base_name, mp_id, j(meta), 100]]), now, now))
                material_ids[identity] = {"mc_id": mc_id, "mp_id": mp_id, "name": base_name, "meta": meta}
                stats["mc"] += 1
                stats["mp"] += 1
            info = material_ids[identity]
            component_list.append([info["name"], info["mc_id"], j(info["meta"]), item["ratio"]])

        test_document, stages = product_test_document(record, issues)
        formula = record.get("formula") or {}
        tp_id = None
        if test_document["properties"]:
            tp_id = minter.mint("tp_test_properties", "tp_id", "TP")
            if args.apply:
                conn.execute(
                    "INSERT INTO tp_test_properties (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time, is_delete) "
                    "VALUES (?,NULL,?,?,?,?,?,?,0)",
                    (tp_id,
                     j({"source_factory": factory, "formula_id": formula_id,
                        "test_stages": stages, "origin_file": path.name if path else "(ml_formula)",
                        "value_shape": "schemaVersion 3 物性文档；每条 product_test 一项测量（含温度；无工况者不带温度字段）"}),
                     j(test_document), "[]", f"{TP_COND_PREFIX}{factory}", now, now))
            stats["tp"] += 1

        mr_id = minter.mint("mr_formula", "mr_id", "MR")
        if args.apply:
            conn.execute(
                "INSERT INTO mr_formula (mr_id, formula_name, formula_type, batch_no, component_list, tp_ids, fe_ids, ru_ids, creator, create_time, update_time, is_delete) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,0)",
                (mr_id, f"{MR_NAME_PREFIX}{factory}-{formula_id}", "未分类", f"{MC_BATCH_PREFIX}{factory}",
                 j(component_list), j([tp_id] if tp_id else []), "[]", "[]",
                 f"{MR_CREATOR_PREFIX}{factory}", now, now))
            if tp_id:
                conn.execute("UPDATE tp_test_properties SET mr_ids=? WHERE tp_id=?", (j([mr_id]), tp_id))
        stats["mr"] += 1
        stats["formulas"] += 1
        if args.apply and stats["formulas"] % 200 == 0:
            conn.commit()
            print(f"  … 已写入 {stats['formulas']}/{len(records)}")

    if args.apply:
        conn.commit()

    print("\n=== 计划/结果 ===")
    print(json.dumps({k: v for k, v in stats.items() if k != "ratio_deviation"}, ensure_ascii=False, indent=2))
    print(f"未解析到注册表的材料名 {len(unresolved)} 个（前 10）：{sorted(unresolved)[:10]}")
    print(f"配比被归一（原始和≠100）的配方 {stats['ratio_rescaled']} 条（前 5）：{stats['ratio_deviation'][:5]}")
    print(f"提示类问题 {len(issues)} 条（前 6）：{issues[:6]}")
    print(f"[{'APPLY' if args.apply else 'DRY-RUN'}] db={args.db} source_root={args.source_root}")
    conn.close()


def cleanup_previous(conn):
    """删除上次由本脚本创建的行（标记约定），保证幂等。"""
    out = {}
    rows = conn.execute("SELECT tp_id FROM tp_test_properties WHERE test_condition LIKE ?", (TP_COND_PREFIX + "%",)).fetchall()
    for row in rows:
        conn.execute("DELETE FROM tp_test_properties WHERE tp_id=?", (row["tp_id"],))
    out["tp"] = len(rows)
    rows = conn.execute("SELECT mr_id FROM mr_formula WHERE creator LIKE ? OR formula_name LIKE ? OR batch_no LIKE ?",
                        (MR_CREATOR_PREFIX + "%", MR_NAME_PREFIX + "%", MC_BATCH_PREFIX + "%")).fetchall()
    for row in rows:
        conn.execute("DELETE FROM mr_formula WHERE mr_id=?", (row["mr_id"],))
    out["mr"] = len(rows)
    rows = conn.execute("SELECT mc_id FROM mc_material WHERE batch_no LIKE ?", (MC_BATCH_PREFIX + "%",)).fetchall()
    for row in rows:
        conn.execute("DELETE FROM mp_properties WHERE mc_ids LIKE ?", (f'%"{row["mc_id"]}"%',))
        conn.execute("DELETE FROM mc_material WHERE mc_id=?", (row["mc_id"],))
    out["mc"] = len(rows)
    return out


if __name__ == "__main__":
    main()
