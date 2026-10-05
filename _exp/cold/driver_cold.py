"""cold_modulus（常温抗折强度）专用实验驱动 —— 隔离环境 `_exp/cold`。

沿用 `_exp/model_opt/driver.py` 的协议与模型工厂（import 复用，不复制），因此结果与既有的
0.8320（数据侧最优）/ 0.8245（线上部署）可比：

    yangquan → H.split_by_recipe(test 0.2, seed 42) → GroupKFold(3)

相对既有实验新增的关键杠杆（见 findings.md F1）：
  • **重复测量级标签重建**：`y_labels` 每工况含多个实测值（如 '11.7 / 11.1 / 15.8 / 14.6'），
    targets CSV 只留了单一聚合值。本驱动支持按 mean/median/trimmed/min/max/robust 重新聚合，
    并可用重复值离散度做样本加权或噪声过滤。
  • 工况对齐（规范化/过滤/合并）、按工况中心化、目标变换、样本加权、抗折专用模型。

产物：`results_cold.jsonl`（逐组落盘）
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "model_opt"))
import driver as D  # noqa: E402

from sklearn.ensemble import (ExtraTreesRegressor, GradientBoostingRegressor,  # noqa: E402
                              HistGradientBoostingRegressor, RandomForestRegressor)
from sklearn.gaussian_process import GaussianProcessRegressor  # noqa: E402
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel  # noqa: E402
from sklearn.experimental import enable_iterative_imputer  # noqa: F401,E402
from sklearn.impute import IterativeImputer, KNNImputer, SimpleImputer  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.svm import SVR  # noqa: E402

H = D.H
PROPERTY = "cold_modulus"
PROP_ZH = "常温抗折强度"
OUT_DIR = Path(__file__).resolve().parent
RESULTS = OUT_DIR / "results_cold.jsonl"
ML_DIR = D.REPO / "_ref/handover/ML"
FEATURE_OUT = D.FEATURE_DIR

# 条件别名表：把语义相同的工况收敛（对齐用）
CONDITION_ALIASES = {
    "1450℃": "1450℃/1500℃",
    "1500℃": "1450℃/1500℃",
    "1450℃×3h": "1450℃/1500℃×3h",
    "1500℃×3h": "1450℃/1500℃×3h",
}


# ───────────────────────── 重复测量：解析 / 聚合 ─────────────────────────

def parse_replicates(raw) -> list[float]:
    """'11.7 / 11.1 / 15.8 / 14.6' → [11.7, 11.1, 15.8, 14.6]；非数值（断/未测/-）丢弃。"""
    if raw is None:
        return []
    if isinstance(raw, (int, float)):
        return [] if (isinstance(raw, float) and math.isnan(raw)) else [float(raw)]
    values = []
    for token in str(raw).replace("，", "/").replace(",", "/").replace(";", "/").replace("；", "/").split("/"):
        token = token.strip().replace("MPa", "").strip()
        try:
            values.append(float(token))
        except ValueError:
            continue
    return values


def aggregate(values: list[float], how: str) -> float:
    if not values:
        return float("nan")
    array = np.asarray(values, dtype=float)
    if how == "mean":
        return float(array.mean())
    if how == "median":
        return float(np.median(array))
    if how == "trimmed":
        if len(array) >= 4:
            ordered = np.sort(array)
            return float(ordered[1:-1].mean())
        return float(array.mean())
    if how == "robust":  # 剔除 |z|>2 后取均值
        if len(array) >= 3:
            std = array.std(ddof=0)
            if std > 0:
                kept = array[np.abs((array - array.mean()) / std) <= 2.0]
                if len(kept):
                    return float(kept.mean())
        return float(array.mean())
    if how == "min":
        return float(array.min())
    if how == "max":
        return float(array.max())
    if how == "p25":
        return float(np.percentile(array, 25))
    if how == "std":
        return float(array.std(ddof=0))
    raise ValueError(f"未知聚合方式: {how}")


def load_labels(variant: str):
    """返回 (元数据, {recipe_id: {condition: [重复值]}})。"""
    data = np.load(ML_DIR / f"{variant}.npy", allow_pickle=True).item()
    meta = json.loads((FEATURE_OUT / f"metadata_{variant}.json").read_text(encoding="utf-8"))
    per_recipe = {}
    for sample in data["samples"]:
        labels = (sample.get("y_labels") or {}).get(PROPERTY) or {}
        per_recipe[str(sample["recipe_id"])] = {str(cond): parse_replicates(raw) for cond, raw in labels.items()}
    return meta, per_recipe


def build_targets(variant: str, how: str, recipe_ids) -> pd.DataFrame:
    """按聚合方式从 y_labels 重建 targets 表。

    行序与 `recipe_ids`（即 features 表）**严格对齐**，缺失标签留 NaN —— 交接脚本按行序对齐
    features/targets，行数或顺序不一致会触发 Unalignable boolean Series。
    """
    meta, per_recipe = load_labels(variant)
    columns = {col: info for col, info in meta["target_columns"].items() if info.get("property") == PROPERTY}
    rows = []
    for recipe_id in recipe_ids:
        conditions = per_recipe.get(str(recipe_id), {})
        row = {"recipe_id": recipe_id}
        for col, info in columns.items():
            values = conditions.get(str(info.get("condition")), [])
            row[col] = aggregate(values, how) if values else float("nan")
        rows.append(row)
    return pd.DataFrame(rows)


# ───────────────────────── 数据集构建（全部杠杆） ─────────────────────────

DEFAULT_SPEC = dict(
    label="csv",                 # csv(基线) | mean | median | trimmed | robust | min | max | p25
    min_cond_n=0,                # 目标列样本数下限
    keep_conditions=None,        # 仅保留这些工况（condition 字符串）
    drop_constant_cond=False,    # 丢弃仅 1 个取值的工况列（默认关，保持与既有基线可比）
    align_conditions=False,      # 工况名规范化（1450/1500 收敛）
    center_by_condition=False,   # 训练均值中心化（按工况）
    drop_high_missing=None,      # 删除缺失率 > x 的列
    drop_all_nan=False,
    add_missing_ind=False,
    impute="median",             # median | mean | knn | iterative
    transform=None,              # None | log1p | sqrt
    winsor=None,                 # 缩尾分位
    y_sigma=None,                # |y-mean| > sigma*std 行丢弃
    weights=None,                # None | rep_std | condition_balance
    model="et",
    model_params=None,
    min_obs=30,
)


def build_frames(variant: str, spec: dict):
    features = pd.read_csv(D.FEATURE_DIR / f"features_{variant}.csv")
    metadata = json.loads((D.FEATURE_DIR / f"metadata_{variant}.json").read_text(encoding="utf-8"))
    if spec["label"] == "csv":
        targets = pd.read_csv(D.FEATURE_DIR / f"targets_{variant}.csv")
    else:
        targets = build_targets(variant, spec["label"], features["recipe_id"].astype(str).tolist())

    meta = copy.deepcopy(metadata)
    # 工况对齐：修改 target_columns 里的 condition 字符串，使条件特征按规范化后的工况生成
    if spec["align_conditions"]:
        for col, info in meta.get("target_columns", {}).items():
            condition = str(info.get("condition"))
            info["condition"] = CONDITION_ALIASES.get(condition, condition)
    # 保留/过滤工况
    if spec["keep_conditions"] is not None:
        keep = set(spec["keep_conditions"])
        meta["target_columns"] = {col: info for col, info in meta["target_columns"].items()
                                  if str(info.get("condition")) in keep}
    # 丢弃常量/极小工况列
    if spec["drop_constant_cond"] or spec["min_cond_n"]:
        drop = []
        for col, info in list(meta["target_columns"].items()):
            if info.get("property") != PROPERTY or col not in targets.columns:
                continue
            series = pd.to_numeric(targets[col], errors="coerce")
            if spec["drop_constant_cond"] and series.notna().any() and series.dropna().nunique() <= 1:
                drop.append(col)
            elif spec["min_cond_n"] and series.notna().sum() < spec["min_cond_n"]:
                drop.append(col)
        for col in drop:
            meta["target_columns"].pop(col, None)
            targets = targets.drop(columns=[col], errors="ignore")
    return features, targets, meta


def build_dataset(variant: str, spec: dict):
    spec = {**DEFAULT_SPEC, **(spec or {})}
    features, targets, meta = build_frames(variant, spec)
    if spec["drop_all_nan"] or spec["drop_high_missing"] is not None:
        missing = features.isna().mean()
        drop = set(missing[missing == 1.0].index) if spec["drop_all_nan"] else set()
        if spec["drop_high_missing"] is not None:
            drop |= set(missing[missing > spec["drop_high_missing"]].index)
        features = features.drop(columns=sorted(drop - {"recipe_id"}), errors="ignore")
    if spec["add_missing_ind"]:
        candidates = [col for col in features.columns if col != "recipe_id" and features[col].isna().any()]
        candidates = sorted(candidates, key=lambda col: -features[col].isna().mean())[:60]
        for col in candidates:
            features[f"miss__{col}"] = features[col].isna().astype(float)

    x, y, groups, meta_frame = H.make_long_property_frame(PROPERTY, features, targets, meta)

    if spec["y_sigma"] and len(y) > 5:
        values = np.asarray(y, float)
        threshold = spec["y_sigma"] * np.nanstd(values)
        mask = np.abs(values - np.nanmean(values)) <= threshold
        x, y, groups, meta_frame = x.loc[mask].reset_index(drop=True), y.loc[mask].reset_index(drop=True), \
            groups.loc[mask].reset_index(drop=True), meta_frame.loc[mask].reset_index(drop=True)
    if spec["winsor"] and len(y) > 5:
        values = np.asarray(y, float)
        lo, hi = np.nanquantile(values, [spec["winsor"], 1 - spec["winsor"]])
        y = pd.Series(np.clip(values, lo, hi), index=y.index)
    y_original = pd.Series(np.asarray(y, dtype=float), index=meta_frame.index)
    if spec["transform"] == "log1p":
        y = pd.Series(np.log1p(np.asarray(y, float)), index=meta_frame.index)
    elif spec["transform"] == "sqrt":
        y = pd.Series(np.sqrt(np.asarray(y, float)), index=meta_frame.index)
    return x, y, groups, meta_frame, spec, y_original


# ───────────────────────── 模型 ─────────────────────────

def make_model(spec: dict):
    kind = spec["model"]
    params = spec.get("model_params") or {}
    impute = spec["impute"]
    if impute in ("knn", "iterative"):
        imputer = KNNImputer(n_neighbors=5) if impute == "knn" else IterativeImputer(random_state=D.SEED, max_iter=10)
    else:
        imputer = SimpleImputer(strategy=impute, keep_empty_features=True)
    if kind == "et":
        model = ExtraTreesRegressor(n_estimators=params.get("n_estimators", 300), random_state=D.SEED, n_jobs=-1)
    elif kind == "rf":
        model = RandomForestRegressor(n_estimators=params.get("n_estimators", 600), random_state=D.SEED, n_jobs=-1)
    elif kind == "xgb":
        from xgboost import XGBRegressor
        model = XGBRegressor(random_state=D.SEED, n_jobs=-1, verbosity=0, **params)
    elif kind == "lgbm":
        from lightgbm import LGBMRegressor
        model = LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1, **params)
    elif kind == "hgb":
        model = HistGradientBoostingRegressor(random_state=D.SEED, **params)
    elif kind == "gbr":
        model = GradientBoostingRegressor(random_state=D.SEED, **params)
    elif kind == "gpr":
        kernel = ConstantKernel(1.0, (1e-2, 1e3)) * RBF(length_scale=10.0, length_scale_bounds=(1e-1, 1e3)) \
            + WhiteKernel(noise_level=1.0, noise_level_bounds=(1e-3, 1e2))
        model = GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=D.SEED, n_restarts_optimizer=2)
    elif kind == "svr":
        model = SVR(C=params.get("C", 10.0), gamma=params.get("gamma", "scale"), epsilon=params.get("epsilon", 1.0))
    elif kind == "ensemble3":
        from sklearn.ensemble import VotingRegressor
        from xgboost import XGBRegressor
        model = VotingRegressor([
            ("et", ExtraTreesRegressor(n_estimators=300, random_state=D.SEED, n_jobs=-1)),
            ("xgb", XGBRegressor(random_state=D.SEED, n_jobs=-1, verbosity=0, n_estimators=400, learning_rate=0.04, max_depth=4)),
            ("gpr", GaussianProcessRegressor(kernel=ConstantKernel(1.0) * RBF(10.0) + WhiteKernel(1.0),
                                             normalize_y=True, random_state=D.SEED)),
        ], n_jobs=1)
    else:
        raise ValueError(f"未知模型: {kind}")
    return Pipeline([("imputer", imputer), ("model", model)])


# ───────────────────────── 评测 ─────────────────────────

def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))


def r2(a, b):
    from sklearn.metrics import r2_score
    return float(r2_score(a, b))


def sample_weights(spec: dict, variant: str, meta_frame, y, recipe_ids):
    """样本权重：按重复值离散度（1/std）或工况均衡。"""
    if spec["weights"] is None:
        return None
    if spec["weights"] == "condition_balance":
        conditions = meta_frame["condition"].astype(str).to_numpy()
        counts = pd.Series(conditions).value_counts()
        return np.array([1.0 / counts[c] for c in conditions])
    if spec["weights"] == "rep_std":
        _, per_recipe = load_labels(variant)
        std_map = {}
        for recipe_id, conditions in per_recipe.items():
            for condition, values in conditions.items():
                std_map[(recipe_id, condition)] = float(np.std(values, ddof=0)) if len(values) > 1 else float("nan")
        weights = []
        for recipe_id, condition in zip(recipe_ids, meta_frame["condition"].astype(str)):
            std = std_map.get((str(recipe_id), condition), float("nan"))
            # 离散度越大越不可信 → 权重越小；缺信息给中位数权重
            weights.append(1.0 / (std + 1e-6) if std == std and std > 0 else float("nan"))
        array = np.asarray(weights, float)
        median = np.nanmedian(array)
        array = np.where(np.isnan(array), median, array)
        return array / np.nanmean(array)
    raise ValueError(f"未知权重: {spec['weights']}")


def evaluate(group_no: int, label: str, variant: str, spec: dict, seed: int | None = None,
             results_path: Path | None = None):
    seed = D.SEED if seed is None else seed
    x, y, groups, meta_frame, spec, y_original = build_dataset(variant, spec)
    if len(y) < spec["min_obs"] or groups.nunique() < 3:
        record = {"group": group_no, "label": label, "variant": variant, "seed": seed, "spec": spec,
                  "status": "skipped", "n_obs": len(y), "ts": time.strftime("%H:%M:%S")}
        with (results_path or RESULTS).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(f"[G{group_no}] {label:46s} skipped (n={len(y)})", flush=True)
        return record

    x_train, x_test, y_fit_train, y_fit_test, g_train, g_test, meta_train, meta_test = H.split_by_recipe(
        x, y, groups, meta_frame, D.TEST_SIZE, seed)
    # 原始尺度标签（与上面同一行序），用于在**统一尺度**上报告 R²/RMSE
    _, _, y_train, y_test, _, _, _, _ = H.split_by_recipe(
        x, y_original, groups, meta_frame, D.TEST_SIZE, seed)
    weights_train = sample_weights(spec, variant, meta_train, y_train, g_train)

    # 按工况中心化：用训练集各工况均值做偏移（测试集用同一偏移，无泄漏）
    offset_train = offset_test = None
    if spec["center_by_condition"]:
        offsets = pd.Series(np.asarray(y_train, float)).groupby(meta_train["condition"].astype(str).to_numpy()).mean()
        global_mean = float(np.mean(np.asarray(y_train, float)))
        offset_train = meta_train["condition"].astype(str).map(offsets).fillna(global_mean).to_numpy()
        offset_test = meta_test["condition"].astype(str).map(offsets).fillna(global_mean).to_numpy()
        y_train_fit = pd.Series(np.asarray(y_fit_train, float) - offset_train, index=y_fit_train.index)
    else:
        y_train_fit = y_fit_train

    n_splits = max(2, int(min(D.CV_FOLDS, g_train.nunique())))
    oof = np.full(len(y_fit_train), np.nan)
    for tr, va in GroupKFold(n_splits=n_splits).split(x_train, y_fit_train, g_train):
        model = make_model(spec)
        fit_kwargs = {}
        if weights_train is not None:
            fit_kwargs["model__sample_weight"] = weights_train[tr]
        model.fit(x_train.iloc[tr], y_train_fit.iloc[tr], **fit_kwargs)
        fold_offset = offset_train[va] if offset_train is not None else 0.0
        oof[va] = model.predict(x_train.iloc[va]) + fold_offset

    model = make_model(spec)
    fit_kwargs = {}
    if weights_train is not None:
        fit_kwargs["model__sample_weight"] = weights_train
    model.fit(x_train, y_train_fit, **fit_kwargs)
    pred = model.predict(x_test) + (offset_test if offset_test is not None else 0.0)
    pred_train_oof = oof
    valid = ~np.isnan(pred_train_oof)
    reverse = (lambda v: np.expm1(v)) if spec["transform"] == "log1p" else ((lambda v: np.square(v)) if spec["transform"] == "sqrt" else (lambda v: v))
    pred_report = reverse(np.asarray(pred, float))

    record = {
        "group": group_no, "label": label, "variant": variant, "seed": seed,
        "spec": {k: v for k, v in spec.items() if v not in (None, False, 0, "median", "csv", "et", "median")},
        "status": "ok",
        "n_obs": int(len(y)), "n_train": int(len(y_train)), "n_test": int(len(y_test)),
        "n_features": int(x.shape[1]), "n_conditions": int(meta_frame["condition"].nunique()),
        "test_r2": r2(y_test, pred_report), "test_rmse": rmse(y_test, pred_report),
        "oof_r2": r2(np.asarray(y_train, float)[valid], reverse(pred_train_oof[valid])),
        "oof_rmse": rmse(np.asarray(y_train, float)[valid], reverse(pred_train_oof[valid])),
        "test_mae": float(np.mean(np.abs(np.asarray(y_test, float) - pred_report))),
        "ts": time.strftime("%H:%M:%S"),
    }
    with (results_path or RESULTS).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"[G{group_no}] {label:46s} n={record['n_obs']:4d} test_R2={record['test_r2']:.4f} "
          f"oof_R2={record['oof_r2']:.4f} rmse={record['test_rmse']:.4f}", flush=True)
    return record


# ───────────────────────── 实验矩阵（5 轮 × 8 组） ─────────────────────────

def round1():
    """R1 标签聚合与重复测量利用。"""
    return [
        (0, "label:csv(基线)", {}),
        (1, "label:mean", dict(label="mean")),
        (2, "label:median", dict(label="median")),
        (3, "label:trimmed(去极值)", dict(label="trimmed")),
        (4, "label:robust(去2σ)", dict(label="robust")),
        (5, "label:min", dict(label="min")),
        (6, "label:max", dict(label="max")),
        (7, "label:median+min_cond_n5", dict(label="median", min_cond_n=5)),
    ]


def round2():
    """R2 工况对齐/过滤/条件化。"""
    return [
        (0, "cond:csv(基线)", {}),
        (1, "cond:min_cond_n=5", dict(min_cond_n=5)),
        (2, "cond:min_cond_n=10", dict(min_cond_n=10)),
        (3, "cond:仅 110/1450_1500", dict(keep_conditions=["110℃", "1450℃/1500℃"])),
        (4, "cond:去常量工况", dict(drop_constant_cond=True)),
        (5, "cond:工况名对齐", dict(align_conditions=True)),
        (6, "cond:按工况中心化", dict(center_by_condition=True)),
        (7, "cond:中心化+仅两工况", dict(center_by_condition=True, keep_conditions=["110℃", "1450℃/1500℃"])),
    ]


def round3():
    """R3 特征清理/插补/选择。"""
    return [
        (0, "feat:csv(基线)", {}),
        (1, "feat:删>50%缺列", dict(drop_high_missing=0.5)),
        (2, "feat:删>30%缺列", dict(drop_high_missing=0.3)),
        (3, "feat:删全缺列", dict(drop_all_nan=True)),
        (4, "feat:删>50%缺+指示", dict(drop_high_missing=0.5, add_missing_ind=True)),
        (5, "feat:迭代插补", dict(impute="iterative")),
        (6, "feat:KNN插补", dict(impute="knn")),
        (7, "feat:删>50%缺+均值", dict(drop_high_missing=0.5, impute="mean")),
    ]


def round4():
    """R4 目标变换与样本加权。"""
    return [
        (0, "tgt:csv(基线)", {}),
        (1, "tgt:log1p", dict(transform="log1p")),
        (2, "tgt:sqrt", dict(transform="sqrt")),
        (3, "tgt:缩尾1%", dict(winsor=0.01)),
        (4, "tgt:缩尾5%", dict(winsor=0.05)),
        (5, "tgt:y3σ截断", dict(y_sigma=3)),
        (6, "tgt:权重=1/重复值σ", dict(weights="rep_std")),
        (7, "tgt:权重=工况均衡", dict(weights="condition_balance")),
    ]


def round5():
    """R5 抗折专用模型。"""
    return [
        (0, "model:ET300(基线)", dict(model="et")),
        (1, "model:ET800", dict(model="et", model_params={"n_estimators": 800})),
        (2, "model:XGB tuned", dict(model="xgb", model_params={"n_estimators": 600, "learning_rate": 0.03, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.8})),
        (3, "model:LGBM tuned", dict(model="lgbm", model_params={"n_estimators": 600, "learning_rate": 0.03, "num_leaves": 15, "min_child_samples": 5})),
        (4, "model:HGB tuned", dict(model="hgb", model_params={"max_iter": 500, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 3})),
        (5, "model:RF600", dict(model="rf", model_params={"n_estimators": 600})),
        (6, "model:GPR", dict(model="gpr", impute="iterative")),
        (7, "model:GBR tuned", dict(model="gbr", model_params={"n_estimators": 500, "learning_rate": 0.03, "max_depth": 3, "subsample": 0.8})),
    ]


def round6():
    """R6 组合：R1–R5 已验证杠杆的叠加（trimmed 标签 × 工况中心化 × 特征清理 × 模型）。"""
    base = dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5, add_missing_ind=True)
    return [
        (0, "combo:trimmed", dict(label="trimmed")),
        (1, "combo:trimmed+中心化", dict(label="trimmed", center_by_condition=True)),
        (2, "combo:trimmed+中心化+删列+指示", dict(base)),
        (3, "combo:trimmed+中心化+删列+指示+全缺", dict(base, drop_all_nan=True)),
        (4, "combo:+XGB tuned", dict(base, model="xgb", model_params={"n_estimators": 600, "learning_rate": 0.03, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.8})),
        (5, "combo:+LGBM tuned", dict(base, model="lgbm", model_params={"n_estimators": 600, "learning_rate": 0.03, "num_leaves": 15, "min_child_samples": 5})),
        (6, "combo:+HGB tuned", dict(base, model="hgb", model_params={"max_iter": 500, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 3})),
        (7, "combo:+GPR", dict(base, model="gpr", impute="iterative")),
    ]


def round7():
    """R7 组合细化：在 R6 最优基础上继续叠加噪声处理与模型族。"""
    base = dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5, add_missing_ind=True, drop_all_nan=True)
    return [
        (0, "combo2:基础组合", dict(base)),
        (1, "combo2:+y3σ", dict(base, y_sigma=3)),
        (2, "combo2:+缩尾1%", dict(base, winsor=0.01)),
        (3, "combo2:+权重1/σ", dict(base, weights="rep_std")),
        (4, "combo2:+工况均衡权重", dict(base, weights="condition_balance")),
        (5, "combo2:+ET800", dict(base, model="et", model_params={"n_estimators": 800})),
        (6, "combo2:+RF600", dict(base, model="rf", model_params={"n_estimators": 600})),
        (7, "combo2:+XGB tuned", dict(base, model="xgb", model_params={"n_estimators": 600, "learning_rate": 0.03, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.8})),
    ]


ROUNDS = {1: round1, 2: round2, 3: round3, 4: round4, 5: round5, 6: round6, 7: round7}

# 多种子验证的候选配置（名字 → spec）
VERIFY = {
    "verify:csv基线": {},
    "verify:trimmed": dict(label="trimmed"),
    "verify:trimmed+中心化": dict(label="trimmed", center_by_condition=True),
    "verify:组合(trimmed+中心化+删列+指示)": dict(label="trimmed", center_by_condition=True,
                                              drop_high_missing=0.5, add_missing_ind=True),
    "verify:组合+全缺列": dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5,
                           add_missing_ind=True, drop_all_nan=True),
    "verify:组合+缩尾1%": dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5,
                           add_missing_ind=True, drop_all_nan=True, winsor=0.01),
    "verify:组合+工况均衡权重": dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5,
                             add_missing_ind=True, drop_all_nan=True, weights="condition_balance"),
    "verify:组合+缩尾+权重": dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5,
                            add_missing_ind=True, drop_all_nan=True, winsor=0.01, weights="condition_balance"),
    "verify:组合+HGB tuned": dict(label="trimmed", center_by_condition=True, drop_high_missing=0.5,
                              add_missing_ind=True, drop_all_nan=True, model="hgb",
                              model_params={"max_iter": 500, "learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 3}),
}


def verify(seeds=(42, 7, 2024, 1234, 99)):
    path = OUT_DIR / "results_verify_cold.jsonl"
    existing = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    done = {json.loads(line)["label"] for line in existing if line.strip()}
    for label, spec in VERIFY.items():   # 只补跑尚未验证的配置
        if label not in done:
            for seed in seeds:
                evaluate(len(done), label, "yangquan", spec, seed=seed, results_path=path)
    return
    for index, (label, spec) in enumerate(VERIFY.items()):
        for seed in seeds:
            evaluate(index, label, "yangquan", spec, seed=seed, results_path=path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", default="yangquan")
    parser.add_argument("--rounds", default="1,2,3,4,5")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    if args.reset and RESULTS.exists():
        RESULTS.unlink()
    start = time.time()
    if args.verify:
        verify()
        print(f"verify done in {time.time() - start:.1f}s", flush=True)
        return
    total = 0
    for round_no in [int(x) for x in args.rounds.split(",") if x.strip()]:
        for group_no, label, spec in ROUNDS[round_no]():
            evaluate(group_no, f"R{round_no} {label}", args.variant, spec, seed=args.seed)
            total += 1
    print(f"done {total} groups in {time.time() - start:.1f}s -> {RESULTS}", flush=True)


if __name__ == "__main__":
    main()
