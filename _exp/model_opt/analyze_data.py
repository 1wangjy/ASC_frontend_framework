"""汇总数据侧的 5 轮 × 8 组实验（读 results_data.jsonl），并与模型侧结果交叉对照。"""
from __future__ import annotations

import collections
import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
DATA_RESULTS = OUT_DIR / "results_data.jsonl"
VERIFY_RESULTS = OUT_DIR / "results_verify.jsonl"
MODEL_RESULTS = OUT_DIR / "results.jsonl"
SUMMARY = OUT_DIR / "summary_data.md"

PROPERTIES = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]
PROP_ZH = {"bulk_density": "体积密度", "cold_modulus": "常温抗折强度",
           "crushing_strength": "常温耐压强度", "linear_change": "线变化率"}
ROUND_ZH = {1: "R1 单位/量纲与物理约束", 2: "R2 缺失与列清理", 3: "R3 数据源与合并",
            4: "R4 条件粒度与标签聚合", 5: "R5 清洗×数据规模×模型"}


def load_dedup(path: Path, key=("round", "group")):
    """按 key 去重保留最后一条（同一组重复运行时以最后一次为准）。"""
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    latest = {}
    for record in rows:
        latest[tuple(record.get(field) for field in key)] = record
    return [latest[key] for key in sorted(latest)]


def flatten(records):
    out = []
    for record in records:
        for prop in record.get("properties") or []:
            if prop.get("status") != "ok":
                continue
            out.append({**prop, "round": record["round"], "group": record["group"],
                        "label": record["label"], "variant": record["variant"],
                        "spec": record.get("spec", {})})
    return out


def fmt(value, digits=4):
    return f"{value:.{digits}f}"


def main():
    data_records = load_dedup(DATA_RESULTS)
    model_records = load_dedup(MODEL_RESULTS)
    data_flat = flatten(data_records)
    model_flat = flatten(model_records)

    lines = ["# 数据处理/清洗实验（隔离环境 `_exp/model_opt`）", ""]
    lines += [f"- 组数：{len(data_records)}（失败 {sum(1 for r in data_records if r.get('error'))}）",
              f"- 记录条数：{len(data_flat)}（属性 × 组）",
              "- 协议与模型侧一致：`make_long_property_frame` → `split_by_recipe(test 0.2, seed 42)` → `GroupKFold(3)`；",
              "- 模型固定为模型侧选出的每属性最优（bulk: LGBM+SelectFromModel(1.5*mean)；cold/linear: ExtraTrees；crushing: XGBoost），",
              "  因此每组差异只来自**数据处理**。", ""]

    baseline = {row["property"]: row for row in data_flat if row["round"] == 1 and row["group"] == 0}
    model_best = {}
    for row in model_flat:
        if row["property"] not in model_best or row["test_rmse"] < model_best[row["property"]]["test_rmse"]:
            model_best[row["property"]] = row

    lines += ["## 每属性最优数据处理（相对「无清洗」基线 R1G0）", "",
              "| 属性 | 无清洗基线 | 最优清洗 | 变化 | 最优组 |", "| --- | --- | --- | --- | --- |"]
    for prop in PROPERTIES:
        base = baseline.get(prop)
        bucket = sorted((row for row in data_flat if row["property"] == prop), key=lambda r: r["test_rmse"])
        if not base or not bucket:
            continue
        best = bucket[0]
        delta = (best["test_rmse"] - base["test_rmse"]) / base["test_rmse"] * 100
        lines.append(f"| {PROP_ZH[prop]} | {fmt(base['test_rmse'])} / {fmt(base['test_r2'], 3)} | "
                     f"**{fmt(best['test_rmse'])}** / {fmt(best['test_r2'], 3)} | {delta:+.1f}% | "
                     f"R{best['round']}G{best['group']} {best['label']}（{best['variant']}）|")

    lines += ["", "## 每属性 Top5 数据配置", ""]
    for prop in PROPERTIES:
        bucket = sorted((row for row in data_flat if row["property"] == prop), key=lambda r: r["test_rmse"])[:5]
        lines.append(f"**{PROP_ZH[prop]}**")
        for row in bucket:
            lines.append(f"- {fmt(row['test_rmse'])} (R² {fmt(row['test_r2'], 3)}, cv {fmt(row['cv_rmse'])}, "
                         f"n={row['n_obs']}, feats={row.get('n_features')}) — R{row['round']}G{row['group']} "
                         f"{row['label']}（{row['variant']}）")
        lines.append("")

    lines += ["## 各轮最优（每属性）", ""]
    for round_no in sorted({row["round"] for row in data_flat}):
        lines.append(f"### {ROUND_ZH.get(round_no, f'R{round_no}')}")
        for prop in PROPERTIES:
            bucket = [row for row in data_flat if row["round"] == round_no and row["property"] == prop]
            if not bucket:
                continue
            best = min(bucket, key=lambda r: r["test_rmse"])
            worst = max(bucket, key=lambda r: r["test_rmse"])
            spread = (worst["test_rmse"] - best["test_rmse"]) / best["test_rmse"] * 100
            lines.append(f"- {PROP_ZH[prop]}：{fmt(best['test_rmse'])}（R² {fmt(best['test_r2'], 3)}）"
                         f" ← R{best['round']}G{best['group']} {best['label']}（{best['variant']}）"
                         f"｜轮内极差 {spread:.1f}%")
        lines.append("")

    lines += ["## 关键结论：量纲修复在宽数据集上的效果", "",
              "| 数据源 | 属性 | 无修复（模型侧 R5 同源行） | 修复后 |", "| --- | --- | --- | --- |"]
    for variant, prop in [("processed", "bulk_density"), ("fill", "bulk_density"), ("base", "bulk_density"),
                          ("zibo", "bulk_density")]:
        old = next((row for row in model_flat if row["variant"] == variant and row["property"] == prop), None)
        new = next((row for row in data_flat if row["variant"] == variant and row["property"] == prop
                    and row["spec"].get("bulk_scale")), None)
        if old and new:
            lines.append(f"| {variant} | {PROP_ZH[prop]} | {fmt(old['test_rmse'], 2)} | "
                         f"**{fmt(new['test_rmse'])}** |")

    lines += ["", "## 与模型侧最优的叠加情况", "",
              "| 属性 | 模型侧最优（无清洗） | 数据侧最优（固定模型） | 数据+模型叠加最佳 |", "| --- | --- | --- | --- |"]
    for prop in PROPERTIES:
        mb = model_best.get(prop)
        db = min((row for row in data_flat if row["property"] == prop), key=lambda r: r["test_rmse"], default=None)
        both = min([row for row in data_flat if row["property"] == prop], key=lambda r: r["test_rmse"], default=None)
        if mb and db and both:
            lines.append(f"| {PROP_ZH[prop]} | {fmt(mb['test_rmse'])} | {fmt(db['test_rmse'])} | "
                         f"{fmt(both['test_rmse'])}（R{both['round']}G{both['group']}）|")

    verify_records = load_dedup(VERIFY_RESULTS, key=("round", "group", "seed"))
    if verify_records:
        import statistics
        lines += ["", "## 多种子稳健性验证（5 个切分种子，均值 ± std）",
                  "",
                  "单一种子的 test_rmse 噪声很大（同一配置在不同切分下可差 2 倍），因此用多切分均值判断清洗是否真的有效。",
                  "",
                  "| 属性 | 无清洗 | 组合清洗 | 按属性清洗 | 组合−基线 | 按属性−基线 |",
                  "| --- | --- | --- | --- | --- | --- |"]
        by_label = {}
        for record in verify_records:
            by_label.setdefault(record["label"], {}).setdefault(record["seed"], {}).update(
                {p["property"]: p["test_rmse"] for p in record["properties"] if p.get("status") == "ok"})
        labels = sorted(by_label)
        for prop in PROPERTIES:
            stats = {}
            for label in labels:
                values = [seeds[prop] for seeds in by_label[label].values() if prop in seeds]
                stats[label] = (statistics.mean(values), statistics.pstdev(values), len(values)) if values else None
            base = next((stats[label] for label in labels if "baseline" in label), None)
            combo = next((stats[label] for label in labels if "组合" in label), None)
            perprop = next((stats[label] for label in labels if "按属性" in label), None)
            if not (base and combo and perprop):
                continue
            lines.append(f"| {PROP_ZH[prop]} | {base[0]:.4f} ± {base[1]:.4f} | {combo[0]:.4f} ± {combo[1]:.4f} | "
                         f"{perprop[0]:.4f} ± {perprop[1]:.4f} | "
                         f"{(combo[0] - base[0]) / base[0] * 100:+.1f}% | "
                         f"{(perprop[0] - base[0]) / base[0] * 100:+.1f}% |")
        lines += ["", "（每个配置在种子 42/7/2024/1234/99 上各跑一次，取均值；std 为总体标准差，反映切分敏感性。）"]

    lines += ["", "## 失败组", ""]
    failed = [f"R{r['round']}G{r['group']} {r['label']}: {r.get('error')}"
              for r in data_records if r.get("error")]
    lines += [f"- {item}" for item in failed] or ["- 无"]

    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {SUMMARY}")


if __name__ == "__main__":
    main()
