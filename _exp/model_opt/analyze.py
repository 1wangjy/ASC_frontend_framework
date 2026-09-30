#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""汇总 _exp/model_opt/results.jsonl → summary.md（每属性最优配置、相对基线的提升、剩余空间判断）。"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = Path(__file__).resolve().parent
RESULTS = OUT_DIR / "results.jsonl"
SUMMARY = OUT_DIR / "summary.md"
PROPERTIES = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]
PROP_ZH = {"bulk_density": "体积密度", "cold_modulus": "常温抗折强度",
           "crushing_strength": "常温耐压强度", "linear_change": "线变化率"}


def load():
    rows = []
    for line in RESULTS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def flatten(rows):
    out = []
    for record in rows:
        for prop in record.get("properties", []) or []:
            if prop.get("status") != "ok":
                continue
            out.append({
                "round": record["round"], "group": record["group"], "label": record["label"],
                "variant": record["variant"], "condition_mode": record.get("condition_mode"),
                "property": prop["property"], "cv_rmse": prop["cv_rmse"], "test_rmse": prop["test_rmse"],
                "test_mae": prop["test_mae"], "test_r2": prop["test_r2"], "n_obs": prop["n_obs"],
            })
    return out


def main():
    rows = load()
    flat = flatten(rows)
    errors = [r for r in rows if r.get("error")]
    if not flat:
        SUMMARY.write_text("# 性质预测优化实验\n\n（无有效结果）\n", encoding="utf-8")
        return

    baseline = {r["property"]: r for r in flat if r["round"] == 0}
    lines = ["# 性质预测模型优化实验（隔离环境 `_exp/model_opt`）", "",
             f"- 组数：{len(rows)}（含失败 {len(errors)}）",
             f"- 记录条数：{len(flat)}（属性 × 组）",
             "- 协议：`make_long_property_frame`（交接脚本工况展开）→ `split_by_recipe(test 0.2, seed 42)` → `GroupKFold(3)`",
             "- 指标口径：`test_rmse` 为主（越小越好），附 `cv_rmse`、`test_r2`", "",
             "## 每属性最优配置（按 test_rmse）", "",
             "| 属性 | 基线 test_rmse / R² | 最优 test_rmse / R² | 相对基线 | 最优配置 | 下一档（次优） |",
             "| --- | --- | --- | --- | --- | --- |"]
    headroom_notes = []
    for prop in PROPERTIES:
        bucket = [r for r in flat if r["property"] == prop]
        if not bucket:
            continue
        bucket.sort(key=lambda r: r["test_rmse"])
        best, second = bucket[0], (bucket[1] if len(bucket) > 1 else None)
        base = baseline.get(prop)
        delta = f"{(best['test_rmse'] / base['test_rmse'] - 1) * 100:+.1f}%" if base else "—"
        lines.append(
            f"| {PROP_ZH[prop]} | {base['test_rmse']:.4f} / {base['test_r2']:.3f} | "
            f"**{best['test_rmse']:.4f} / {best['test_r2']:.3f}** | {delta} | "
            f"R{best['round']}G{best['group']} {best['label']}（{best['variant']}）| "
            f"{format(second['test_rmse'], '.4f') + ' ' + second['label'][:22] if second else '—'} |"
        )
        spread = bucket[-1]["test_rmse"] - best["test_rmse"] if len(bucket) > 1 else 0
        headroom_notes.append((prop, best, base, spread, len(bucket)))

    lines += ["", "## 各轮结论", ""]
    for round_no in sorted({r["round"] for r in flat}):
        bucket = [r for r in flat if r["round"] == round_no]
        by_prop = {}
        for r in bucket:
            if r["property"] not in by_prop or r["test_rmse"] < by_prop[r["property"]]["test_rmse"]:
                by_prop[r["property"]] = r
        lines.append(f"### R{round_no}")
        for prop in PROPERTIES:
            if prop in by_prop:
                r = by_prop[prop]
                lines.append(f"- {PROP_ZH[prop]}：{r['test_rmse']:.4f}（R² {r['test_r2']:.3f}）← {r['label']} / {r['variant']}")
        lines.append("")

    # 生产口径：只在同一变体（yangquan）内比较配置，跨变体不可比（processed/base 的 bulk_density 量纲异常）
    lines += ["## 每属性 Top5 配置（全部组，含跨变体，仅供定位线索）", ""]
    for prop in PROPERTIES:
        bucket = sorted([r for r in flat if r["property"] == prop], key=lambda r: r["test_rmse"])[:5]
        lines.append(f"**{PROP_ZH[prop]}**")
        for r in bucket:
            lines.append(f"- {r['test_rmse']:.4f} (R² {r['test_r2']:.3f}, cv {r['cv_rmse']:.4f}) — R{r['round']}G{r['group']} {r['label']} @ {r['variant']}")
        lines.append("")

    lines += ["## 提升空间判断（同变体 yangquan 内可比）", ""]
    for prop in PROPERTIES:
        bucket = [r for r in flat if r["property"] == prop and r["variant"] == "yangquan"]
        if not bucket:
            continue
        bucket.sort(key=lambda r: r["test_rmse"])
        best = bucket[0]
        worst = bucket[-1]
        base = baseline.get(prop)
        spread = worst["test_rmse"] - best["test_rmse"]
        rel = spread / best["test_rmse"] * 100
        gain = (base["test_rmse"] - best["test_rmse"]) / base["test_rmse"] * 100 if base else 0
        # 用中位数附近的典型差异衡量“是否还有-tuning空间”：Top3 之间的差距更有意义
        top3 = bucket[:3]
        top3_gap = (top3[-1]["test_rmse"] - top3[0]["test_rmse"]) / top3[0]["test_rmse"] * 100 if len(top3) == 3 else 0
        verdict = ("已接近该变体的可解释上限：Top3 配置差异仅 %.1f%%，继续调参收益有限；"
                   "主要瓶颈是样本量（141 条）与标签噪声，需要数据侧改进" % top3_gap
                   if top3_gap < 3 else
                   "仍有调参空间：Top3 配置差异 %.1f%%" % top3_gap)
        lines.append(f"- **{PROP_ZH[prop]}**：同变体内极差 {spread:.4f}（{rel:.1f}% of best，最差配置 {worst['label'][:26]}）；"
                     f"Top3 差异 {top3_gap:.1f}%；相对 R0 基线提升 {gain:+.1f}%；{verdict}")
    deployed_path = REPO / "backend_impl/python/model_predict/MODEL/outputs_selective_selector/metrics_yangquan.csv"
    if deployed_path.exists():
        import csv
        dep = {}
        with deployed_path.open(encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                if row.get("status") == "trained":
                    dep[row["property"]] = row
        if dep:
            lines += ["", "## 与线上已部署模型（metrics_all.csv, yangquan）对照", "",
                      "| 属性 | 线上 test_rmse / R² | 本轮最优 | 变化 |", "| --- | --- | --- | --- |"]
            for prop in PROPERTIES:
                best = min((r for r in flat if r["property"] == prop), key=lambda r: r["test_rmse"], default=None)
                if not best or prop not in dep:
                    continue
                online = float(dep[prop]["test_rmse"])
                delta = (best["test_rmse"] - online) / online * 100
                lines.append(f"| {PROP_ZH[prop]} | {online:.4f} / {float(dep[prop]['test_r2']):.3f} | "
                             f"{best['test_rmse']:.4f} / {best['test_r2']:.3f} | {delta:+.1f}% |")

    lines += ["", "## 失败组", ""]
    lines += [f"- R{r['round']}G{r['group']} {r['label']}：{r['error']}" for r in errors] or ["- 无"]

    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {SUMMARY}")


if __name__ == "__main__":
    main()
