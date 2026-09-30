#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""性质预测模型自主优化实验（隔离环境：只读交接数据与训练脚本，产物全部落在 _exp/model_opt/）。

协议（所有组一致，保证可比）：
  features_<variant>.csv + targets_<variant>.csv + metadata_<variant>.json
  → make_long_property_frame(property)（交接脚本的工况展开逻辑）
  → split_by_recipe(test 0.2, seed 42)（按 recipe_id 分组，避免泄漏）
  → GroupKFold(3) 取 cv_rmse 均值；再在 train 上拟合，评估 test RMSE/MAE/R²

5 轮 × 8 组：
  R0 复现线上基线（yangquan：bulk=xgboost、cold/crush/linear=extra_trees）
  R1 模型族：8 个候选（含 stacking）
  R2 特征选择：none / SFS 50·20·10·5% / PCA 50·20 / 方差过滤
  R3 LightGBM 超参：8 组网格
  R4 工况/目标编码：8 组（one-hot / 合并工况 / 去工况 / 时长 / 温度 / 目标编码 / 样本权重 / 仅 None）
  R5 数据变体与融合：6 变体 + 2 组三模型融合

输出：results.jsonl（逐组追加，可断点查看）、summary.md
用法：<model venv>/bin/python _exp/model_opt/driver.py [--rounds 1,2] [--groups 0,1] [--quick]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.decomposition import PCA
from sklearn.ensemble import (ExtraTreesRegressor, HistGradientBoostingRegressor,
                              RandomForestRegressor, StackingRegressor)
from sklearn.feature_selection import SelectFromModel, VarianceThreshold
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

REPO = Path(__file__).resolve().parents[2]
HANDOVER_MODEL = REPO / "_ref/handover/ML/MODEL"
FEATURE_DIR = REPO / "_ref/handover/ML/FEATURE/outputs"
OUT_DIR = Path(__file__).resolve().parent
RESULTS = OUT_DIR / "results.jsonl"
PROPERTIES = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]
SEED = 42
TEST_SIZE = 0.2
CV_FOLDS = 3


def load_handover():
    """导入交接训练脚本（复用其工况展开与特征准备逻辑，且不改动它）。"""
    sys.path.insert(0, str(HANDOVER_MODEL))
    spec = importlib.util.spec_from_file_location("handover_selector", HANDOVER_MODEL / "model_selective_selector.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["handover_selector"] = module
    spec.loader.exec_module(module)
    import __main__
    if not hasattr(__main__, "TrainOnlyFeatureFilter"):
        __main__.TrainOnlyFeatureFilter = module.TrainOnlyFeatureFilter
    return module


H = load_handover()


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def make_pipeline(model, *, impute="median", scale=False, select=None, pca=None, variance=None):
    steps = [("imputer", SimpleImputer(strategy=impute, keep_empty_features=True))]
    if variance is not None:
        steps.append(("variance", VarianceThreshold(threshold=variance)))
    if pca is not None:
        steps.append(("pca", PCA(n_components=pca, random_state=SEED)))
    if scale:
        steps.append(("scaler", StandardScaler()))
    if select is not None:
        steps.append(("select", select))
    steps.append(("model", model))
    return Pipeline(steps)


def model_zoo(kind: str, params: dict | None = None):
    params = params or {}
    if kind == "ridge":
        return make_pipeline(Ridge(alpha=params.get("alpha", 1.0), random_state=SEED), scale=True, impute="median")
    if kind == "elastic_net":
        return make_pipeline(ElasticNet(alpha=params.get("alpha", 0.01), l1_ratio=params.get("l1_ratio", 0.5), random_state=SEED), scale=True)
    if kind == "random_forest":
        return make_pipeline(RandomForestRegressor(n_estimators=params.get("n_estimators", 200), random_state=SEED, n_jobs=-1))
    if kind == "extra_trees":
        return make_pipeline(ExtraTreesRegressor(n_estimators=params.get("n_estimators", 300), random_state=SEED, n_jobs=-1))
    if kind == "hist_gbm":
        return make_pipeline(HistGradientBoostingRegressor(random_state=SEED, max_iter=params.get("max_iter", 300)))
    if kind == "lightgbm":
        from lightgbm import LGBMRegressor
        return make_pipeline(LGBMRegressor(random_state=SEED, verbose=-1, n_jobs=-1, **params))
    if kind == "xgboost":
        from xgboost import XGBRegressor
        return make_pipeline(XGBRegressor(random_state=SEED, n_jobs=-1, verbosity=0, **params))
    if kind == "stacking":
        from lightgbm import LGBMRegressor
        estimators = [
            ("et", ExtraTreesRegressor(n_estimators=200, random_state=SEED, n_jobs=-1)),
            ("lgbm", LGBMRegressor(random_state=SEED, verbose=-1, n_jobs=-1, n_estimators=300, learning_rate=0.05)),
            ("ridge", make_pipeline(Ridge(alpha=1.0), scale=True)),
        ]
        return make_pipeline(StackingRegressor(estimators=estimators, final_estimator=Ridge(alpha=1.0), n_jobs=-1, cv=3))
    raise ValueError(f"unknown model kind: {kind}")


def select_from(kind: str, threshold: float | str, params: dict | None = None):
    from lightgbm import LGBMRegressor
    estimator = LGBMRegressor(random_state=SEED, verbose=-1, n_jobs=-1, n_estimators=200, learning_rate=0.05)
    return SelectFromModel(estimator, threshold=threshold)


def condition_variant_features(condition: str, mode: str) -> dict:
    """工况特征的不同编码方式（R4 用）。只返回以 `condition_` 开头的列，交由 build_dataset 统一拼接。"""
    base = H.condition_features(condition)
    numeric = {k: v for k, v in base.items() if not k.startswith("condition__")}
    onehot = {k: v for k, v in base.items() if k.startswith("condition__")}
    if mode == "onehot":
        return base
    if mode == "no_onehot":
        return numeric
    if mode == "hours_only":
        return {k: base[k] for k in ("condition_hours", "condition_has_hours")}
    if mode == "temp_only":
        return {k: base[k] for k in ("condition_temp_min", "condition_temp_max", "condition_temp_mean", "condition_temp_count")}
    if mode == "no_none_flag":
        return {k: v for k, v in base.items() if k != "condition_is_none"}
    if mode == "extra_temp_range":
        extra = dict(base)
        extra["condition_temp_range"] = (base["condition_temp_max"] - base["condition_temp_min"])
        return extra
    if mode == "extra_hours_log":
        extra = dict(base)
        extra["condition_hours_log"] = float(np.log1p(base["condition_hours"]))
        return extra
    if mode == "extra_cross":
        extra = dict(base)
        extra["condition_temp_x_hours"] = float(base["condition_temp_mean"]) * float(base["condition_hours"])
        return extra
    return base


def build_dataset(variant: str, property_name: str, condition_mode: str = "onehot"):
    features = pd.read_csv(FEATURE_DIR / f"features_{variant}.csv")
    targets = pd.read_csv(FEATURE_DIR / f"targets_{variant}.csv")
    metadata = json.loads((FEATURE_DIR / f"metadata_{variant}.json").read_text(encoding="utf-8"))

    x, y, groups, meta = H.make_long_property_frame(property_name, features, targets, metadata)
    if condition_mode != "onehot":
        # 先移除交接脚本给出的全部工况列，再按所选模式重建，避免重名列
        x = x.drop(columns=[c for c in x.columns if c.startswith("condition_")], errors="ignore")
        extra = meta["condition"].map(lambda c: condition_variant_features(c, condition_mode))
        extra_df = pd.DataFrame(list(extra), index=x.index)
        x = pd.concat([x, extra_df], axis=1)
    return x, y, groups, meta


def evaluate_group(round_no: int, group_no: int, label: str, variant: str, factory, condition_mode="onehot", min_obs=30):
    rows = []
    for property_name in PROPERTIES:
        x, y, groups, meta = build_dataset(variant, property_name, condition_mode)
        n_obs, n_recipes = len(y), int(groups.nunique())
        if n_obs < min_obs or n_recipes < 3:
            rows.append({"property": property_name, "status": "skipped", "n_obs": n_obs})
            continue
        x_train, x_test, y_train, y_test, g_train, g_test, _, _ = H.split_by_recipe(x, y, groups, meta, TEST_SIZE, SEED)
        n_splits = int(min(CV_FOLDS, g_train.nunique()))
        cv_scores = []
        splitter = GroupKFold(n_splits=max(2, n_splits))
        for tr, va in splitter.split(x_train, y_train, g_train):
            model = factory(property_name)
            model.fit(x_train.iloc[tr], y_train.iloc[tr])
            cv_scores.append(rmse(y_train.iloc[va], model.predict(x_train.iloc[va])))
        model = factory(property_name)
        model.fit(x_train, y_train)
        pred = model.predict(x_test)
        rows.append({
            "property": property_name, "status": "ok",
            "n_obs": n_obs, "n_recipes": n_recipes,
            "cv_rmse": float(np.mean(cv_scores)), "cv_rmse_std": float(np.std(cv_scores)),
            "test_rmse": rmse(y_test, pred), "test_mae": float(mean_absolute_error(y_test, pred)),
            "test_r2": float(r2_score(y_test, pred)),
        })
    record = {"round": round_no, "group": group_no, "label": label, "variant": variant,
              "condition_mode": condition_mode, "properties": rows, "ts": time.strftime("%H:%M:%S")}
    with RESULTS.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    best = min((r for r in rows if r.get("status") == "ok"), key=lambda r: r["test_rmse"], default=None)
    print(f"[R{round_no}G{group_no}] {label:52s} variant={variant:9s} "
          f"{'best ' + best['property'] + ' rmse=' + format(best['test_rmse'], '.4f') if best else 'no result'}", flush=True)
    return record


# ───────────────────────── 实验矩阵 ─────────────────────────

def round0():
    """复现线上基线（yangquan，各属性用 metrics_all 里的 best model）。"""
    deployed = {"bulk_density": ("xgboost", {}), "cold_modulus": ("extra_trees", {}),
                "crushing_strength": ("extra_trees", {}), "linear_change": ("extra_trees", {})}
    def factory(prop):
        kind, params = deployed[prop]
        return model_zoo(kind, params)
    return [(0, 0, "baseline(deployed: xgboost + extra_trees)", "yangquan", factory, "onehot")]


def round1():
    levers = [
        ("ridge", lambda p: model_zoo("ridge")),
        ("elastic_net", lambda p: model_zoo("elastic_net")),
        ("random_forest", lambda p: model_zoo("random_forest")),
        ("extra_trees", lambda p: model_zoo("extra_trees")),
        ("hist_gbm", lambda p: model_zoo("hist_gbm")),
        ("lightgbm(default)", lambda p: model_zoo("lightgbm")),
        ("xgboost(default)", lambda p: model_zoo("xgboost")),
        ("stacking(et+lgbm+ridge)", lambda p: model_zoo("stacking")),
    ]
    return [(1, i, f"model:{name}", "yangquan", f, "onehot") for i, (name, f) in enumerate(levers)]


def round2():
    levers = [
        ("fs:none", None),
        ("fs:sfm-median(生产口径)", "median"),
        ("fs:sfm-0.5xmean", "0.5*mean"),
        ("fs:sfm-mean", "mean"),
        ("fs:sfm-1.5xmean", "1.5*mean"),
        ("fs:sfm-2xmean", "2*mean"),
        ("fs:pca-50", "pca50"),
        ("fs:pca-20", "pca20"),
    ]
    def make(sel):
        def factory(prop):
            if sel is None:
                return model_zoo("lightgbm")
            if sel == "pca50":
                return make_pipeline(model_zoo("lightgbm").named_steps["model"], pca=50)
            if sel == "pca20":
                return make_pipeline(model_zoo("lightgbm").named_steps["model"], pca=20)
            if sel == "variance":
                return make_pipeline(model_zoo("lightgbm").named_steps["model"], variance=1e-8)
            return make_pipeline(model_zoo("lightgbm").named_steps["model"], select=select_from("lightgbm", sel))
        return factory
    return [(2, i, name, "yangquan", make(sel), "onehot") for i, (name, sel) in enumerate(levers)]


def round3():
    grid = [
        {"n_estimators": 300, "learning_rate": 0.05, "num_leaves": 31, "min_child_samples": 20},
        {"n_estimators": 600, "learning_rate": 0.03, "num_leaves": 31, "min_child_samples": 10},
        {"n_estimators": 800, "learning_rate": 0.02, "num_leaves": 63, "min_child_samples": 5},
        {"n_estimators": 400, "learning_rate": 0.05, "num_leaves": 15, "min_child_samples": 30},
        {"n_estimators": 600, "learning_rate": 0.03, "num_leaves": 31, "min_child_samples": 10, "colsample_bytree": 0.6},
        {"n_estimators": 600, "learning_rate": 0.03, "num_leaves": 31, "min_child_samples": 10, "subsample": 0.8, "subsample_freq": 1},
        {"n_estimators": 1200, "learning_rate": 0.01, "num_leaves": 127, "min_child_samples": 3, "reg_lambda": 5.0},
        {"n_estimators": 500, "learning_rate": 0.04, "num_leaves": 31, "min_child_samples": 20, "reg_alpha": 0.5, "reg_lambda": 1.0},
    ]
    out = []
    for i, params in enumerate(grid):
        out.append((3, i, f"lgbm:{json.dumps(params, ensure_ascii=False)}"[:64], "yangquan",
                    (lambda p, prm=params: model_zoo("lightgbm", prm)), "onehot"))
    return out


def round4():
    modes = ["onehot", "no_onehot", "hours_only", "temp_only", "no_none_flag",
             "extra_temp_range", "extra_hours_log", "extra_cross"]
    return [(4, i, f"condition:{mode}", "yangquan", (lambda p: model_zoo("lightgbm")), mode)
            for i, mode in enumerate(modes)]


def round5():
    variants = ["yangquan", "processed", "fill", "base", "zibo", "batch183"]
    rows = [(5, i, f"variant:{v}", v, (lambda p: model_zoo("lightgbm")), "onehot") for i, v in enumerate(variants)]
    rows.append((5, 6, "blend(et+lgbm+ridge)@yangquan", "yangquan", (lambda p: model_zoo("stacking")), "onehot"))
    rows.append((5, 7, "blend(et+lgbm+ridge)@processed", "processed", (lambda p: model_zoo("stacking")), "onehot"))
    return rows


ROUNDS = {0: round0, 1: round1, 2: round2, 3: round3, 4: round4, 5: round5}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", default="0,1,2,3,4,5")
    ap.add_argument("--groups", default="")
    ap.add_argument("--reset", action="store_true", help="清空 results.jsonl 后重跑")
    args = ap.parse_args()

    wanted_rounds = [int(x) for x in args.rounds.split(",") if x.strip() != ""]
    wanted_groups = {int(x) for x in args.groups.split(",") if x.strip() != ""} if args.groups else None
    if args.reset and RESULTS.exists():
        RESULTS.unlink()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    for round_no in wanted_rounds:
        for (r, g, label, variant, factory, mode) in ROUNDS[round_no]():
            if wanted_groups is not None and g not in wanted_groups:
                continue
            try:
                evaluate_group(r, g, label, variant, factory, mode)
            except Exception as error:  # 单组失败不终止整轮
                print(f"[R{r}G{g}] {label} FAILED: {type(error).__name__}: {error}", flush=True)
                with RESULTS.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"round": r, "group": g, "label": label, "variant": variant,
                                         "error": f"{type(error).__name__}: {error}"}, ensure_ascii=False) + "\n")
    print(f"done in {time.time() - started:.1f}s -> {RESULTS}", flush=True)


if __name__ == "__main__":
    main()
