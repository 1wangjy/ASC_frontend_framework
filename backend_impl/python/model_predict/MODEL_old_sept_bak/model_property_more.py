from __future__ import annotations

import argparse
import json
import math
import re
import sys
import warnings
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin, clone
from sklearn.ensemble import (
    AdaBoostRegressor,
    ExtraTreesRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.exceptions import ConvergenceWarning
from sklearn.kernel_ridge import KernelRidge
from sklearn.linear_model import BayesianRidge, ElasticNetCV, HuberRegressor, RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_validate
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
import io

# 强制将标准输出设置为 UTF-8，解决终端中文乱码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore", category=ConvergenceWarning)
PROPERTIES = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]

OPTIONAL_MODEL_IMPORT_ERRORS: dict[str, str] = {}

try:
    from xgboost import XGBRegressor
except Exception as exc:
    XGBRegressor = None
    OPTIONAL_MODEL_IMPORT_ERRORS["xgboost"] = str(exc)

try:
    from lightgbm import LGBMRegressor
except Exception as exc:
    LGBMRegressor = None
    OPTIONAL_MODEL_IMPORT_ERRORS["lightgbm"] = str(exc)

try:
    from catboost import CatBoostRegressor
except Exception as exc:
    CatBoostRegressor = None
    OPTIONAL_MODEL_IMPORT_ERRORS["catboost"] = str(exc)


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^0-9a-zA-Z._-]+", "_", str(value)).strip("_")
    return cleaned or "value"


def safe_feature_name(value: Any, prefix: str = "condition") -> str:
    text = "none" if value is None else str(value)
    cleaned = re.sub(r"[^0-9a-zA-Z]+", "_", text).strip("_").lower()
    return cleaned or f"{prefix}_none"


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return math.sqrt(mean_squared_error(y_true, y_pred))


class TrainOnlyFeatureFilter(BaseEstimator, TransformerMixin):
    """Drop all-missing and constant columns using only the data passed to fit."""

    def __init__(self, drop_all_nan: bool = True, drop_constant: bool = True):
        self.drop_all_nan = drop_all_nan
        self.drop_constant = drop_constant

    def fit(self, x: pd.DataFrame, y: pd.Series | None = None) -> "TrainOnlyFeatureFilter":
        frame = pd.DataFrame(x).copy()
        self.input_feature_names_ = list(frame.columns)
        keep_cols = list(frame.columns)
        if self.drop_all_nan:
            keep_cols = [col for col in keep_cols if not frame[col].isna().all()]
        if self.drop_constant:
            keep_cols = [col for col in keep_cols if frame[col].nunique(dropna=True) > 1]
        self.feature_names_out_ = keep_cols
        return self

    def transform(self, x: pd.DataFrame) -> pd.DataFrame:
        frame = pd.DataFrame(x).copy()
        return frame.loc[:, self.feature_names_out_]

    def get_feature_names_out(self, input_features: list[str] | None = None) -> np.ndarray:
        return np.asarray(self.feature_names_out_, dtype=object)


def get_pipeline_feature_names(model: Pipeline, input_feature_names: list[str]) -> list[str]:
    feature_filter = model.named_steps.get("feature_filter")
    if feature_filter is None:
        return input_feature_names
    return list(feature_filter.get_feature_names_out(input_feature_names))

def candidate_models(random_state: int) -> dict[str, Pipeline]:
    models: dict[str, Pipeline] = {
        "ridge": Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("scaler", StandardScaler()),
                ("model", RidgeCV(alphas=np.logspace(-4, 4, 17))),
            ]
        ),
        "extra_trees": Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                (
                    "model",
                    ExtraTreesRegressor(
                        n_estimators=200,          # 增加树的数量以提高稳定性
                        max_depth=None,            # 允许适当生长
                        min_samples_leaf=1,        # 允许更细致的叶子节点拟合
                        max_features="sqrt",
                        random_state=random_state,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                (
                    "model",
                    RandomForestRegressor(
                        n_estimators=200,
                        min_samples_leaf=1,
                        max_features="sqrt",
                        random_state=random_state,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
        "hist_gradient_boosting": Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                (
                    "model",
                    HistGradientBoostingRegressor(
                        max_iter=400,
                        learning_rate=0.03,
                        max_depth=6,              # 适当放开深度捕捉非线性规律
                        l2_regularization=0.01,
                        random_state=random_state,
                    ),
                ),
            ]
        ),
    }
    if XGBRegressor is not None:
        models["xgboost"] = Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                (
                    "model",
                    XGBRegressor(
                        n_estimators=150,
                        max_depth=4,
                        learning_rate=0.03,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        reg_lambda=1.0,
                        objective="reg:squarederror",
                        random_state=random_state,
                        n_jobs=1,
                        verbosity=0,
                    ),
                ),
            ]
        )
    if LGBMRegressor is not None:
        models["lightgbm"] = Pipeline(
            [
                ("feature_filter", TrainOnlyFeatureFilter()),
                ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                (
                    "model",
                    LGBMRegressor(
                        n_estimators=150,
                        learning_rate=0.03,
                        num_leaves=31,
                        min_child_samples=5,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        reg_lambda=1.0,
                        random_state=random_state,
                        n_jobs=1,
                        verbose=-1,
                    ),
                ),
            ]
        )
    return models



def prepare_base_features(features: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    groups = features["recipe_id"].astype(str).copy()
    drop_cols = [col for col in ["recipe_id", "dataset_source"] if col in features.columns]
    x = features.drop(columns=drop_cols)
    x = x.loc[:, ~x.columns.str.startswith("source__")]
    x = x.select_dtypes(include=[np.number]).copy()
    return x, groups


def condition_features(condition: str) -> dict[str, float]:
    is_none = condition in {"None", "None/无工况", "nan"} or pd.isna(condition)
    condition_text = "None" if is_none else str(condition)

    temps = [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)\s*℃", condition_text)]
    hours_match = re.search(r"[×xX]\s*(\d+(?:\.\d+)?)\s*h", condition_text)
    hours = float(hours_match.group(1)) if hours_match else 0.0

    result = {
        "condition_is_none": float(is_none),
        "condition_temp_min": float(np.min(temps)) if temps else np.nan,
        "condition_temp_max": float(np.max(temps)) if temps else np.nan,
        "condition_temp_mean": float(np.mean(temps)) if temps else np.nan,
        "condition_temp_count": float(len(temps)),
        "condition_hours": hours,
        "condition_has_hours": float(hours > 0),
    }
    result[f"condition__{safe_feature_name(condition_text)}"] = 1.0
    return result


def target_property_map(metadata: dict[str, Any]) -> dict[str, dict[str, str]]:
    raw = metadata.get("target_columns", {})
    return {
        target: {
            "property": str(info.get("property", target.split("__", 1)[0])),
            "condition": str(info.get("condition", "None")),
        }
        for target, info in raw.items()
    }


def make_long_property_frame(
    property_name: str,
    features: pd.DataFrame,
    targets: pd.DataFrame,
    metadata: dict[str, Any],
) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.DataFrame]:
    base_x, groups = prepare_base_features(features)
    target_info = target_property_map(metadata)
    target_cols = [
        col
        for col in targets.columns
        if col != "recipe_id" and target_info.get(col, {}).get("property") == property_name
    ]

    frames = []
    meta_frames = []
    for target_col in target_cols:
        condition = target_info[target_col]["condition"]
        print(f"正在处理目标列: {target_col} -> 对应的工况: {condition}")
        mask = targets[target_col].notna()
        if not mask.any():
            continue

        condition_row = condition_features(condition)
        repeated_condition = pd.DataFrame([condition_row] * int(mask.sum()), index=base_x.loc[mask].index)
        x_part = pd.concat([base_x.loc[mask], repeated_condition], axis=1)
        x_part = x_part.fillna({col: 0.0 for col in x_part.columns if col.startswith("condition__")})

        frames.append(
            pd.DataFrame(
                {
                    "group": groups.loc[mask].to_numpy(),
                    "target": targets.loc[mask, target_col].astype(float).to_numpy(),
                    **{col: x_part[col].to_numpy() for col in x_part.columns},
                }
            )
        )
        meta_frames.append(
            pd.DataFrame(
                {
                    "recipe_id": targets.loc[mask, "recipe_id"].astype(str).to_numpy(),
                    "property": property_name,
                    "target_column": target_col,
                    "condition": condition,
                    "y_true": targets.loc[mask, target_col].astype(float).to_numpy(),
                }
            )
        )

    if not frames:
        return pd.DataFrame(), pd.Series(dtype=float), pd.Series(dtype=str), pd.DataFrame()

    long = pd.concat(frames, ignore_index=True).fillna(np.nan)
    meta = pd.concat(meta_frames, ignore_index=True)
    y = long.pop("target").astype(float)
    out_groups = long.pop("group").astype(str)

    x = long.select_dtypes(include=[np.number]).copy()
    condition_cols = [col for col in x.columns if col.startswith("condition__")]
    x[condition_cols] = x[condition_cols].fillna(0.0)

    meta = meta.reset_index(drop=True)
    y = y.reset_index(drop=True)
    out_groups = out_groups.reset_index(drop=True)
    x = x.reset_index(drop=True)
    return x, y, out_groups, meta


def split_by_recipe(
    x: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    meta: pd.DataFrame,
    test_size: float,
    random_state: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.Series, pd.Series, pd.DataFrame, pd.DataFrame]:
    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(splitter.split(x, y, groups))
    return (
        x.iloc[train_idx].reset_index(drop=True),
        x.iloc[test_idx].reset_index(drop=True),
        y.iloc[train_idx].reset_index(drop=True),
        y.iloc[test_idx].reset_index(drop=True),
        groups.iloc[train_idx].reset_index(drop=True),
        groups.iloc[test_idx].reset_index(drop=True),
        meta.iloc[train_idx].reset_index(drop=True),
        meta.iloc[test_idx].reset_index(drop=True),
    )


def evaluate_model(
    name: str,
    model: Pipeline,
    x_train: pd.DataFrame,
    y_train: pd.Series,
    groups_train: pd.Series,
    n_splits: int,
) -> dict[str, float | str]:
    cv = GroupKFold(n_splits=n_splits)
    scores = cross_validate(
        model,
        x_train,
        y_train,
        cv=cv,
        groups=groups_train,
        scoring={
            "rmse": "neg_root_mean_squared_error",
            "mae": "neg_mean_absolute_error",
            "r2": "r2",
        },
        n_jobs=1,
    )
    return {
        "model": name,
        "cv_rmse_mean": float(-scores["test_rmse"].mean()),
        "cv_rmse_std": float(scores["test_rmse"].std()),
        "cv_mae_mean": float(-scores["test_mae"].mean()),
        "cv_r2_mean": float(scores["test_r2"].mean()),
    }


def train_property(
    variant: str,
    property_name: str,
    features: pd.DataFrame,
    targets: pd.DataFrame,
    metadata: dict[str, Any],
    output_dir: Path,
    min_samples: int,
    max_cv_folds: int,
    test_size: float,
    random_state: int,
    selected_models: set[str] | None,
) -> list[dict[str, Any]]:
    x, y, groups, meta = make_long_property_frame(property_name, features, targets, metadata)
    n_observations = len(y)
    n_recipes = int(groups.nunique()) if n_observations else 0
    n_conditions = int(meta["condition"].nunique()) if n_observations else 0

    if n_observations < min_samples or n_recipes < 3:
        return [
            {
                "variant": variant,
                "property": property_name,
                "status": "skipped_too_few_samples",
                "n_observations": n_observations,
                "n_recipes": n_recipes,
                "n_conditions": n_conditions,
            }
        ]

    all_models = candidate_models(random_state)
    if selected_models:
        all_models = {name: model for name, model in all_models.items() if name in selected_models}
    if not all_models:
        raise ValueError("No candidate models selected.")

    (
        x_train,
        x_test,
        y_train,
        y_test,
        groups_train,
        groups_test,
        _meta_train,
        meta_test,
    ) = split_by_recipe(x, y, groups, meta, test_size, random_state)

    n_splits = min(max(2, max_cv_folds), groups_train.nunique())
    cv_rows = [evaluate_model(name, model, x_train, y_train, groups_train, n_splits) for name, model in all_models.items()]
    best = min(cv_rows, key=lambda row: row["cv_rmse_mean"])
    best_name = str(best["model"])

    best_model = clone(all_models[best_name])
    best_model.fit(x_train, y_train)
    test_pred = best_model.predict(x_test)
    test_metrics = {
        "test_rmse": rmse(y_test, test_pred),
        "test_mae": mean_absolute_error(y_test, test_pred),
        "test_r2": r2_score(y_test, test_pred),
    }

    final_model = clone(all_models[best_name])
    final_model.fit(x, y)

    model_dir = output_dir / "models" / variant
    pred_dir = output_dir / "predictions" / variant
    importance_dir = output_dir / "feature_importance" / variant
    for directory in [model_dir, pred_dir, importance_dir]:
        directory.mkdir(parents=True, exist_ok=True)

    input_feature_columns = x.columns.tolist()
    model_feature_columns = get_pipeline_feature_names(final_model, input_feature_columns)
    joblib.dump(
        {
            "version": "V2_by_property",
            "variant": variant,
            "property": property_name,
            "input_feature_columns": input_feature_columns,
            "model_feature_columns": model_feature_columns,
            "feature_columns": model_feature_columns,
            "model_name": best_name,
            "model": final_model,
        },
        model_dir / f"{safe_filename(property_name)}.joblib",
    )

    pred_frame = meta_test.copy()
    pred_frame["y_pred"] = test_pred
    pred_frame["residual"] = y_test.to_numpy() - test_pred
    pred_frame["recipe_group"] = groups_test.to_numpy()
    pred_frame.to_csv(pred_dir / f"{safe_filename(property_name)}.csv", index=False, encoding="utf-8-sig")

    tree_model = final_model.named_steps.get("model")
    if hasattr(tree_model, "feature_importances_"):
        importance = pd.DataFrame(
            {
                "feature": model_feature_columns,
                "importance": tree_model.feature_importances_,
                "importance_type": "model_feature_importance",
            }
        ).sort_values("importance", ascending=False)
    else:
        importance_result = permutation_importance(
            best_model,
            x_test,
            y_test,
            n_repeats=5,
            random_state=random_state,
            scoring="neg_root_mean_squared_error",
            n_jobs=1,
        )
        importance = pd.DataFrame(
            {
                "feature": input_feature_columns,
                "importance": importance_result.importances_mean,
                "importance_std": importance_result.importances_std,
                "importance_type": "permutation_importance_on_test",
            }
        ).sort_values("importance", ascending=False)
    importance.head(80).to_csv(
        importance_dir / f"{safe_filename(property_name)}.csv", index=False, encoding="utf-8-sig"
    )

    rows = []
    condition_counts = meta.groupby("condition")["y_true"].count().sort_values(ascending=False).to_dict()
    for row in cv_rows:
        rows.append(
            {
                "variant": variant,
                "property": property_name,
                "status": "trained" if row["model"] == best_name else "candidate",
                "best_model": best_name,
                "n_observations": n_observations,
                "n_recipes": n_recipes,
                "n_conditions": n_conditions,
                "condition_counts": condition_counts,
                "n_input_features": len(input_feature_columns),
                "n_model_features": len(model_feature_columns),
                "n_features": len(model_feature_columns),
                **row,
                **test_metrics,
            }
        )

    print(
        f"[{variant}] {property_name}: rows={n_observations}, recipes={n_recipes}, "
        f"conditions={n_conditions}, best={best_name}, cv_rmse={best['cv_rmse_mean']:.4g}"
    )
    return rows


def train_variant(
    variant: str,
    feature_path: Path,
    target_path: Path,
    metadata_path: Path,
    output_dir: Path,
    min_samples: int,
    max_cv_folds: int,
    test_size: float,
    random_state: int,
    selected_models: set[str] | None,
) -> pd.DataFrame:
    features = pd.read_csv(feature_path)
    targets = pd.read_csv(target_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    rows = []
    for property_name in PROPERTIES:
        rows.extend(
            train_property(
                variant=variant,
                property_name=property_name,
                features=features,
                targets=targets,
                metadata=metadata,
                output_dir=output_dir,
                min_samples=min_samples,
                max_cv_folds=max_cv_folds,
                test_size=test_size,
                random_state=random_state,
                selected_models=selected_models,
            )
        )

    metrics = pd.DataFrame(rows)
    metrics_path = output_dir / f"metrics_{variant}.csv"
    metrics.to_csv(metrics_path, index=False, encoding="utf-8-sig")
    print(f"[{variant}] wrote {metrics_path}")
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train V2 property-level regressors by pooling conditions within each y_label property."
    )
    parser.add_argument("--feature-dir", type=Path, default=ROOT / "FEATURE" / "outputs")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "MODEL" / "outputs")
    parser.add_argument("--min-samples", type=int, default=30)
    parser.add_argument("--max-cv-folds", type=int, default=3)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument(
        "--models",
        type=str,
        default=(
            "ridge,elastic_net,bayesian_ridge,huber,svr_rbf,kernel_ridge_rbf,knn_distance,"
            "extra_trees,random_forest,gradient_boosting,ada_boost,hist_gradient_boosting,"
            "xgboost,lightgbm,catboost"
        ),
        help="Comma-separated subset of available models.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    selected_models = {item.strip() for item in args.models.split(",") if item.strip()} if args.models else None
    args.output_dir.mkdir(parents=True, exist_ok=True)

    all_metrics = []
    for feature_path in sorted(args.feature_dir.glob("features_*.csv")):
        variant = feature_path.stem.replace("features_", "", 1)
        target_path = args.feature_dir / f"targets_{variant}.csv"
        metadata_path = args.feature_dir / f"metadata_{variant}.json"
        if not target_path.exists() or not metadata_path.exists():
            print(f"[{variant}] skipped: missing targets or metadata")
            continue
        all_metrics.append(
            train_variant(
                variant=variant,
                feature_path=feature_path,
                target_path=target_path,
                metadata_path=metadata_path,
                output_dir=args.output_dir,
                min_samples=args.min_samples,
                max_cv_folds=args.max_cv_folds,
                test_size=args.test_size,
                random_state=args.random_state,
                selected_models=selected_models,
            )
        )

    if all_metrics:
        combined = pd.concat(all_metrics, ignore_index=True)
        combined_path = args.output_dir / "metrics_all.csv"
        combined.to_csv(combined_path, index=False, encoding="utf-8-sig")
        print(f"wrote {combined_path}")


if __name__ == "__main__":
    main()