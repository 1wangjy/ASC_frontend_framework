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
    "base": ROOT / "datasetv2.npy",
    "processed": ROOT / "dataset_processed.npy",
    "fill": ROOT / "dataset_fill.npy",
    "zibo": ROOT / "zibo.npy",
    "yangquan": ROOT / "yangquan.npy",
    "batch183": ROOT / "batch183.npy"
}

TARGET_CONDITION_MERGE = {
    "none": ["None"],
    "110": ["110℃", "110℃×24h"],
    "1100": ["1100℃", "1100℃×3h"],
    "1450": ["1450℃", "1450℃×1h", "1450℃×3h"],
    "1500": ["1500℃", "1450℃/1500℃"],
    "1300": ["1300℃"],
}

TARGET_CONDITION_DISPLAY = {
    "none": "None",
    "110": "110℃",
    "1100": "1100℃",
    "1450": "1450℃",
    "1300": "1300℃",
    "1500": "1500℃",
}

TARGET_CONDITION_ORDER = {"none": 0, "110": 1, "1100": 2, "1450": 3, "1300": 4, "1500": 5}

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


def normalize_condition(condition: Any) -> str:
    if condition is None:
        return "none"
    text = str(condition).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return "none"

    # Match longer/high-priority merged conditions before shorter substrings.
    if "1500" in text:
        return "1500"
    if "1450" in text:
        return "1450"
    if "1300" in text:
        return "1300"
    if "1100" in text:
        return "1100"
    if "110" in text:
        return "110"

    return safe_name(text, "condition")


def condition_display_name(merged_condition: str) -> str:
    return TARGET_CONDITION_DISPLAY.get(merged_condition, merged_condition)


def condition_sort_key(merged_condition: str) -> tuple[int, str]:
    return TARGET_CONDITION_ORDER.get(merged_condition, 99), merged_condition


def build_target_row(
    sample: dict[str, Any],
    target_names: dict[tuple[str, Any], str],
    merge_target_conditions: bool = False,
) -> dict[str, Any]:
    row: dict[str, Any] = {"recipe_id": sample.get("recipe_id")}
    labels = sample.get("y_labels", {})
    if not isinstance(labels, dict):
        return row

    if merge_target_conditions:
        grouped_values: dict[str, list[float]] = {}
        for property_name, conditions in labels.items():
            if not isinstance(conditions, dict):
                continue
            for condition, raw_value in conditions.items():
                target_key = (str(property_name), normalize_condition(condition))
                grouped_values.setdefault(target_names[target_key], []).append(parse_number(raw_value))

        for target_name, values in grouped_values.items():
            finite_values = [value for value in values if math.isfinite(value)]
            row[target_name] = float(np.mean(finite_values)) if finite_values else np.nan
        return row

    for property_name, conditions in labels.items():
        if not isinstance(conditions, dict):
            continue
        for condition, raw_value in conditions.items():
            target_key = (str(property_name), condition)
            row[target_names[target_key]] = parse_number(raw_value)
    return row


def collect_target_names(
    samples: list[dict[str, Any]],
    merge_target_conditions: bool = False,
) -> tuple[dict[tuple[str, Any], str], dict[str, dict[str, Any]]]:
    if merge_target_conditions:
        return collect_merged_target_names(samples)

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


def collect_merged_target_names(
    samples: list[dict[str, Any]],
) -> tuple[dict[tuple[str, Any], str], dict[str, dict[str, Any]]]:
    raw_conditions: dict[tuple[str, str], set[str]] = {}
    for sample in samples:
        labels = sample.get("y_labels", {})
        if not isinstance(labels, dict):
            continue
        for property_name, conditions in labels.items():
            if not isinstance(conditions, dict):
                continue
            for condition in conditions:
                property_key = str(property_name)
                merged_condition = normalize_condition(condition)
                raw_condition = "None" if condition is None else str(condition)
                raw_conditions.setdefault((property_key, merged_condition), set()).add(raw_condition)

    seen: set[str] = set()
    mapping: dict[tuple[str, Any], str] = {}
    metadata: dict[str, dict[str, Any]] = {}
    for property_name, merged_condition in sorted(
        raw_conditions,
        key=lambda item: (item[0], condition_sort_key(item[1])),
    ):
        name = make_unique(f"{safe_name(property_name)}__{merged_condition}", seen)
        mapping[(property_name, merged_condition)] = name
        metadata[name] = {
            "property": property_name,
            "condition": condition_display_name(merged_condition),
            "merged_condition": merged_condition,
            "raw_conditions": sorted(raw_conditions[(property_name, merged_condition)]),
        }
    return mapping, metadata


def collect_target_merge_report(
    samples: list[dict[str, Any]],
    target_names: dict[tuple[str, Any], str],
) -> pd.DataFrame:
    raw_stats: dict[tuple[str, str, str], dict[str, Any]] = {}
    merged_sample_values: dict[tuple[str, str], dict[Any, list[tuple[str, float]]]] = {}

    for sample in samples:
        recipe_id = sample.get("recipe_id")
        labels = sample.get("y_labels", {})
        if not isinstance(labels, dict):
            continue
        for property_name, conditions in labels.items():
            if not isinstance(conditions, dict):
                continue
            property_key = str(property_name)
            for condition, raw_value in conditions.items():
                merged_condition = normalize_condition(condition)
                raw_condition = "None" if condition is None else str(condition)
                parsed_value = parse_number(raw_value)
                stats_key = (property_key, merged_condition, raw_condition)
                stats = raw_stats.setdefault(
                    stats_key,
                    {
                        "raw_observation_count": 0,
                        "valid_numeric_count": 0,
                        "dataset_sources": set(),
                    },
                )
                stats["raw_observation_count"] += 1
                if math.isfinite(parsed_value):
                    stats["valid_numeric_count"] += 1
                if sample.get("dataset_source") is not None:
                    stats["dataset_sources"].add(str(sample.get("dataset_source")))
                merged_sample_values.setdefault((property_key, merged_condition), {}).setdefault(
                    recipe_id,
                    [],
                ).append((raw_condition, parsed_value))

    merged_counts: dict[tuple[str, str], dict[str, int]] = {}
    for key, sample_values in merged_sample_values.items():
        row_count = 0
        collision_count = 0
        for values in sample_values.values():
            if any(math.isfinite(value) for _, value in values):
                row_count += 1
            if len({raw_condition for raw_condition, _ in values}) > 1:
                collision_count += 1
        merged_counts[key] = {
            "merged_target_row_count": row_count,
            "samples_with_multiple_raw_conditions": collision_count,
        }

    rows: list[dict[str, Any]] = []
    for (property_name, merged_condition, raw_condition), stats in sorted(
        raw_stats.items(),
        key=lambda item: (item[0][0], condition_sort_key(item[0][1]), item[0][2]),
    ):
        target_name = target_names[(property_name, merged_condition)]
        rows.append(
            {
                "target": target_name,
                "property": property_name,
                "merged_condition": merged_condition,
                "merged_condition_display": condition_display_name(merged_condition),
                "raw_condition": raw_condition,
                "raw_observation_count": stats["raw_observation_count"],
                "valid_numeric_count": stats["valid_numeric_count"],
                "merged_target_row_count": merged_counts[(property_name, merged_condition)][
                    "merged_target_row_count"
                ],
                "samples_with_multiple_raw_conditions": merged_counts[(property_name, merged_condition)][
                    "samples_with_multiple_raw_conditions"
                ],
                "dataset_sources": ";".join(sorted(stats["dataset_sources"])),
            }
        )
    return pd.DataFrame(rows)


def build_dataset(
    input_path: Path,
    variant: str,
    output_dir: Path,
    categorical_columns: set[str],
    drop_component_columns: set[str],
    merge_target_conditions: bool = False,
) -> None:
    data = load_dataset(input_path)
    samples = list(data["samples"])
    if not samples:
        raise ValueError(f"{input_path} contains no samples.")

    first_comp = np.asarray(samples[0]["X_comp"], dtype=object)
    comp_names = get_feature_names(data.get("metadata", {}), first_comp.shape[1])
    target_names, target_metadata = collect_target_names(samples, merge_target_conditions)

    features = pd.DataFrame(
        [
            build_feature_row(sample, comp_names, categorical_columns, drop_component_columns)
            for sample in samples
        ]
    )
    targets = pd.DataFrame(
        [build_target_row(sample, target_names, merge_target_conditions) for sample in samples]
    )

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
    merge_report_path = output_dir / f"target_merge_report_{variant}.csv"

    features.to_csv(feature_path, index=False, encoding="utf-8-sig")
    targets.to_csv(target_path, index=False, encoding="utf-8-sig")
    if merge_target_conditions:
        collect_target_merge_report(samples, target_names).to_csv(
            merge_report_path,
            index=False,
            encoding="utf-8-sig",
        )

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
    if merge_target_conditions:
        metadata.update(
            {
                "target_condition_merge": TARGET_CONDITION_MERGE,
                "within_sample_duplicate_target_rule": (
                    "Mean of finite numeric values after raw conditions are merged."
                ),
            }
        )
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[{variant}] wrote {feature_path} shape={features.shape}")
    print(f"[{variant}] wrote {target_path} shape={targets.shape}")
    if merge_target_conditions:
        print(f"[{variant}] wrote {merge_report_path}")
    print(f"[{variant}] wrote {metadata_path}")

def parse_args(
    default_output_dir: Path | None = None,
    default_merge_target_conditions: bool = True,  # ✨ 将此处默认值改为 True
    description: str = "Build fixed-width recipe features from cleaned npy datasets.",
) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--output-dir", type=Path, default=default_output_dir or ROOT / "FEATURE" / "outputs")
    parser.add_argument("--dataset", choices=sorted(DEFAULT_DATASETS), action="append")
    parser.add_argument(
        "--merge-target-conditions",
        action="store_true",
        default=default_merge_target_conditions,  # 此处会同步继承上面的 True
        help="Merge equivalent y-label conditions and write target_merge_report_*.csv.",
    )
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

def main(
    default_output_dir: Path | None = None,
    default_merge_target_conditions: bool = False,
    description: str = "Build fixed-width recipe features from cleaned npy datasets.",
) -> None:
    args = parse_args(default_output_dir, default_merge_target_conditions, description)
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
            args.merge_target_conditions,
        )


if __name__ == "__main__":
    main()
