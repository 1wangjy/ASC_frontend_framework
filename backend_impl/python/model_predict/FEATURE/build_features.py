from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASETS = {
    "minmax": ROOT / "yangquan.npy",
    #"meanstd": ROOT / "dataset_clean_meanstd.npy",
}

NUMBER_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_number(value: Any) -> float:
    if value is None:
        return np.nan
    if isinstance(value, (int, float, np.integer, np.floating)):
        value = float(value)
        return value if math.isfinite(value) else np.nan
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return np.nan
    numbers = [float(match) for match in NUMBER_RE.findall(text)]
    if not numbers:
        return np.nan
    return float(np.mean(numbers))


def safe_name(value: Any, prefix: str = "col") -> str:
    text = "none" if value is None else str(value)
    cleaned = re.sub(r"[^0-9a-zA-Z]+", "_", text).strip("_").lower()
    if cleaned:
        return cleaned
    digest = hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()[:8]
    return f"{prefix}_{digest}"


def make_unique(name: str, seen: set[str]) -> str:
    candidate = name
    i = 2
    while candidate in seen:
        candidate = f"{name}_{i}"
        i += 1
    seen.add(candidate)
    return candidate


def load_dataset(path: Path) -> dict[str, Any]:
    data = np.load(path, allow_pickle=True)
    if getattr(data, "shape", None) == ():
        data = data.item()
    if not isinstance(data, dict) or "samples" not in data:
        raise ValueError(f"{path} is not the expected cleaned dataset dictionary.")
    return data


def get_feature_names(metadata: dict[str, Any], n_columns: int) -> list[str]:
    if metadata:
        first_source = next(iter(metadata.values()))
        names = list(first_source.get("X_comp_names", []))
        if len(names) == n_columns:
            return names
    return [f"comp_{idx}" for idx in range(n_columns)]


def normalized_weights(frame: pd.DataFrame) -> np.ndarray:
    if "ratio_pct" in frame:
        weights = pd.to_numeric(frame["ratio_pct"], errors="coerce").to_numpy(dtype=float)
    else:
        weights = np.ones(len(frame), dtype=float)
    weights = np.where(np.isfinite(weights) & (weights > 0), weights, 0.0)
    total = float(weights.sum())
    if total <= 0:
        return np.ones(len(frame), dtype=float) / max(len(frame), 1)
    return weights / total


def weighted_stats(values: np.ndarray, weights: np.ndarray) -> dict[str, float]:
    mask = np.isfinite(values) & np.isfinite(weights) & (weights >= 0)
    if not mask.any():
        return {
            "wmean": np.nan,
            "wstd": np.nan,
            "min": np.nan,
            "max": np.nan,
            "missing_frac": 1.0,
        }
    v = values[mask]
    w = weights[mask]
    w = w / w.sum() if w.sum() > 0 else np.ones_like(w) / len(w)
    mean = float(np.sum(v * w))
    variance = float(np.sum(((v - mean) ** 2) * w))
    return {
        "wmean": mean,
        "wstd": math.sqrt(max(variance, 0.0)),
        "min": float(np.min(v)),
        "max": float(np.max(v)),
        "missing_frac": float(1.0 - (mask.sum() / len(values))),
    }


def build_feature_row(
    sample: dict[str, Any],
    comp_names: list[str],
    categorical_columns: set[str] | None = None,
    drop_component_columns: set[str] | None = None,
) -> dict[str, Any]:
    x_comp = np.asarray(sample["X_comp"], dtype=object)
    frame = pd.DataFrame(x_comp, columns=comp_names)
    weights = normalized_weights(frame)

    row: dict[str, Any] = {
        "recipe_id": sample.get("recipe_id"),
        "dataset_source": sample.get("dataset_source"),
        "n_components": int(len(frame)),
        f"source__{safe_name(sample.get('dataset_source'), 'source')}": 1.0,
    }

    for idx, value in enumerate(np.asarray(sample.get("X_global", []), dtype=object)):
        row[f"global_{idx}"] = parse_number(value)

    categorical_columns = categorical_columns or {"material_id"}
    drop_component_columns = drop_component_columns or set()
    for col in comp_names:
        if col in drop_component_columns:
            continue
        if col in categorical_columns:
            for value, weight in zip(frame[col].tolist(), weights):
                if pd.isna(value):
                    continue
                feature = f"{safe_name(col)}__{safe_name(value, safe_name(col))}_frac"
                row[feature] = row.get(feature, 0.0) + float(weight)
            continue

        values = pd.to_numeric(frame[col], errors="coerce").to_numpy(dtype=float)
        stats = weighted_stats(values, weights)
        safe_col = safe_name(col)
        for stat_name, stat_value in stats.items():
            row[f"{safe_col}__{stat_name}"] = stat_value

    return row


def build_target_row(sample: dict[str, Any], target_names: dict[tuple[str, Any], str]) -> dict[str, Any]:
    row: dict[str, Any] = {"recipe_id": sample.get("recipe_id")}
    labels = sample.get("y_labels", {})
    if not isinstance(labels, dict):
        return row

    for property_name, conditions in labels.items():
        if not isinstance(conditions, dict):
            continue
        for condition, raw_value in conditions.items():
            target_key = (str(property_name), condition)
            row[target_names[target_key]] = parse_number(raw_value)
    return row


def collect_target_names(samples: list[dict[str, Any]]) -> tuple[dict[tuple[str, Any], str], dict[str, dict[str, str]]]:
    keys: list[tuple[str, Any]] = []
    for sample in samples:
        labels = sample.get("y_labels", {})
        if not isinstance(labels, dict):
            continue
        for property_name, conditions in labels.items():
            if not isinstance(conditions, dict):
                continue
            for condition in conditions:
                keys.append((str(property_name), condition))

    seen: set[str] = set()
    mapping: dict[tuple[str, Any], str] = {}
    metadata: dict[str, dict[str, str]] = {}
    for property_name, condition in sorted(set(keys), key=lambda item: (item[0], str(item[1]))):
        name = make_unique(f"{safe_name(property_name)}__{safe_name(condition)}", seen)
        mapping[(property_name, condition)] = name
        metadata[name] = {
            "property": property_name,
            "condition": "None" if condition is None else str(condition),
        }
    return mapping, metadata


def build_dataset(
    input_path: Path,
    variant: str,
    output_dir: Path,
    categorical_columns: set[str],
    drop_component_columns: set[str],
) -> None:
    data = load_dataset(input_path)
    samples = list(data["samples"])
    if not samples:
        raise ValueError(f"{input_path} contains no samples.")

    first_comp = np.asarray(samples[0]["X_comp"], dtype=object)
    comp_names = get_feature_names(data.get("metadata", {}), first_comp.shape[1])
    target_names, target_metadata = collect_target_names(samples)

    features = pd.DataFrame(
        [
            build_feature_row(sample, comp_names, categorical_columns, drop_component_columns)
            for sample in samples
        ]
    )
    targets = pd.DataFrame([build_target_row(sample, target_names) for sample in samples])

    for source in sorted(features["dataset_source"].dropna().unique()):
        source_col = f"source__{safe_name(source, 'source')}"
        if source_col not in features:
            features[source_col] = 0.0
    source_cols = [col for col in features.columns if col.startswith("source__")]
    features[source_cols] = features[source_cols].fillna(0.0)
    categorical_prefixes = tuple(f"{safe_name(col)}__" for col in categorical_columns)
    categorical_cols = [
        col
        for col in features.columns
        if col.startswith(categorical_prefixes) and col.endswith("_frac")
    ]
    features[categorical_cols] = features[categorical_cols].fillna(0.0)

    numeric_cols = features.select_dtypes(include=[np.number]).columns.tolist()
    all_nan_cols = [col for col in numeric_cols if features[col].isna().all()]

    output_dir.mkdir(parents=True, exist_ok=True)
    feature_path = output_dir / f"features_{variant}.csv"
    target_path = output_dir / f"targets_{variant}.csv"
    metadata_path = output_dir / f"metadata_{variant}.json"

    features.to_csv(feature_path, index=False, encoding="utf-8-sig")
    targets.to_csv(target_path, index=False, encoding="utf-8-sig")

    metadata = {
        "input_path": str(input_path),
        "variant": variant,
        "n_samples": len(samples),
        "n_features": int(features.shape[1] - 2),
        "component_feature_names": comp_names,
        "global_feature_names": next(iter(data.get("metadata", {}).values()), {}).get("X_global_names", []),
        "categorical_columns": sorted(categorical_columns),
        "dropped_component_columns": sorted(drop_component_columns),
        "categorical_missing_fill": 0.0,
        "target_columns": target_metadata,
        "all_nan_feature_columns": all_nan_cols,
        "dropped_all_nan_feature_columns": [],
        "all_nan_feature_column_handling": (
            "Kept in feature files; train-only model pipelines decide whether to drop them."
        ),
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[{variant}] wrote {feature_path} shape={features.shape}")
    print(f"[{variant}] wrote {target_path} shape={targets.shape}")
    print(f"[{variant}] wrote {metadata_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build fixed-width recipe features from cleaned npy datasets.")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "FEATURE" / "outputs_yangquan")
    parser.add_argument("--dataset", choices=sorted(DEFAULT_DATASETS), action="append")
    parser.add_argument(
        "--categorical-columns",
        type=str,
        default="material_id",
        help="Comma-separated component columns encoded as ratio-weighted fractions.",
    )
    parser.add_argument(
        "--drop-component-columns",
        type=str,
        default="base",
        help="Comma-separated component columns excluded from feature generation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    variants = args.dataset or list(DEFAULT_DATASETS)
    categorical_columns = {item.strip() for item in args.categorical_columns.split(",") if item.strip()}
    drop_component_columns = {
        item.strip() for item in args.drop_component_columns.split(",") if item.strip()
    }
    for variant in variants:
        build_dataset(
            DEFAULT_DATASETS[variant],
            variant,
            args.output_dir,
            categorical_columns,
            drop_component_columns,
        )


if __name__ == "__main__":
    main()
