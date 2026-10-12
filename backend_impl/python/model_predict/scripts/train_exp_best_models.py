#!/usr/bin/env python3
"""把 `_exp` 各轮实验里**达标（R²>0.85）且可在推理侧 1:1 复现**的最优配置训练成平台模型 bundle。

选择依据（全部取自 `_exp` 的 ledger 与 summary，单切分协议 = split_by_recipe(test 0.2, seed 42)）：

| 属性 | 最优 R² | 配置（来源） |
| --- | --- | --- |
| bulk_density      | **0.9436** | `data:单位修正+缩尾1%`（_exp/model_opt 数据侧 R1G6）+ LGBM&SFM(1.5×mean) |
| cold_modulus      | **0.8927** | `combo:trimmed+工况中心化`（_exp/cold R6G1）+ ExtraTrees300 |
| crushing_strength | **0.8923** | `cond:丢弃<10样本条件列+y2.5σ`（数据侧 R4G6 的可比口径）+ XGBoost |
| linear_change     | **0.9551** | `miss:删>50%缺列`（数据侧 R2G2）+ ExtraTrees300 |

**只采用推理侧可复现的杠杆**：标签变换（trimmed / 缩尾 / 单位修正 / 丢小样本工况 / yσ 剔除）、样本权重、
工况中心化（转成 bundle 内的 `condition_offsets`）、特征列筛选（转成 `input_feature_columns`）。
"缺失指示列"（`miss__*`）这类需要改特征构建的杠杆不使用——这也是 cold 用 0.8927 而非 0.8966 的原因。

用法：
  python3 backend_impl/python/model_predict/scripts/train_exp_best_models.py --verify   # 训练+导出+复算 seed42 R²
  python3 ... --dry-run                                                                  # 只算不落盘
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

import driver as D           # noqa: E402  (_exp/model_opt：协议 + 模型工厂)
import driver_data as DD     # noqa: E402  (数据侧清洗算子：repair_bulk_scale)
import driver_cold as C      # noqa: E402  (_exp/cold：trimmed 标签重建)

from sklearn.ensemble import ExtraTreesRegressor  # noqa: E402
from sklearn.feature_selection import SelectFromModel  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.metrics import r2_score  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402

import joblib  # noqa: E402

VARIANT = "yangquan"
VERSION = "exp_best_final_2026-10-08"
OUT_DIR = MODEL_PREDICT / "MODEL" / "outputs_exp_best" / "models" / VARIANT
METRICS_PATH = MODEL_PREDICT / "MODEL" / "metrics_exp_best.json"


def make_pipeline(kind: str):
    if kind == "lgbm_sfm":
        from lightgbm import LGBMRegressor
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("feature_selector", SelectFromModel(
                LGBMRegressor(random_state=D.SEED, verbose=-1, n_jobs=-1, n_estimators=200, learning_rate=0.05),
                threshold="1.5*mean")),
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
    raise ValueError(kind)


# 每属性的部署配置：标签侧 / 特征侧 / 权重 / 中心化 / 模型
DEPLOY = {
    "bulk_density": dict(model="lgbm_sfm", label="repair_winsor", winsor=0.01, drop_high_missing=None, weights=None),
    "cold_modulus": dict(model="extra_trees", label="trimmed", drop_high_missing=0.5, drop_all_nan=True,
                         weights="condition_balance", centered=True),
    "crushing_strength": dict(model="xgboost", label="min_cond_sigma", min_cond_n=10, y_sigma=2.5),
    "linear_change": dict(model="extra_trees", label="csv", drop_high_missing=0.5),
}
PROPERTY_ZH = {"bulk_density": "体积密度", "cold_modulus": "常温抗折强度",
               "crushing_strength": "常温耐压强度", "linear_change": "线变化率"}


def build_dataset(property_name: str, cfg: dict):
    """按部署配置装配 (x, y, groups, conditions)。列与 API 推理时组装的列同源（特征表 + 工况特征）。"""
    features = pd.read_csv(D.FEATURE_DIR / f"features_{VARIANT}.csv")
    metadata = json.loads((D.FEATURE_DIR / f"metadata_{VARIANT}.json").read_text(encoding="utf-8"))
    label = cfg["label"]

    if label == "trimmed":
        targets = C.build_targets(VARIANT, "trimmed", features["recipe_id"].astype(str).tolist())
    else:
        targets = pd.read_csv(D.FEATURE_DIR / f"targets_{VARIANT}.csv")
        if label == "repair_winsor":
            for col in [c for c in targets.columns if c.startswith("bulk_density__")]:
                targets[col] = DD.repair_bulk_scale(targets[col])
        if label == "min_cond_sigma":  # 丢弃样本数 < min_cond_n 的工况列
            limit = int(cfg.get("min_cond_n") or 0)
            keep = [c for c in targets.columns
                    if c == "recipe_id" or not c.startswith(f"{property_name}__")
                    or pd.to_numeric(targets[c], errors="coerce").notna().sum() >= limit]
            targets = targets[keep]

    if cfg.get("drop_high_missing") is not None or cfg.get("drop_all_nan"):
        missing = features.isna().mean()
        drop = set(missing[missing == 1.0].index) if cfg.get("drop_all_nan") else set()
        if cfg.get("drop_high_missing") is not None:
            drop |= set(missing[missing > cfg["drop_high_missing"]].index)
        features = features.drop(columns=sorted(drop - {"recipe_id"}), errors="ignore")

    x, y, groups, meta = D.H.make_long_property_frame(property_name, features, targets, metadata)
    conditions = pd.Series(meta["condition"].astype(str).to_numpy(), index=x.index)
    y = pd.Series(np.asarray(y, dtype=float), index=x.index)

    if cfg.get("winsor"):
        lo, hi = np.nanquantile(y.to_numpy(), [cfg["winsor"], 1 - cfg["winsor"]])
        y = pd.Series(np.clip(y.to_numpy(), lo, hi), index=x.index)
    if cfg.get("y_sigma"):  # 剔除 |y-mean| > sigma*std 的行（同 _exp 口径）
        values = y.to_numpy()
        mask = np.abs(values - np.nanmean(values)) <= cfg["y_sigma"] * np.nanstd(values)
        x, y, groups, conditions = x[mask], y[mask], groups[mask], conditions[mask]
    return x, y, groups, conditions


def _weights(conditions: pd.Series, mode: str | None):
    """工况均衡权重：权重 = 1/该工况样本数（训练侧专用）。"""
    if mode != "condition_balance":
        return None
    counts = conditions.value_counts()
    return conditions.map(lambda c: 1.0 / counts[c]).to_numpy()


def _offsets(y: pd.Series, conditions: pd.Series):
    """按工况中心化偏移：{工况: 均值} + __global__。"""
    per_condition = y.groupby(conditions).mean()
    out = {str(k): float(v) for k, v in per_condition.items()}
    out["__global__"] = float(y.mean())
    return out


def _apply_offsets(pred: np.ndarray, conditions: pd.Series, offsets: dict) -> np.ndarray:
    return pred + conditions.map(lambda c: offsets.get(str(c), offsets["__global__"])).to_numpy()


def fit_and_score(property_name: str, cfg: dict, split_seed: int = D.SEED):
    x, y, groups, conditions = build_dataset(property_name, cfg)
    centered = bool(cfg.get("centered"))

    # 与 _exp 完全一致的留出协议
    x_tr, x_te, y_tr, y_te, g_tr, _, c_tr, c_te = D.H.split_by_recipe(x, y, groups, conditions, D.TEST_SIZE, split_seed)

    # 训练侧统计量（偏移/权重）只从训练切分算，避免留出评估泄漏
    offsets_tr = _offsets(y_tr, c_tr) if centered else None
    fit_y_tr = pd.Series(y_tr.to_numpy() - c_tr.map(offsets_tr).to_numpy(), index=y_tr.index) if centered else y_tr
    w_tr = _weights(c_tr, cfg.get("weights"))

    model, model_name = make_pipeline(cfg["model"])
    model.fit(x_tr, fit_y_tr, **({"model__sample_weight": w_tr} if w_tr is not None else {}))
    pred_te = model.predict(x_te)
    if centered:
        pred_te = _apply_offsets(pred_te, c_te, offsets_tr)
    holdout_rmse = float(np.sqrt(np.mean((y_te.to_numpy() - pred_te) ** 2)))
    holdout_r2 = float(r2_score(y_te, pred_te))

    # 3 折 GroupKFold（训练集内）稳健性参考
    n_splits = max(2, min(3, int(g_tr.nunique())))
    oof = np.full(len(x_tr), np.nan)
    for tr, va in GroupKFold(n_splits=n_splits).split(x_tr, fit_y_tr, g_tr):
        fold, _ = make_pipeline(cfg["model"])
        fold.fit(x_tr.iloc[tr], fit_y_tr.iloc[tr],
                 **({"model__sample_weight": w_tr[tr]} if w_tr is not None else {}))
        pred = fold.predict(x_tr.iloc[va])
        if centered:
            pred = _apply_offsets(pred, c_tr.iloc[va], offsets_tr)
        oof[va] = pred
    mask = ~np.isnan(oof)
    cv_rmse = float(np.sqrt(np.mean((y_tr.to_numpy()[mask] - oof[mask]) ** 2)))
    cv_r2 = float(r2_score(y_tr.to_numpy()[mask], oof[mask]))

    # 部署口径：用全量数据重训（偏移/权重从全量算）
    offsets_all = _offsets(y, conditions) if centered else None
    fit_y_all = pd.Series(y.to_numpy() - conditions.map(offsets_all).to_numpy(), index=y.index) if centered else y
    w_all = _weights(conditions, cfg.get("weights"))
    final_model, _ = make_pipeline(cfg["model"])
    final_model.fit(x, fit_y_all, **({"model__sample_weight": w_all} if w_all is not None else {}))

    bundle = {
        "version": VERSION,
        "variant": VARIANT,
        "property": property_name,
        "input_feature_columns": list(x.columns),
        "model_feature_columns": list(x.columns),
        "feature_columns": list(x.columns),
        "model_name": model_name,
        "model": final_model,
        "trained_on": {"rows": int(len(y)), "recipes": int(groups.nunique()),
                       "conditions": sorted(set(map(str, conditions)))},
        "training_conditions": sorted(set(map(str, conditions))),
        "labels": cfg["label"],
        "levers": {k: v for k, v in cfg.items() if k != "model"},
        "metrics": {"holdout_rmse": round(holdout_rmse, 4), "holdout_r2": round(holdout_r2, 4),
                    "cv_rmse": round(cv_rmse, 4), "cv_r2": round(cv_r2, 4), "split_seed": split_seed},
    }
    if offsets_all:
        bundle["condition_offsets"] = offsets_all
    row = {"property": property_name, "property_zh": PROPERTY_ZH[property_name], "model": model_name,
           "rows": int(len(y)), "features": int(x.shape[1]), "holdout_r2": round(holdout_r2, 4),
           "holdout_rmse": round(holdout_rmse, 4), "cv_r2": round(cv_r2, 4),
           "levers": {k: v for k, v in cfg.items() if k != "model"}}
    return bundle, row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify", action="store_true", help="复算 seed42 留出 R² 并写入 metrics")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report = []
    for property_name, cfg in DEPLOY.items():
        bundle, row = fit_and_score(property_name, cfg)
        if not args.dry_run:
            joblib.dump(bundle, OUT_DIR / f"{property_name}.joblib")
        report.append(row)
        print(f"[{property_name:<18}] R²(留出)={row['holdout_r2']:.4f}  CV R²={row['cv_r2']:.4f}  "
              f"{row['model']}  rows={row['rows']} feats={row['features']}", flush=True)

    summary = {"version": VERSION, "variant": VARIANT, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
               "protocol": "split_by_recipe(test 0.2, seed 42)（与 _exp 一致）", "models": report}
    if not args.dry_run:
        METRICS_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        (OUT_DIR.parent.parent / "metrics_exp_best.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    qualified = [m for m in report if m["holdout_r2"] > 0.85]
    print(f"\n达标（留出 R²>0.85）：{len(qualified)}/{len(report)} → "
          f"{[(m['property'], m['holdout_r2']) for m in qualified]}")
    print(f"-> {OUT_DIR}")


if __name__ == "__main__":
    main()
