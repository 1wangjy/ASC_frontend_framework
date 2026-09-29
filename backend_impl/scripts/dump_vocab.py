#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump each model variant's material_id one-hot vocabulary as JSON.

The one-hot positions live in every bundle's `input_feature_columns` as
`material_id__<material_id>_frac`, and the vocabulary is **variant specific**
(measured: yangquan 26 ids, processed 89 ids). Must be run with the model venv
(`backend_impl/python/model_predict/.venv/bin/python`) because the bundles need
scikit-learn/lightgbm/xgboost and the `TrainOnlyFeatureFilter` shim.

Usage:
  <model venv>/bin/python backend_impl/scripts/dump_vocab.py            # all variants
  <model venv>/bin/python backend_impl/scripts/dump_vocab.py yangquan  # one variant

Prints a single JSON object: {"variants": {"<variant>": ["61", "17", ...]}}
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MODEL_DIR = REPO / "backend_impl/python/model_predict/MODEL"
SELECTOR_DIR = MODEL_DIR / "outputs_selective_selector/models"
LEGACY_DIR = MODEL_DIR / "outputs/models"
ONEHOT_RE = re.compile(r"^material_id__(.+)_frac$")


def load_bundle(path: Path):
    import joblib

    return joblib.load(str(path))


def install_shim():
    """bundles were pickled from a training script run as __main__."""
    sys.path.insert(0, str(MODEL_DIR))
    for module_name in ("model_selective_selector", "model_property_more"):
        try:
            module = __import__(module_name)
        except Exception:
            continue
        import __main__

        if not hasattr(__main__, "TrainOnlyFeatureFilter"):
            __main__.TrainOnlyFeatureFilter = module.TrainOnlyFeatureFilter
        return


def variant_dirs():
    out = {}
    for root in (SELECTOR_DIR, LEGACY_DIR):
        if not root.is_dir():
            continue
        for variant_dir in sorted(root.iterdir()):
            if variant_dir.is_dir() and (variant_dir / "bulk_density.joblib").exists():
                out.setdefault(variant_dir.name, variant_dir)
    return out


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    install_shim()
    result = {}
    for variant, directory in variant_dirs().items():
        if only and variant != only:
            continue
        ids = set()
        for bundle_path in sorted(directory.glob("*.joblib")):
            try:
                bundle = load_bundle(bundle_path)
            except Exception as error:  # 单个属性模型加载失败不影响其它
                print(f"warn: {bundle_path.name}: {error}", file=sys.stderr)
                continue
            for column in bundle.get("input_feature_columns") or []:
                match = ONEHOT_RE.match(column)
                if match:
                    ids.add(match.group(1))
        result[variant] = sorted(ids, key=lambda v: (len(v), v))
    print(json.dumps({"variants": result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
