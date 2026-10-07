#!/usr/bin/env python3
"""把 `_exp` 实验的前沿最优配置训练成平台可用的模型 bundle。

为什么需要它
-----------
平台推理服务（`API/app.py`）按 `outputs*/models/<variant>/<property>.joblib` 加载 bundle，
bundle 契约（实读自旧产物）：
    {version, variant, property, input_feature_columns, model_feature_columns,
     feature_columns, model_name, model(Pipeline), [condition_offsets]}
`_exp/model_opt` 与 `_exp/cold` 两轮实验给出的"每属性最优配置"（详见
`_exp/model_opt/summary.md`、`_exp/cold/summary_cold.md`）由本脚本落地为新 bundle：

    bulk_density      : LGBM + SelectFromModel(threshold="1.5*mean")
    cold_modulus      : ExtraTrees(300) + **trimmed 标签**（y_labels 重复值去极值）+ **按工况中心化**
    crushing_strength : XGBoost(默认)
    linear_change     : ExtraTrees(300)

训练用**全量**数据（部署口径；`_exp` 的 80/20 分数仅用于相对比较），并记录 3 折 GroupKFold 分数供追溯。

用法：
  python3 backend_impl/python/model_predict/scripts/train_exp_best_models.py            # 训练并导出
  python3 backend_impl/python/model_predict/scripts/train_exp_best_models.py --dry-run  # 只算分数不落盘
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

MODEL_PREDICT = Path(__file__).resolve().parents[1]
REPO = MODEL_PREDICT.parents[2]

for extra in (str(REPO / "_exp" / "model_opt"), str(REPO / "_exp" / "cold")):
    if extra not in sys.path:
        sys.path.insert(0, extra)

import driver as D  # noqa: E402  (_exp/model_opt)
import driver_cold as C  # noqa: E402  (_exp/cold)

from sklearn.ensemble import ExtraTreesRegressor  # noqa: E402
from sklearn.feature_selection import SelectFromModel  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.metrics import r2_score  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402

import joblib  # noqa: E402

VARIANT = "yangquan"
VERSION = "exp_best_2026-10-07"
OUT_DIR = MODEL_PREDICT / "MODEL" / "outputs_exp_best" / "models" / VARIANT


def make_pipeline(kind: str):
    """按实验结论构造推理管道（只含 sklearn 原生组件，避免旧产物的自定义类依赖）。"""
    if kind == "lgbm_sfm":
        from lightgbm import LGBMRegressor
        selector = SelectFromModel(
            LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1, n_estimators=200, learning_rate=0.05),
            threshold="1.5*mean",
        )
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("feature_selector", selector),
            ("model", LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1)),
        ]), "lgbm_sfm_1.5xmean"
    if kind == "xgboost":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("model", D.model_zoo("xgboost", {})),
        ]), "xgboost_default"
    if kind == "extra_trees":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("model", ExtraTreesRegressor(n_estimators=300, random_state=D.SEED, n_jobs=-1)),
        ]), "extra_trees_300"
    raise ValueError(f"未知配置: {kind}")


BEST = {
    "bulk_density": {"kind": "lgbm_sfm", "trimmed": False, "centered": False, "note": "模型侧最优（+SFM 1.5×mean）"},
    "cold_modulus": {"kind": "extra_trees", "trimmed": True, "centered": True,
                     "note": "抗折专项最优：trimmed 标签 + 按工况中心化"},
    "crushing_strength": {"kind": "xgboost", "trimmed": False, "centered": False, "note": "模型侧最优（xgboost 默认）"},
    "linear_change": {"kind": "extra_trees", "trimmed": False, "centered": False, "note": "基线即最优（extra_trees）"},
}


def build_frame(property_name: str, trimmed: bool):
    """返回 (X, y, groups, conditions)：列与 API 推理时组装的一致（基础特征 + 工况特征）。"""
    features = pd.read_csv(D.FEATURE_DIR / f"features_{VARIANT}.csv")
    metadata = json.loads((D.FEATURE_DIR / f"metadata_{VARIANT}.json").read_text(encoding="utf-8"))
    if trimmed:
        # trimmed 标签：y_labels 每工况 4 个重复值去掉 min/max 后取中间均值（_exp/cold 结论）
        targets = C.build_targets(VARIANT, "trimmed", features["recipe_id"].astype(str).tolist())
    else:
        targets = pd.read_csv(D.FEATURE_DIR / f"targets_{VARIANT}.csv")
    x, y, groups, meta = D.H.make_long_property_frame(property_name, features, targets, metadata)
    conditions = meta["condition"].astype(str).to_numpy()
    return x, pd.Series(np.asarray(y, dtype=float), index=x.index), groups, conditions


def score_model(x, y, groups, kind, trimmed, centered, folds=3):
    """3 折 GroupKFold 的 RMSE / R²（训练口径参考，不是留出集）。"""
    offsets = y.groupby(groups).transform("mean") * 0  # 占位，真正中心化按工况
    condition_mean = None
    if centered:
        condition_mean = y.groupby(_conditions).transform("mean")
    n_splits = max(2, min(folds, int(groups.nunique())))
    rmse_list, r2_list = [], []
    for tr, va in GroupKFold(n_splits=n_splits).split(x, y, groups):
        model, _ = make_pipeline(kind)
        fit_y = y.iloc[tr] - (condition_mean.iloc[tr] if centered else 0.0)
        model.fit(x.iloc[tr], fit_y)
        pred = model.predict(x.iloc[va]) + (condition_mean.iloc[va] if centered else 0.0)
        truth = y.iloc[va]
        rmse_list.append(float(np.sqrt(np.mean((truth - pred) ** 2))))
        r2_list.append(float(r2_score(truth, pred)))
    return {"cv_rmse": round(statistics.mean(rmse_list), 4), "cv_r2": round(statistics.mean(r2_list), 4),
            "folds": n_splits}


_conditions = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    global _conditions
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report = []
    for property_name, cfg in BEST.items():
        x, y, groups, conditions = build_frame(property_name, cfg["trimmed"])
        _conditions = pd.Series(conditions, index=x.index)
        model, model_name = make_pipeline(cfg["kind"])

        # 按工况中心化：偏移量来自训练集各工况均值（推理时用同一偏移加回）
        offsets = None
        fit_y = y
        if cfg["centered"]:
            per_condition = y.groupby(conditions).mean()
            global_mean = float(y.mean())
            offsets = {str(k): float(v) for k, v in per_condition.items()}
            offsets["__global__"] = global_mean
            fit_y = pd.Series(y.to_numpy() - pd.Series(conditions).map(per_condition).to_numpy(), index=x.index)

        metrics = score_model(x, y, groups, cfg["kind"], cfg["trimmed"], cfg["centered"])
        model.fit(x, fit_y)

        bundle = {
            "version": VERSION,
            "variant": VARIANT,
            "property": property_name,
            "input_feature_columns": list(x.columns),
            "model_feature_columns": list(x.columns),
            "feature_columns": list(x.columns),
            "model_name": model_name,
            "model": model,
            "trained_on": {"rows": int(len(y)), "recipes": int(groups.nunique()), "conditions": int(len(set(conditions)))},
            "labels": "trimmed(y_labels 去极值均值)" if cfg["trimmed"] else "targets CSV",
            "note": cfg["note"],
            "metrics_train_cv": metrics,
        }
        if offsets:
            bundle["condition_offsets"] = offsets
        if not args.dry_run:
            joblib.dump(bundle, OUT_DIR / f"{property_name}.joblib")
        report.append({"property": property_name, "model": model_name,
                       "rows": int(len(y)), "features": int(x.shape[1]),
                       "trimmed": cfg["trimmed"], "centered": cfg["centered"], **metrics})

    print(json.dumps({"version": VERSION, "variant": VARIANT, "out_dir": str(OUT_DIR), "models": report},
                     ensure_ascii=False, indent=2))
    if not args.dry_run:
        (OUT_DIR.parent.parent / "metrics_exp_best.json").write_text(
            json.dumps({"version": VERSION, "variant": VARIANT, "models": report}, ensure_ascii=False, indent=2),
            encoding="utf-8")
        print(f"-> {OUT_DIR}")


if __name__ == "__main__":
    main()
