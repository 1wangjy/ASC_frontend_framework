"""ML 数据集 → 配方文本解析 → X_comp → 预测模型 的端到端链测试（独立环境）。

做法（闭环，带真值）：
  1. 从 `_ref/handover/ML/*.npy` 取真实样本，把 X_comp 的每行**渲染成自然语言配方文本**，
     粒径按不同写法交替渲染（目数 / μm / mm 区间 / ≤上界 / 类别词后缀），以检验解析器能否覆盖各种标注。
  2. 调用 Node 解析器（`_exp/chain/bin/parse-cli.js`）解析文本 → 规范组分。
  3. 与真值逐项比对：material_id(baseid)、ratio_pct、particle_size_min/max。
  4. 组装三种 X_comp 送入真实推理服务 `/api/v1/predict/simple`，与样本 `y_labels` 真值比 RMSE：
       A 仅文本可推导列（material_id/ratio/粒径/base，其余补 null）
       B 文本列 + 数据集实测列（PC/化学等，用于隔离"粒径缺失"的影响）
       C 旧链路等价：只发 [material_id, ratio_pct]（现有 predictFormulaService 的做法）
  这一步量化"粒径解析与列贯通"到底值多少精度。

用法：
  python _exp/chain/chain.py --variant yangquan --samples 20
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import urllib.request
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
CHAIN = Path(__file__).resolve().parent
ML = REPO / "_ref/handover/ML"
FEATURE_OUT = REPO / "backend_impl/python/model_predict/FEATURE/outputs"
MODEL_DIR = REPO / "backend_impl/python/model_predict/MODEL/outputs_selective_selector"
API = os.environ.get("MODEL_API_URL", "http://127.0.0.1:8100")
PROPERTIES = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]

MESH_INV = {0.075: 200, 0.045: 325, 0.038: 400, 0.08: 180, 0.09: 170, 0.106: 140, 0.15: 100, 0.18: 80,
            0.2: 75, 0.25: 60, 0.3: 50, 0.355: 45, 0.425: 40, 0.5: 35, 0.6: 30, 0.85: 20, 1.0: 18,
            2.0: 10, 2.36: 8, 4.0: 5, 4.75: 4, 5.6: 3.5}


def load_samples(variant: str):
    data = np.load(ML / f"{variant}.npy", allow_pickle=True).item()
    return data


def component_names(variant: str) -> list[str]:
    meta = json.loads((FEATURE_OUT / f"metadata_{variant}.json").read_text(encoding="utf-8"))
    return list(meta["component_feature_names"])


def global_names(variant: str) -> list[str]:
    meta = json.loads((FEATURE_OUT / f"metadata_{variant}.json").read_text(encoding="utf-8"))
    return list(meta.get("global_feature_names", []))


def render_size(lo, hi, style: int) -> str:
    """把 (min_mm, max_mm) 渲染成不同写法的粒度标注；返回 '' 表示不写规格。"""
    try:
        lo = float(lo)
        hi = float(hi)
    except (TypeError, ValueError):
        return ""
    if math.isnan(lo) and math.isnan(hi):
        return ""
    if math.isnan(lo):
        lo = hi
    if math.isnan(hi):
        hi = lo
    if lo == hi:
        if lo in MESH_INV and style % 2 == 0:
            return f"{MESH_INV[lo]}目"
        if lo < 0.1:
            return f"{lo * 1000:g}μm"
        return f"{lo:g}mm"
    if lo == 0:
        return f"≤{hi:g}mm"
    if style % 3 == 0:
        return f"{hi:g}-{lo:g}mm"
    if style % 3 == 1:
        return f"{lo:g}~{hi:g}mm"
    return f"{lo:g}mm-{hi:g}mm"


CLASS_SUFFIX = {0: "", 1: "细粉", 2: "骨料", 3: "微粉"}


def render_recipe(sample, names, style_seed: int) -> tuple[str, list[dict]]:
    """X_comp → 自然语言配方文本；同时返回每行真值供比对。"""
    lines = []
    truth = []
    x_comp = np.asarray(sample["X_comp"], dtype=object)
    for index, row in enumerate(x_comp):
        style = (style_seed + index) % 4
        material_id = row[names.index("material_id")]
        ratio = row[names.index("ratio_pct")]
        lo = row[names.index("particle_size_min")]
        hi = row[names.index("particle_size_max")]
        base = row[names.index("base")]
        size_text = render_size(lo, hi, style)
        suffix = CLASS_SUFFIX[(style_seed + index) % 4]
        name_text = f"{size_text}{base}{suffix}" if style % 2 == 0 else f"{base}{suffix} {size_text}"
        ratio_text = ""
        try:
            if not (isinstance(ratio, float) and math.isnan(ratio)):
                ratio_text = f" {float(ratio):g}%"
        except (TypeError, ValueError):
            ratio_text = ""
        lines.append(f"{name_text.strip()}{ratio_text}".strip())
        truth.append({
            "material_id": str(int(material_id)) if material_id is not None and str(material_id) != "nan" else None,
            "ratio_pct": None if ratio is None or (isinstance(ratio, float) and math.isnan(ratio)) else float(ratio),
            "size_min": None if lo is None or (isinstance(lo, float) and math.isnan(lo)) else float(lo),
            "size_max": None if hi is None or (isinstance(hi, float) and math.isnan(hi)) else float(hi),
            "base": str(base),
            "size_text": size_text,
            "line": lines[-1],
        })
    return "\n".join(lines), truth


def run_parser(text: str, names: list[str], global_fields: dict) -> dict:
    payload = json.dumps({"text": text, "mode": "xcomp", "componentFeatureNames": names,
                          "globalFields": global_fields}, ensure_ascii=False)
    proc = subprocess.run(["node", str(CHAIN / "bin/parse-cli.js")], input=payload,
                          capture_output=True, text=True, cwd=str(REPO), timeout=120)
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(f"解析器失败: {proc.stderr[:400]}")
    return json.loads(proc.stdout)


def predict(x_comp: list[list], x_global: list, conditions: list[str], variant: str) -> dict:
    body = json.dumps({"X_comp": x_comp, "X_global": x_global, "conditions": conditions,
                       "properties": PROPERTIES, "variant": variant}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(f"{API}/api/v1/predict/simple", data=body,
                                     headers={"Content-Type": "application/json"})
    api_key = os.environ.get("MODEL_API_KEY")
    if api_key:
        request.add_header("X-API-Key", api_key)
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def truth_labels(sample) -> dict[tuple[str, str], float]:
    """y_labels: {property: {condition: '3.15/3.18/3.16/3.19'}} → {(property, condition): 均值}。"""
    result = {}
    for prop, conditions in (sample.get("y_labels") or {}).items():
        if not isinstance(conditions, dict):
            continue
        for condition, raw in conditions.items():
            values = []
            for token in str(raw).replace("，", "/").split("/"):
                token = token.strip()
                try:
                    values.append(float(token))
                except ValueError:
                    continue
            if values:
                result[(prop, condition)] = sum(values) / len(values)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", default="yangquan")
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    data = load_samples(args.variant)
    names = component_names(args.variant)
    gnames = global_names(args.variant)
    samples = data["samples"]
    rng = np.random.default_rng(args.seed)
    picked = [samples[i] for i in rng.choice(len(samples), size=min(args.samples, len(samples)), replace=False)]

    stats = {"rows": 0, "material_id_ok": 0, "ratio_ok": 0, "size_min_ok": 0, "size_max_ok": 0, "size_present": 0,
             "size_truth_present": 0, "size_absent_when_truth_present": 0, "components_ok": 0, "samples_ok": 0}
    per_sample = []
    err = {"A": [], "B": [], "C": [], "D": []}
    mismatches_all = []

    for sample in picked:
        text, truth = render_recipe(sample, names, style_seed=int(sample["recipe_id"][-1], 36) if sample.get("recipe_id") else 0)
        global_fields = {}
        x_global_raw = list(np.asarray(sample["X_global"], dtype=object))
        for index, name in enumerate(gnames):
            if index < len(x_global_raw):
                value = x_global_raw[index]
                try:
                    value = float(value)
                    if not math.isnan(value):
                        global_fields[name] = value
                except (TypeError, ValueError):
                    pass
        parsed = run_parser(text, names, global_fields)
        if parsed.get("error"):
            raise RuntimeError(f"解析错误: {parsed['error']}")

        # 逐行解析：得到与真值行一一对应的解析结果（避免整段解析时下标漂移）
        per_line = []
        for item in truth:
            line_result = run_parser(item["line"], names, global_fields)
            candidates = line_result.get("components") or []
            per_line.append(candidates[0] if len(candidates) == 1 else (candidates if candidates else None))
        components = per_line
        matched_rows = 0
        mismatches = []
        for index, target in enumerate(truth):
            stats["rows"] += 1
            stats["size_truth_present"] += 0 if target["size_min"] is None else 1
            got = components[index]
            if isinstance(got, list) or not got:
                mismatches.append({"line": target["line"], "reason": "ambiguous_or_unmatched" if isinstance(got, list) else "unmatched",
                                   "expect_base": target["base"], "expect_size": target["size_text"]})
                continue
            matched_rows += 1
            if str(got["materialId"]) != str(target["material_id"]):
                mismatches.append({"line": target["line"], "reason": "base_mismatch", "expect": target["material_id"],
                                   "got": got["materialId"], "expect_base": target["base"], "got_base": got["baseName"],
                                   "expect_size": target["size_text"]})
            if str(got["materialId"]) == str(target["material_id"]):
                stats["material_id_ok"] += 1
            if target["ratio_pct"] is None or (got.get("ratioPct") is not None and abs(got["ratioPct"] - target["ratio_pct"]) <= 0.01):
                stats["ratio_ok"] += 1
            size = got.get("particleSize") or {}
            if target["size_min"] is not None:
                if size.get("minMm") is not None and abs(size["minMm"] - target["size_min"]) <= max(0.002, target["size_min"] * 0.02):
                    stats["size_min_ok"] += 1
                else:
                    stats["size_absent_when_truth_present"] += 1
            if target["size_max"] is not None and size.get("maxMm") is not None and abs(size["maxMm"] - target["size_max"]) <= max(0.002, target["size_max"] * 0.02):
                stats["size_max_ok"] += 1
            if size.get("minMm") is not None or size.get("maxMm") is not None:
                stats["size_present"] += 1
        empty_rows = [item for index, item in enumerate(components) if isinstance(item, list) or not item]
        if not empty_rows:
            stats["components_ok"] += len(truth)

        # ── 组装三种 X_comp 并预测 ──
        raw_rows = [list(row) for row in np.asarray(sample["X_comp"], dtype=object)]
        rows_a, rows_b, rows_c, rows_d = [], [], [], []
        for index, raw in enumerate(raw_rows):
            got = components[index] if index < len(components) else None
            derived = {
                "material_id": int(got["materialId"]) if got and got.get("materialId") is not None else None,
                "ratio_pct": got.get("ratioPct") if got else None,
                "particle_size_min": (got.get("particleSize") or {}).get("minMm") if got else None,
                "particle_size_max": (got.get("particleSize") or {}).get("maxMm") if got else None,
                "base": got.get("baseName") if got else None,
            }
            row_a = []
            row_b = []
            for position, name in enumerate(names):
                if name in derived:
                    row_a.append(derived[name])
                    row_b.append(derived[name])
                else:
                    row_a.append(None)
                    row_b.append(None if raw[position] is None or (isinstance(raw[position], float) and math.isnan(raw[position])) else raw[position])
            rows_a.append(row_a)
            rows_b.append(row_b)
            rows_c.append([derived["material_id"], derived["ratio_pct"]])
            rows_d.append([None if value is None or (isinstance(value, float) and math.isnan(value)) else value for value in raw])
        x_global = [global_fields.get(name) for name in gnames]
        conditions = sorted({condition for _prop, condition in truth_labels(sample)})
        if not conditions:
            continue
        labels = truth_labels(sample)
        try:
            preds = predict(rows_a, x_global, conditions, args.variant)
            preds_b = predict(rows_b, x_global, conditions, args.variant)
            preds_c = predict(rows_c, x_global, conditions, args.variant)
            preds_d = predict(rows_d, x_global, conditions, args.variant)
        except Exception as exc:  # noqa: BLE001
            print(f"  预测失败 {sample.get('recipe_id')}: {exc}")
            continue
        for key, response in (("A", preds), ("B", preds_b), ("C", preds_c), ("D", preds_d)):
            for item in response.get("predictions") or []:
                label = labels.get((item["property"], item["condition"]))
                if label is not None and item.get("value") is not None:
                    err[key].append((item["property"], item["value"] - label))
        mismatches_all.extend([{**item, "recipe_id": sample.get("recipe_id")} for item in mismatches])
        per_sample.append({
            "recipe_id": sample.get("recipe_id"),
            "mismatches": len(mismatches),
            "rows": len(truth),
            "components_parsed": len(components),
            "size_written": sum(1 for item in truth if item["size_text"]),
        })
        stats["samples_ok"] += 1

    def rmse(values):
        return float(np.sqrt(np.mean(np.square(values)))) if values else None

    def per_property(key):
        out = {}
        for prop in PROPERTIES:
            values = [delta for name, delta in err[key] if name == prop]
            if values:
                out[prop] = {"n": len(values), "rmse": round(rmse(values), 4),
                             "mae": round(float(np.mean(np.abs(values))), 4)}
        return out

    by_prop = {key: per_property(key) for key in ("A", "B", "C", "D")}

    def normalized(key):
        """相对 D（原始行）的误差比：>1 表示比原始输入更差。"""
        ratios = {}
        for prop in PROPERTIES:
            base = by_prop["D"].get(prop, {}).get("rmse")
            current = by_prop[key].get(prop, {}).get("rmse")
            if base and current and base > 1e-9:
                ratios[prop] = round(current / base, 3)
        return ratios

    summary = {
        "variant": args.variant,
        "samples": len(picked),
        "samples_ok": stats["samples_ok"],
        "rows": stats["rows"],
        "parsing": {
            "material_id_accuracy": round(stats["material_id_ok"] / stats["rows"], 4) if stats["rows"] else None,
            "ratio_accuracy": round(stats["ratio_ok"] / stats["rows"], 4) if stats["rows"] else None,
            "particle_size_min_accuracy": round(stats["size_min_ok"] / max(1, stats["size_truth_present"]), 4),
            "particle_size_max_accuracy": round(stats["size_max_ok"] / max(1, stats["size_truth_present"]), 4),
            "particle_size_recall": round(stats["size_present"] / max(1, stats["size_truth_present"]), 4),
            "rows_truth_with_size": stats["size_truth_present"],
            "size_lost_rows": stats["size_absent_when_truth_present"],
            "all_rows_parsed": stats["components_ok"],
        },
        "prediction_rmse_by_path": by_prop,
        "error_ratio_vs_D": {key: normalized(key) for key in ("A", "B", "C")},
        "n_predictions": {key: len(value) for key, value in err.items()},
    }
    out = CHAIN / "out" / f"chain_{args.variant}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "samples": per_sample, "mismatches": mismatches_all},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"-> {out}")


if __name__ == "__main__":
    main()
