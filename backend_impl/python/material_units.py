"""粒径表示转换与自检（S7）。

背景（见 docs/material-vocabulary-audit.md B8）：系统里粒径有三套表示——
  * 模型侧 / 知识表：`particle_size_min` / `particle_size_max`（mm，区间）
  * 入库副本（SQLite `ml_formula_component.component_features`）：`particle_size_mean` / `particle_size_std`
本模块给出两者之间的**确定性**换算并提出可复现的自检：

    mean = (min + max) / 2,  std = (max - min) / 2

用法：
  python3 backend_impl/python/material_units.py --selftest        # 用真实数据核对上式是否成立
  python3 backend_impl/python/material_units.py --selftest --limit 500
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
ML_DIR = REPO / "_ref/handover/ML"
DB_PATH = REPO / "backend_impl/data/sqlite/database.db"
TOL = 1e-6


def size_stats_from_range(min_mm, max_mm):
    """**纯数学**换算：区间 (min, max) → (mean, std)。任一为 None 时返回 (None, None)。

    注意：入库副本用的不是这个（见下 encode_size_stats）；本函数只作为数学定义与交叉参考。
    """
    if min_mm is None or max_mm is None:
        return None, None
    low, high = float(min_mm), float(max_mm)
    return (low + high) / 2.0, (high - low) / 2.0


def encode_size_stats(min_mm, max_mm):
    """按**入库副本的实际约定**编码：(min,max) → (mean, std)。

    实测（batch183 全量 1971 条，见 --selftest）：
      * mean = (min + max) / 2 —— 1971/1971 吻合；
      * min < max 时 std = (max - min) / 2 —— 1099/1099 吻合；
      * min == max（单值）时 std = min —— 872/872 吻合（把单值本身当作 std 存，而非 0）。
    """
    if min_mm is None or max_mm is None:
        return None, None
    low, high = float(min_mm), float(max_mm)
    mean = (low + high) / 2.0
    return mean, ((high - low) / 2.0 if high != low else low)


def decode_size_stats(mean, std):
    """按同一约定还原区间：(mean, std) → (min, max)，**并返回是否歧义**。

    ⚠️ 该编码**不是处处可逆**：`(min=0, max=X)` 与 `(min=max=X/2)` 都编码成 `(mean=std=X/2)`。
    实测 batch183 有 402/1971（20.4%）行落入此冲突 → 下界 0 已丢失，无法从 mean/std 还原。
    因此本函数返回 (min, max, ambiguous)：ambiguous=True 时 min/max 仅为“单值”解读。
    """
    if mean is None or std is None:
        return None, None, False
    center, spread = float(mean), float(std)
    if abs(spread - center) <= 1e-9:
        return center, center, True
    return center - spread, center + spread, False


def range_from_size_stats(mean, std):
    """(mean, std) → 区间 (min, max)；任一为 None 时返回 (None, None)。"""
    if mean is None or std is None:
        return None, None
    center, half = float(mean), float(std)
    return center - half, center + half


def _load_db_components(limit: int | None = None):
    if not DB_PATH.exists():
        return []
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        sql = ("SELECT dataset_source, recipe_id, comp_index, component_features "
               "FROM ml_formula_component")
        if limit:
            sql += f" LIMIT {int(limit)}"
        rows = []
        for source, recipe_id, comp_index, features in con.execute(sql):
            try:
                payload = json.loads(features)
            except (TypeError, json.JSONDecodeError):
                continue
            rows.append((str(source), str(recipe_id), int(float(comp_index)), payload))
        return rows
    finally:
        con.close()


def selftest(variant: str = "batch183", limit: int | None = None) -> dict:
    path = ML_DIR / f"{variant}.npy"
    if not path.exists():
        return {"error": f"缺少数据集 {path}"}
    data = np.load(path, allow_pickle=True).item()
    def to_float(value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return None if np.isnan(number) else number

    truth = {}
    for sample in data["samples"]:
        recipe_id = str(sample["recipe_id"])
        for index, row in enumerate(np.asarray(sample["X_comp"], dtype=object)):
            low, high = to_float(row[2]), to_float(row[3])
            if low is None or high is None:
                continue
            truth[(recipe_id, index)] = (low, high)

    total = 0
    mean_bad = []
    std_bad = []
    for source, recipe_id, comp_index, features in _load_db_components(limit):
        key = (recipe_id, comp_index)
        if key not in truth:
            continue
        low, high = truth[key]
        expect_mean, expect_std = encode_size_stats(low, high)
        got_mean = to_float(features.get("particle_size_mean"))
        got_std = to_float(features.get("particle_size_std"))
        if got_mean is None and got_std is None:
            continue
        total += 1
        if got_mean is None or expect_mean is None or abs(got_mean - expect_mean) > TOL:
            mean_bad.append((recipe_id, comp_index, low, high, got_mean, expect_mean))
        if got_std is None or expect_std is None or abs(got_std - expect_std) > TOL:
            std_bad.append((recipe_id, comp_index, low, high, got_std, expect_std))

    # 反向：区间 → (mean,std)[约定] → 区间；统计**不可逆**（下界 0 丢失）的行数
    roundtrip_bad = []
    ambiguous = []
    single_value = []
    for (low, high) in truth.values():
        mean, std = encode_size_stats(low, high)
        if mean is None:
            continue
        back_low, back_high, is_ambiguous = decode_size_stats(mean, std)
        if is_ambiguous:
            if low == 0.0 and high > 0.0:
                ambiguous.append((low, high, back_low, back_high))  # 下界 0 被丢失（真·不可逆）
            else:
                single_value.append((low, high))                    # 真·单值行（解码结果正确）
        elif abs(back_low - low) > TOL or abs(back_high - high) > TOL:
            roundtrip_bad.append((low, high, back_low, back_high))

    return {
        "variant": variant,
        "compared": total,
        "mean_mismatch": len(mean_bad),
        "std_mismatch": len(std_bad),
        "roundtrip_mismatch": len(roundtrip_bad),
        "single_value_rows": len(single_value),
        "lower_zero_lost_rows": len(ambiguous),
        "note": ("lower_zero_lost_rows = min==0 且 max>0 的行：与 (min=max=mean) 在该编码下完全冲突，"
                 "下界 0 已丢失、不可逆；single_value_rows = 真·单值行，解码结果正确"),
        "mean_mismatch_samples": mean_bad[:3],
        "std_mismatch_samples": std_bad[:3],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--variant", default="batch183")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    if not args.selftest:
        parser.error("目前只实现了 --selftest")
    result = selftest(args.variant, args.limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result.get("mean_mismatch") or result.get("std_mismatch") or result.get("roundtrip_mismatch") else 0


if __name__ == "__main__":
    raise SystemExit(main())
