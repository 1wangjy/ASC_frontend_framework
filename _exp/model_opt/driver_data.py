"""数据清理/处理侧的 5 轮 × 8 组实验（隔离环境）。

与 `driver.py`（模型侧）保持同一评测协议，因此结果可比：
  handover 工况展开 → split_by_recipe(test 0.2, seed 42) → GroupKFold(3)，主指标 test_rmse。

模型固定为模型侧实验选出的每属性最优配置（bulk: LGBM+SelectFromModel(1.5*mean)；
cold/linear: ExtraTrees；crushing: XGBoost），使每组的差异只来自数据处理。

由数据勘察（见提交信息）驱动的清洗杠杆：
  - `bulk_density__*` 存在 kg/m³ 与 g/cm³ 混用（min 2106 / med 3026）：>100 的值 → /1000
  - `linear_change__1450_1500` 在 base 变体是分数（0.0007~0.005）：p99 < 0.05 的列 → ×100
  - `crushing_strength__*` 有越界值（base 最大 176，物理上限 108.65）→ 钳制或丢弃
  - 全缺列 12–90 个、>50% 缺列 47 个 → 列清理与缺失指示
  - 多个数据源可合并（yangquan 141 / processed 780 / zibo 457 ...）→ 统一单位后合并
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import driver as D  # noqa: E402

from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor  # noqa: E402
from sklearn.experimental import enable_iterative_imputer  # noqa: F401,E402
from sklearn.feature_selection import SelectFromModel  # noqa: E402
from sklearn.impute import IterativeImputer, KNNImputer, SimpleImputer  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402

H = D.H
PROPERTIES = D.PROPERTIES
RESULTS = D.OUT_DIR / "results_data.jsonl"

# 物理约束（交接文档给的上限）
CRUSH_MIN, CRUSH_MAX = 18.65, 108.65


# ───────────────────────── 模型（固定为模型侧最优） ─────────────────────────

def best_model(property_name: str):
    """模型侧实验中每属性的最优配置（用于让数据侧差异可见）。"""
    if property_name == "bulk_density":
        from lightgbm import LGBMRegressor
        return D.make_pipeline(LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1),
                               select=D.select_from("lightgbm", "1.5*mean"))
    if property_name == "crushing_strength":
        return D.model_zoo("xgboost", {})
    return D.model_zoo("extra_trees", {"n_estimators": 300})


def make_pipeline(model, impute="median"):
    steps = []
    if impute == "knn":
        steps.append(("imputer", KNNImputer(n_neighbors=5)))
    elif impute == "iterative":
        steps.append(("imputer", IterativeImputer(random_state=D.SEED, max_iter=10)))
    elif impute is None:
        pass
    else:
        steps.append(("imputer", SimpleImputer(strategy=impute, keep_empty_features=True)))
    steps.append(("model", model))
    return Pipeline(steps)


def factory_default(property_name: str):
    if property_name == "bulk_density":
        from lightgbm import LGBMRegressor
        return make_pipeline(LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1), "median")
    return make_pipeline(ExtraTreesRegressor(n_estimators=300, random_state=D.SEED, n_jobs=-1), "median")


# ───────────────────────── 清洗算子 ─────────────────────────

DEFAULT_SPEC = dict(
    bulk_scale=False,      # bulk_density > 100 → /1000
    linear_scale=False,    # linear_change 列 p99 < 0.05 → ×100
    clamp=False,           # crushing_strength 钳制到 [18.65, 108.65]
    drop_oob=False,        # 丢弃 crushing_strength 越界行
    drop_all_nan=False,    # 删除全缺列
    drop_high_missing=None,  # 删除缺失率 > x 的列
    add_missing_ind=False,   # 缺失指示列
    drop_pc=None,            # 删除 PC 列（True）或只保留前 N 个（int）
    impute="median",
    y_sigma=None,            # |y-mean| > sigma*std 的行丢弃
    winsor=None,             # y 缩尾分位（如 0.01）
    min_cond_n=0,            # 目标列非空数 < n 则丢弃该列
    recursive_only=False,    # 仅保留条件组样本数 >= min_cond_n（同上，另一种表述）
    merge_variants=(),       # 追加合并的数据变体
    dedupe_recipe=False,     # 同配方多行按均值聚合（中位数用 median）
    dedupe_stat="mean",
    template_variant="yangquan",
    min_obs=30,
)


def repair_bulk_scale(series: pd.Series) -> pd.Series:
    """把 bulk_density 列中各种量纲错值折算回 g/cm³。

    勘察结果：`bulk_density__none`(processed/zibo) 整列是 kg/m³（2106~3263）；
    另存在孤立 ×100（282、305）与 ×1000（2781、2992、2941）录入错值；base 的
    `bulk_density__none` 还混有 0 与 428~518 的不可修复值。
    做法：先用本列内点（1~10）确定合理带，再对带外值尝试 1/1000、1/100 缩放，
    能落回带内的取之，否则置 NaN。
    """
    values = pd.to_numeric(series, errors="coerce").astype(float)
    finite = values[np.isfinite(values) & (values > 0)]
    sane = finite[(finite >= 1.0) & (finite <= 10.0)]
    if len(sane) >= 5:
        lo, hi = float(sane.quantile(0.02)), float(sane.quantile(0.98))
    else:
        lo, hi = 1.8, 4.2
    lo, hi = min(lo, 2.0), max(hi, 4.0)

    out = values.copy()
    bad = np.isfinite(values) & ((values < lo) | (values > hi))
    for idx in values.index[bad]:
        original = float(values.loc[idx])
        fixed = np.nan
        for scale in (1e-3, 1e-2):
            candidate = original * scale
            if lo <= candidate <= hi:
                fixed = candidate
                break
        out.loc[idx] = fixed
    return out


def repair_linear_scale(series: pd.Series) -> pd.Series:
    """linear_change 列若量级是分数（|p99| < 0.05）则 ×100 折算回 %。

    覆盖 base 的 `linear_change__1450_1500`(0.000667~0.005) 与 `linear_change__1300`(-0.004)；
    yangquan 的 `linear_change__1300`(-0.4) 已是 % 量级，不受影响。
    """
    values = pd.to_numeric(series, errors="coerce").astype(float)
    finite = values[np.isfinite(values)]
    if len(finite) and 0 < abs(np.nanpercentile(finite, 99)) < 0.05:
        return values * 100.0
    return values


def clean_targets(targets: pd.DataFrame, spec: dict) -> pd.DataFrame:
    out = targets.copy()
    numeric_cols = [c for c in out.columns if c != "recipe_id"]
    for col in numeric_cols:
        series = pd.to_numeric(out[col], errors="coerce")
        if spec["bulk_scale"] and col.startswith("bulk_density__"):
            series = repair_bulk_scale(series)
        if spec["linear_scale"] and col.startswith("linear_change__"):
            series = repair_linear_scale(series)
        if (spec["clamp"] or spec["drop_oob"]) and col.startswith("crushing_strength__"):
            if spec["drop_oob"]:
                series = series.where((series >= CRUSH_MIN) & (series <= CRUSH_MAX))
            else:
                series = series.clip(CRUSH_MIN, CRUSH_MAX)
        out[col] = series
    if spec["min_cond_n"]:
        keep = [c for c in out.columns if c == "recipe_id" or out[c].notna().sum() >= spec["min_cond_n"]]
        out = out[keep]
    return out


def clean_features(features: pd.DataFrame, spec: dict) -> pd.DataFrame:
    out = features.copy()
    if spec["drop_pc"] is True:
        out = out.drop(columns=[c for c in out.columns if c.startswith("pc")], errors="ignore")
    elif isinstance(spec["drop_pc"], int):
        pc_cols = [c for c in out.columns if c.startswith("pc")]
        out = out.drop(columns=pc_cols[spec["drop_pc"]:], errors="ignore")
    if spec["drop_all_nan"] or spec["drop_high_missing"] is not None:
        missing = out.isna().mean()
        drop = set(missing[missing == 1.0].index) if spec["drop_all_nan"] else set()
        if spec["drop_high_missing"] is not None:
            drop |= set(missing[missing > spec["drop_high_missing"]].index)
        drop -= {"recipe_id"}
        out = out.drop(columns=sorted(drop), errors="ignore")
    if spec["add_missing_ind"]:
        cand = [c for c in out.columns if c != "recipe_id" and out[c].isna().any()]
        cand = sorted(cand, key=lambda c: -out[c].isna().mean())[:60]
        for col in cand:
            out[f"miss__{col}"] = out[col].isna().astype(float)
    return out


def load_variant(variant: str, spec: dict):
    features = pd.read_csv(D.FEATURE_DIR / f"features_{variant}.csv")
    targets = pd.read_csv(D.FEATURE_DIR / f"targets_{variant}.csv")
    metadata = json.loads((D.FEATURE_DIR / f"metadata_{variant}.json").read_text(encoding="utf-8"))
    return features, targets, metadata


def merge_frames(variant: str, spec: dict):
    """把 spec['merge_variants'] 里的变体并入基础变体（按 recipe_id 去重，保留先出现的行）。"""
    variants = [variant, *spec["merge_variants"]]
    loaded = [load_variant(name, spec) for name in variants]
    if len(loaded) == 1:
        return loaded[0]

    feat = pd.concat([item[0] for item in loaded], ignore_index=True, sort=False)
    tgt = pd.concat([item[1] for item in loaded], ignore_index=True, sort=False)
    feat["recipe_id"] = feat["recipe_id"].astype(str)
    tgt["recipe_id"] = tgt["recipe_id"].astype(str)
    feat = feat.drop_duplicates(subset="recipe_id", keep="first").reset_index(drop=True)
    tgt = tgt.drop_duplicates(subset="recipe_id", keep="first").reset_index(drop=True)
    # 目标列 -> {property, condition} 映射必须并集，否则被并入变体的目标列会被忽略
    merged_meta = {"variant": "+".join(variants), "target_columns": {}}
    for _f, _t, meta in loaded:
        merged_meta["target_columns"].update(meta.get("target_columns", {}))
    return feat, tgt, merged_meta


def build_dataset(variant: str, property_name: str, spec: dict):
    features, targets, metadata = merge_frames(variant, spec)
    features = clean_features(features, spec)
    targets = clean_targets(targets, spec)
    x, y, groups, meta = H.make_long_property_frame(property_name, features, targets, metadata)

    if spec["dedupe_recipe"] and len(y):
        frame = pd.DataFrame({"y": np.asarray(y), "g": np.asarray(groups)})
        stat = frame.groupby("g")["y"].agg(spec["dedupe_stat"])
        keep = frame["g"].map(stat)
        same = np.isclose(frame["y"].astype(float), keep.astype(float), equal_nan=True)
        # 同配方多行只保留一行（聚合值写回该行）
        first_idx = frame.groupby("g").head(1).index
        mask = pd.Series(False, index=frame.index)
        mask.loc[first_idx] = True
        x, y, groups, meta = x.loc[mask], y.loc[mask], groups.loc[mask], meta.loc[mask]
        y = pd.Series(frame.loc[mask, "g"].map(stat).to_numpy(), index=y.index)

    if spec["y_sigma"] and len(y) > 5:
        values = np.asarray(y, dtype=float)
        threshold = spec["y_sigma"] * np.nanstd(values)
        mask = np.abs(values - np.nanmean(values)) <= threshold
        x, y, groups, meta = x.loc[mask], y.loc[mask], groups.loc[mask], meta.loc[mask]
    if spec["winsor"] and len(y) > 5:
        lo, hi = np.nanquantile(np.asarray(y, dtype=float), [spec["winsor"], 1 - spec["winsor"]])
        y = pd.Series(np.clip(np.asarray(y, dtype=float), lo, hi), index=y.index)
    return x, y, groups, meta


# ───────────────────────── 评测（与 driver.py 同协议） ─────────────────────────

def evaluate_group(round_no: int, group_no: int, label: str, variant: str, spec: dict, factory=best_model,
                   seed: int | None = None, results_path: Path | None = None, spec_by_property: dict | None = None):
    spec = {**DEFAULT_SPEC, **spec}
    seed = D.SEED if seed is None else seed
    rows = []
    for property_name in PROPERTIES:
        prop_spec = {**spec, **(spec_by_property or {}).get(property_name, {})}
        x, y, groups, meta = build_dataset(variant, property_name, prop_spec)
        n_obs, n_recipes = len(y), int(groups.nunique())
        if n_obs < spec["min_obs"] or n_recipes < 3:
            rows.append({"property": property_name, "status": "skipped", "n_obs": n_obs})
            continue
        x_tr, x_te, y_tr, y_te, g_tr, _, _, _ = H.split_by_recipe(x, y, groups, meta, D.TEST_SIZE, seed)
        n_splits = max(2, int(min(D.CV_FOLDS, g_tr.nunique())))
        cv_scores = []
        for tr, va in GroupKFold(n_splits=n_splits).split(x_tr, y_tr, g_tr):
            model = factory(property_name)
            model.fit(x_tr.iloc[tr], y_tr.iloc[tr])
            cv_scores.append(D.rmse(y_tr.iloc[va], model.predict(x_tr.iloc[va])))
        model = factory(property_name)
        model.fit(x_tr, y_tr)
        pred = model.predict(x_te)
        rows.append({
            "property": property_name, "status": "ok",
            "n_obs": n_obs, "n_recipes": n_recipes, "n_features": int(x.shape[1]),
            "cv_rmse": float(np.mean(cv_scores)), "cv_rmse_std": float(np.std(cv_scores)),
            "test_rmse": D.rmse(y_te, pred), "test_r2": float(D.r2_score(y_te, pred)),
        })
    record = {"round": round_no, "group": group_no, "label": label, "variant": variant, "seed": seed,
              "spec": {k: v for k, v in spec.items() if v not in ((), None, False, 0, "median")},
              "properties": rows, "ts": time.strftime("%H:%M:%S")}
    with (results_path or RESULTS).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    best = min((r for r in rows if r.get("status") == "ok"), key=lambda r: r["test_rmse"], default=None)
    print(f"[R{round_no}G{group_no}] {label:52s} variant={variant:9s} "
          f"{'n=' + str(best['n_obs']) + ' best ' + best['property'] + ' rmse=' + format(best['test_rmse'], '.4f') if best else 'no result'}",
          flush=True)
    return record


# ───────────────────────── 实验矩阵：5 轮 × 8 组 ─────────────────────────

def round1():
    """R1 单位/量纲与物理约束（yangquan）：本次勘察发现的主因。"""
    allfix = dict(bulk_scale=True, linear_scale=True, clamp=True)
    levers = [
        ("data:none(基线)", {}),
        ("data:bulk/1000", dict(bulk_scale=True)),
        ("data:linear×100", dict(linear_scale=True)),
        ("data:crushing钳制", dict(clamp=True)),
        ("data:单位全修正", dict(allfix)),
        ("data:单位修正+y3σ", dict(**allfix, y_sigma=3)),
        ("data:单位修正+缩尾1%", dict(**allfix, winsor=0.01)),
        ("data:单位修正+丢弃越界", dict(bulk_scale=True, linear_scale=True, drop_oob=True)),
    ]
    return [(1, i, name, "yangquan", spec) for i, (name, spec) in enumerate(levers)]


def round2():
    """R2 缺失与列清理（yangquan，单位修正已开）。"""
    base = dict(bulk_scale=True, linear_scale=True, clamp=True)
    levers = [
        ("miss:基线(中位数插补)", {}),
        ("miss:删全缺列", dict(drop_all_nan=True)),
        ("miss:删>50%缺列", dict(drop_high_missing=0.5)),
        ("miss:删>30%缺列", dict(drop_high_missing=0.3)),
        ("miss:删>50%缺+缺失指示", dict(drop_high_missing=0.5, add_missing_ind=True)),
        ("miss:均值插补", dict(drop_high_missing=0.5, impute="mean")),
        ("miss:KNN插补", dict(drop_high_missing=0.5, impute="knn")),
        ("miss:迭代(RF)插补", dict(drop_high_missing=0.5, impute="iterative")),
    ]
    return [(2, i, name, "yangquan", {**base, **spec}) for i, (name, spec) in enumerate(levers)]


def round3():
    """R3 数据源与合并（全部单位修正）：zibo 的 bulk 是 kg/m³，base 的 linear 是分数。"""
    fix = dict(bulk_scale=True, linear_scale=True, clamp=True)
    levers = [
        ("src:zibo", "zibo", dict(bulk_scale=True, drop_all_nan=True)),
        ("src:zibo+全修正", "zibo", dict(**fix, drop_all_nan=True)),
        ("src:processed+全修正", "processed", dict(**fix, drop_high_missing=0.5)),
        ("src:fill+全修正", "fill", dict(**fix, drop_high_missing=0.5)),
        ("src:base+全修正", "base", dict(**fix, drop_high_missing=0.5)),
        ("src:yangquan+processed", "yangquan", dict(**fix, drop_high_missing=0.5, merge_variants=("processed",))),
        ("src:yangquan+processed+zibo", "yangquan",
         dict(**fix, drop_high_missing=0.5, merge_variants=("processed", "zibo"))),
        ("src:processed+zibo", "processed", dict(**fix, drop_high_missing=0.5, merge_variants=("zibo",))),
    ]
    return [(3, i, name, variant, spec) for i, (name, variant, spec) in enumerate(levers)]


def round4():
    """R4 条件粒度与标签聚合（yangquan/合并，全部单位修正）。"""
    fix = dict(bulk_scale=True, linear_scale=True, clamp=True)
    levers = [
        ("cond:基线", "yangquan", {}),
        ("cond:丢弃<5样本条件列", "yangquan", dict(min_cond_n=5)),
        ("cond:丢弃<10样本条件列", "yangquan", dict(min_cond_n=10)),
        ("cond:丢弃<20样本条件列", "yangquan", dict(min_cond_n=20)),
        ("cond:丢弃<10+y2.5σ", "yangquan", dict(min_cond_n=10, y_sigma=2.5)),
        ("cond:配方聚合(均值)", "yangquan", dict(dedupe_recipe=True)),
        ("cond:配方聚合(中位数)", "yangquan", dict(dedupe_recipe=True, dedupe_stat="median")),
        ("cond:合并集+配方聚合", "yangquan", dict(drop_high_missing=0.5, dedupe_recipe=True,
                                                merge_variants=("processed", "zibo"))),
    ]
    return [(4, i, name, variant, {**fix, **spec}) for i, (name, variant, spec) in enumerate(levers)]


def round5():
    """R5 最佳清洗 × 数据规模 × 模型（验证数据侧收益能否与模型侧叠加）。"""
    fix = dict(bulk_scale=True, linear_scale=True, clamp=True, drop_high_missing=0.5)
    merged = dict(**fix, merge_variants=("processed", "zibo"))
    levers = [
        ("combo:yangquan最优清洗", "yangquan", fix, best_model),
        ("combo:yangquan+默认LGBM/ET", "yangquan", fix, factory_default),
        ("combo:processed最优清洗", "processed", fix, best_model),
        ("combo:合并集最优清洗", "yangquan", merged, best_model),
        ("combo:合并集+默认模型", "yangquan", merged, factory_default),
        ("combo:合并集+配方聚合", "yangquan", {**merged, "dedupe_recipe": True}, best_model),
        ("combo:processed+zibo", "processed", dict(**fix, merge_variants=("zibo",)), best_model),
        ("combo:合并集无钳制", "yangquan", {**merged, "clamp": False}, best_model),
    ]
    return [(5, i, name, variant, spec, fac) for i, (name, variant, spec, fac) in enumerate(levers)]


ROUNDS = {1: round1, 2: round2, 3: round3, 4: round4, 5: round5}

VERIFY = {
    "verify:baseline(无清洗)": ([{}], None),
    "verify:组合清洗": ([dict(bulk_scale=True, linear_scale=True, clamp=True, drop_high_missing=0.5,
                          winsor=0.01, y_sigma=3)], None),
    "verify:按属性清洗": ([dict(bulk_scale=True, linear_scale=True, clamp=True, drop_high_missing=0.5)], {
        "bulk_density": {"winsor": 0.01},
        "cold_modulus": {"y_sigma": 3},
        "crushing_strength": {"winsor": 0.01},
        "linear_change": {},
    }),
}


def verify(seeds=(42, 7, 2024, 1234, 99)):
    """多种子稳健性验证：同一清洗配置在不同切分下的均值±std，避免“按属性挑最优”的选择偏差。"""
    path = D.OUT_DIR / "results_verify.jsonl"
    if path.exists():
        path.unlink()
    for group_no, (label, (raw_specs, by_prop)) in enumerate(VERIFY.items()):
        for seed in seeds:
            evaluate_group(6, group_no, label, "yangquan", raw_specs[0], best_model,
                           seed=seed, results_path=path, spec_by_property=by_prop)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", default="1,2,3,4,5")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.reset and RESULTS.exists():
        RESULTS.unlink()
    if args.verify:
        start = time.time()
        verify()
        print(f"verify done in {time.time() - start:.1f}s", flush=True)
        return
    wanted = [int(x) for x in args.rounds.split(",") if x.strip()]
    start = time.time()
    total = 0
    for round_no in wanted:
        for group in ROUNDS[round_no]():
            if len(group) == 6:
                r, g, label, variant, spec, fac = group
                evaluate_group(r, g, label, variant, spec, fac)
            else:
                r, g, label, variant, spec = group
                evaluate_group(r, g, label, variant, spec)
            total += 1
    print(f"done in {time.time() - start:.1f}s -> {RESULTS}", flush=True)


if __name__ == "__main__":
    main()
