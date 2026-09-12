from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[1]
FEATURE_DIR = ROOT / "FEATURE"
MODEL_DIR = ROOT / "MODEL"
MODEL_OUTPUT_DIR = MODEL_DIR / "outputs"
DEFAULT_VARIANT = "minmax"

for module_dir in (FEATURE_DIR, MODEL_DIR):
    module_path = str(module_dir)
    if module_path not in sys.path:
        sys.path.insert(0, module_path)

from build_features import build_feature_row  # noqa: E402
import model_property_more as model_utils  # noqa: E402


# The existing joblib files were trained by running MODEL/model_property_more.py
# as a script, so pickle looks for this class on __main__ during loading.
sys.modules["__main__"].TrainOnlyFeatureFilter = model_utils.TrainOnlyFeatureFilter


PROPERTY_UNITS = {
    "bulk_density": "g/cm3",
    "cold_modulus": "MPa",
    "crushing_strength": "MPa",
    "linear_change": "%",
}

PROPERTY_NAMES_ZH = {
    "bulk_density": "体积密度",
    "cold_modulus": "常温抗折强度",
    "crushing_strength": "常温耐压强度",
    "linear_change": "线变化率",
}

MODEL_CACHE: Dict[tuple[str, str], Dict[str, Any]] = {}



def _install_sklearn_compat() -> None:
    """Older scikit-learn pickles lack attributes newer versions read (notably
    SimpleImputer._fill_dtype). Install a class-level fallback once at import so
    any nested imputer in any loaded pipeline works under the newer sklearn."""
    from sklearn.impute import SimpleImputer
    if getattr(SimpleImputer, "_pw_fill_dtype_patched", False):
        return

    def _get_fill_dtype(self):
        d = getattr(self, "_fit_dtype", None)
        if d is None:
            stats = getattr(self, "statistics_", None)
            d = getattr(stats, "dtype", None)
        return d if d is not None else "float64"

    SimpleImputer._fill_dtype = property(_get_fill_dtype)
    SimpleImputer._pw_fill_dtype_patched = True


def _fix_sklearn_compat(bundle: Dict[str, Any]) -> Dict[str, Any]:
    _install_sklearn_compat()
    return bundle



class NpySampleInput(BaseModel):
    recipe_id: Optional[str] = Field(default=None, description="配方编号，对应 npy samples[].recipe_id")
    X_comp: List[List[Any]] = Field(description="组分二维数组，对应 npy samples[].X_comp")
    X_global: Union[Dict[str, Any], List[Any]] = Field(
        default_factory=list,
        description="全局工艺参数，对应 npy samples[].X_global。建议按 metadata.yangquan.X_global_names 顺序传数组。",
    )
    y_labels: Optional[Dict[str, Any]] = Field(
        default=None,
        description="真实标签。预测时不会使用，可不传；传入时会被原样忽略。",
    )
    remark: Optional[str] = Field(default=None, description="备注。预测时不会使用。")
    dataset_source: Optional[str] = Field(default="frontend", description="数据来源标识")


class PredictRequest(BaseModel):
    request_id: Optional[str] = Field(default=None, description="前端请求追踪 ID")
    sample: NpySampleInput = Field(description="单条 npy samples[] 格式数据")
    conditions: Optional[List[str]] = Field(
        default=None,
        description="预测工况。不传时按每个属性已训练工况全部预测。",
    )
    properties: Optional[List[str]] = Field(
        default=None,
        description="预测性能属性。不传时返回当前版本下全部可用属性。",
    )


class BatchPredictRequest(BaseModel):
    request_id: Optional[str] = None
    items: List[PredictRequest]


class SimplePredictRequest(BaseModel):
    X_comp: List[List[Any]] = Field(description="组分二维数组，列顺序同 yangquan.npy samples[].X_comp")
    X_global: Union[Dict[str, Any], List[Any]] = Field(
        default_factory=list,
        description="全局工艺参数，推荐数组顺序：[water_amount, hardening_time, hardening_time_uncertainty]",
    )
    conditions: Optional[List[str]] = Field(
        default=None,
        description="预测工况。不传时按每个属性已训练工况全部预测。",
    )
    properties: Optional[List[str]] = Field(
        default=None,
        description="预测性能属性。不传时返回全部可用属性。",
    )


def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("MODEL_API_KEY")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid API key."})


def api_key_enabled() -> bool:
    return bool(os.getenv("MODEL_API_KEY"))


def load_metadata(variant: str) -> Dict[str, Any]:
    path = FEATURE_DIR / "outputs" / f"metadata_{variant}.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={"code": "VARIANT_NOT_FOUND", "message": f"Metadata not found for variant '{variant}'."},
        )
    return json.loads(path.read_text(encoding="utf-8"))


def available_properties(variant: str) -> List[str]:
    model_dir = MODEL_OUTPUT_DIR / "models" / variant
    if not model_dir.exists():
        return []
    return sorted(path.stem for path in model_dir.glob("*.joblib"))


def load_model_bundle(variant: str, property_name: str) -> Dict[str, Any]:
    cache_key = (variant, property_name)
    if cache_key in MODEL_CACHE:
        return MODEL_CACHE[cache_key]

    path = MODEL_OUTPUT_DIR / "models" / variant / f"{property_name}.joblib"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "code": "PROPERTY_NOT_FOUND",
                "message": f"Model not found for property '{property_name}' and variant '{variant}'.",
            },
        )

    bundle = joblib.load(path)
    bundle = _fix_sklearn_compat(bundle)
    MODEL_CACHE[cache_key] = bundle
    return bundle


def finite_or_none(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def normalized_x_comp(sample: NpySampleInput, metadata: Dict[str, Any]) -> List[List[Any]]:
    if not sample.X_comp:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_X_COMP", "message": "sample.X_comp must contain at least one component row."},
        )

    names = list(metadata["component_feature_names"])
    rows: List[List[Any]] = []
    for index, row in enumerate(sample.X_comp):
        if len(row) < 2:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_X_COMP_ROW",
                    "message": f"sample.X_comp[{index}] must contain at least material_id and ratio_pct.",
                },
            )
        if len(row) < len(names):
            rows.append(row + [None] * (len(names) - len(row)))
        else:
            rows.append(row[: len(names)])
    return rows


def global_values(x_global: Union[Dict[str, Any], List[Any]], metadata: Dict[str, Any]) -> List[Any]:
    names = list(metadata.get("global_feature_names", []))
    if isinstance(x_global, list):
        values = x_global[: len(names)]
        return values + [None] * (len(names) - len(values))

    values = []
    for index, name in enumerate(names):
        values.append(x_global.get(name, x_global.get(f"global_{index}")))
    return values


def build_base_features(sample_input: NpySampleInput, metadata: Dict[str, Any]) -> pd.DataFrame:
    sample = {
        "recipe_id": sample_input.recipe_id or "frontend-request",
        "dataset_source": sample_input.dataset_source or "frontend",
        "X_comp": normalized_x_comp(sample_input, metadata),
        "X_global": global_values(sample_input.X_global, metadata),
    }
    row = build_feature_row(
        sample,
        comp_names=list(metadata["component_feature_names"]),
        categorical_columns=set(metadata.get("categorical_columns", ["material_id"])),
        drop_component_columns=set(metadata.get("dropped_component_columns", ["base"])),
    )
    frame = pd.DataFrame([row])
    x_base, _groups = model_utils.prepare_base_features(frame)
    return x_base


def build_model_input(base_x: pd.DataFrame, condition: str, bundle: Dict[str, Any]) -> pd.DataFrame:
    condition_row = model_utils.condition_features(condition)
    x_condition = pd.DataFrame([condition_row], index=base_x.index)
    x = pd.concat([base_x, x_condition], axis=1)

    input_columns = list(bundle["input_feature_columns"])
    for col in input_columns:
        if col not in x.columns:
            x[col] = 0.0 if col.startswith("condition__") else np.nan
    x = x.loc[:, input_columns]

    condition_cols = [col for col in x.columns if col.startswith("condition__")]
    x[condition_cols] = x[condition_cols].fillna(0.0)
    return x


def trained_conditions(metadata: Dict[str, Any], property_name: Optional[str] = None) -> List[str]:
    result = set()
    for target_info in metadata.get("target_columns", {}).values():
        if property_name and target_info.get("property") != property_name:
            continue
        condition = target_info.get("condition")
        if condition:
            result.add(str(condition))
    return sorted(result)


def predict_one(request: PredictRequest) -> Dict[str, Any]:
    variant = DEFAULT_VARIANT
    metadata = load_metadata(variant)
    properties = request.properties or available_properties(variant)
    if not properties:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_MODELS", "message": f"No models found for variant '{variant}'."},
        )
    if request.conditions is not None and not request.conditions:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_CONDITIONS", "message": "conditions must contain at least one item when provided."},
        )

    invalid = [name for name in properties if name not in available_properties(variant)]
    if invalid:
        raise HTTPException(
            status_code=404,
            detail={"code": "PROPERTY_NOT_FOUND", "message": f"Unsupported properties: {invalid}."},
        )

    base_x = build_base_features(request.sample, metadata)
    warnings = []
    predictions = []

    for property_name in properties:
        bundle = load_model_bundle(variant, property_name)
        known_conditions = set(trained_conditions(metadata, property_name))
        predict_conditions = request.conditions or trained_conditions(metadata, property_name)
        for condition in predict_conditions:
            if known_conditions and condition not in known_conditions:
                warnings.append(
                    {
                        "code": "UNTRAINED_CONDITION",
                        "message": f"{property_name} has no direct training target for condition '{condition}'.",
                    }
                )

            x = build_model_input(base_x, condition, bundle)
            value = finite_or_none(bundle["model"].predict(x)[0])
            predictions.append(
                {
                    "property": property_name,
                    "property_name_zh": PROPERTY_NAMES_ZH.get(property_name, property_name),
                    "condition": condition,
                    "value": value,
                    "unit": PROPERTY_UNITS.get(property_name),
                    "model": {
                        "variant": bundle.get("variant", variant),
                        "version": bundle.get("version"),
                        "name": bundle.get("model_name"),
                    },
                    "input_feature_count": len(bundle.get("input_feature_columns", [])),
                }
            )

    return {
        "request_id": request.request_id,
        "recipe_id": request.sample.recipe_id,
        "variant": variant,
        "predictions": predictions,
        "warnings": warnings,
    }


def metrics_summary(variant: str) -> List[Dict[str, Any]]:
    path = MODEL_OUTPUT_DIR / f"metrics_{variant}.csv"
    if not path.exists():
        return []
    metrics = pd.read_csv(path)
    if "status" in metrics.columns:
        metrics = metrics.loc[metrics["status"] == "trained"].copy()
    keep = [
        "property",
        "best_model",
        "n_observations",
        "n_recipes",
        "n_conditions",
        "cv_rmse_mean",
        "cv_mae_mean",
        "cv_r2_mean",
        "test_rmse",
        "test_mae",
        "test_r2",
    ]
    keep = [col for col in keep if col in metrics.columns]
    return metrics[keep].to_dict(orient="records")


app = FastAPI(
    title="Refractory Property Prediction API",
    version="1.0.0",
    description="HTTP API wrapper for the local yangquan refractory material property models.",
)

cors_origins = [item.strip() for item in os.getenv("MODEL_API_CORS_ORIGINS", "*").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "default_variant": DEFAULT_VARIANT,
        "api_key_enabled": api_key_enabled(),
        "models": {DEFAULT_VARIANT: available_properties(DEFAULT_VARIANT)},
    }


@app.get("/api/v1/model/metadata", dependencies=[Depends(verify_api_key)])
def get_model_metadata(variant: str = DEFAULT_VARIANT) -> Dict[str, Any]:
    metadata = load_metadata(variant)
    return {
        "variant": variant,
        "properties": [
            {
                "property": name,
                "property_name_zh": PROPERTY_NAMES_ZH.get(name, name),
                "unit": PROPERTY_UNITS.get(name),
                "trained_conditions": trained_conditions(metadata, name),
            }
            for name in available_properties(variant)
        ],
        "component_feature_names": metadata.get("component_feature_names", []),
        "global_feature_names": metadata.get("global_feature_names", []),
        "categorical_columns": metadata.get("categorical_columns", []),
        "dropped_component_columns": metadata.get("dropped_component_columns", []),
        "target_condition_merge": metadata.get("target_condition_merge", {}),
        "metrics": metrics_summary(variant),
    }


@app.post("/api/v1/predict", dependencies=[Depends(verify_api_key)])
def predict(request: PredictRequest) -> Dict[str, Any]:
    return predict_one(request)


@app.post("/api/v1/predict/simple", dependencies=[Depends(verify_api_key)])
def predict_simple(request: SimplePredictRequest) -> Dict[str, Any]:
    wrapped = PredictRequest(
        sample=NpySampleInput(
            X_comp=request.X_comp,
            X_global=request.X_global,
        ),
        conditions=request.conditions,
        properties=request.properties,
    )
    return predict_one(wrapped)


@app.post("/api/v1/predict/batch", dependencies=[Depends(verify_api_key)])
def predict_batch(request: BatchPredictRequest) -> Dict[str, Any]:
    return {
        "request_id": request.request_id,
        "items": [predict_one(item) for item in request.items],
    }
