"""汇总抗折实验（results_cold.jsonl + results_verify_cold.jsonl）→ summary_cold.md。"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
RESULTS = OUT_DIR / "results_cold.jsonl"
VERIFY = OUT_DIR / "results_verify_cold.jsonl"
SUMMARY = OUT_DIR / "summary_cold.md"
TARGET_R2 = 0.85
ROUND_ZH = {
    1: "R1 标签聚合与重复测量利用",
    2: "R2 工况对齐与条件化建模",
    3: "R3 特征清理/插补/选择",
    4: "R4 目标变换与样本加权",
    5: "R5 抗折专用模型",
    6: "R6 组合（赢家叠加）",
    7: "R7 组合细化",
}


def load(path: Path, keys=("group", "label")):
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    latest = {}
    for row in rows:
        latest[tuple(row.get(k) for k in keys) + (row.get("seed"),)] = row
    return [latest[k] for k in sorted(latest, key=lambda k: [str(x) for x in k])]


def main():
    records = [r for r in load(RESULTS) if r.get("status") == "ok"]
    lines = ["# 常温抗折强度（cold_modulus）R² 提升实验（隔离环境 `_exp/cold`）", "",
             f"- 目标：test R² ≥ **{TARGET_R2}**",
             f"- 组数：{len(records)}（另有多种子验证）",
             "- 协议：yangquan → `split_by_recipe(test 0.2, seed 42)` → `GroupKFold(3)`；模型默认 ExtraTrees(300)（= 线上同类基线）",
             "- 指标：`test_R2`（留出集）+ `oof_R2`（训练集内 3 折 out-of-fold，抗过拟合参考）", ""]

    records.sort(key=lambda r: r["test_r2"], reverse=True)
    lines += ["## 达标情况", ""]
    hits = [r for r in records if r["test_r2"] >= TARGET_R2]
    lines.append(f"- 达到 R² ≥ {TARGET_R2} 的配置：**{len(hits)} 个**" + ("" if hits else "（尚未达标）"))
    best = records[0] if records else None
    if best:
        lines += ["", f"- 单切分最佳：R² **{best['test_r2']:.4f}**（OOF R² {best['oof_r2']:.4f}）← `{best['label']}`", ""]

    lines += ["## Top 10（按 test R²）", "", "| # | 配置 | test R² | OOF R² | RMSE | n |", "| --- | --- | --- | --- | --- | --- |"]
    for index, row in enumerate(records[:10], 1):
        lines.append(f"| {index} | {row['label']} | **{row['test_r2']:.4f}** | {row['oof_r2']:.4f} | "
                     f"{row['test_rmse']:.4f} | {row['n_obs']} |")

    lines += ["", "## 各轮最优", ""]
    for round_no in sorted({int(r["label"].split()[0][1:]) for r in records if r["label"].startswith("R")}):
        bucket = [r for r in records if r["label"].startswith(f"R{round_no} ")]
        if not bucket:
            continue
        row = max(bucket, key=lambda r: r["test_r2"])
        lines.append(f"- **{ROUND_ZH.get(round_no, f'R{round_no}')}**：{row['test_r2']:.4f}（OOF {row['oof_r2']:.4f}）← {row['label']}")

    lines += ["", "## 全部组（按轮次）", ""]
    for round_no in sorted({int(r["label"].split()[0][1:]) for r in records if r["label"].startswith("R")}):
        lines.append(f"### {ROUND_ZH.get(round_no, f'R{round_no}')}")
        for row in sorted([r for r in records if r["label"].startswith(f"R{round_no} ")], key=lambda r: r["group"]):
            flag = " ✅" if row["test_r2"] >= TARGET_R2 else ""
            lines.append(f"- G{row['group']} {row['label'].split(' ', 1)[1]:46s} test {row['test_r2']:.4f} | oof {row['oof_r2']:.4f}{flag}")
        lines.append("")

    verify = load(VERIFY, keys=("group", "label"))
    if verify:
        lines += ["## 多种子稳健性验证（种子 42/7/2024/1234/99）", "",
                  "单一切分噪声极大，达标必须以多切分均值为准。", "",
                  "| 配置 | test R² 均值±std | OOF R² 均值±std | 最小 test R² |", "| --- | --- | --- | --- |"]
        by_label = {}
        for row in verify:
            if row.get("status") != "ok":
                continue
            by_label.setdefault(row["label"], []).append(row)
        for label, rows in by_label.items():
            tests = [r["test_r2"] for r in rows]
            oofs = [r["oof_r2"] for r in rows]
            lines.append(f"| {label} | {statistics.mean(tests):.4f} ± {statistics.pstdev(tests):.4f} | "
                         f"{statistics.mean(oofs):.4f} ± {statistics.pstdev(oofs):.4f} | {min(tests):.4f} |")

    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {SUMMARY}")


if __name__ == "__main__":
    main()
