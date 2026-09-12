#!/usr/bin/env python3
"""⚠️ DEPRECATED (废弃) — 旧占位预测桥(recipe_opt 96 原料空间)。
规范预测由 backend_impl/python/model_predict (example 模型服务, /api/v1) 提供。
"""
# -*- coding: utf-8 -*-
"""
recipe_predict_bridge.py — Model1 性能预测 (GET /api/model1/materials,
POST /api/model1/predict) standalone backend.

Reads ONE JSON object from stdin. Two request shapes:

1. list materials
   {"action": "list_materials"}
   -> stdout JSON {"ok": true, "source": "recipe_opt", "count": 96,
                   "materials": [{"name": str, "index": int}, ...]}

2. predict properties for one composition (percentages over the 96-material
   search space of recipe_opt)
   {"action": "predict", "recipe": {"<material_name>": <percent 0..100>, ...}}
   -> stdout JSON
   {
     "ok": true,
     "source": "recipe_opt",
     "predicted": {"<property Chinese name, e.g. 耐压强度[110℃]>": float, ...},
     "used":    {"<name in 96 space>": percent},      // what the model actually saw
     "unused":  {"<name NOT in 96 space>": percent},  // skipped / unmatched
     "normalization": {"applied": bool, "raw_sum": float, "scale": float},
     "property_names": [...],                          // canonical 19-label order
     "material_count": 96
   }

Recipe semantics
----------------
* Materials are matched EXACTLY against RecipePredictor.material_names (the
  96-material map in map_merged.json). Anything else is reported under
  `unused` and never fed to the model.
* Values are percentages. If the used proportion does not sum to 100 the
  composition is scaled to 100 before prediction (the recipe_opt model was
  trained on sum-to-100 compositions) and `normalization` reports the applied
  scale together with the raw sum.
* Prediction is deterministic and single-shot: the pipeline is loaded once,
  `predict_from_recipe` is called exactly once, the process exits.

stdout carries ONLY the one JSON payload (logs -> stderr). Exit code 0 on
success, non-zero on failure. sklearn version-compat fix (SimpleImputer
`_fill_dtype` backfill) is applied in-process, mirroring recipe_opt_bridge.py.
"""
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")  # sklearn InconsistentVersionWarning etc. -> stderr noise

# ---------------------------------------------------------------------------
# Paths: derived from this script's location so the bridge keeps working no
# matter where the repo is checked out.
# ---------------------------------------------------------------------------
BRIDGE_DIR = Path(__file__).resolve().parent
RECIPE_OPT_REAL = (BRIDGE_DIR / "recipe_opt").resolve()
# real recipe-opt-model package dir sits under the shared _code tree:
#   <code_root>/recipe-opt-model/src/recipe_opt
CODE_ROOT = RECIPE_OPT_REAL.parent.parent.parent
OUTPUT_DIR = CODE_ROOT / "output"
MODEL_PATH = Path(
    __import__("os").environ.get("RECIPE_OPT_MODEL_PATH")
    or (OUTPUT_DIR / "predictor_model.pkl")
)
MAP_PATH = Path(
    __import__("os").environ.get("RECIPE_OPT_MAP_PATH")
    or (OUTPUT_DIR / "map_merged.json")
)
DATA_PATH = OUTPUT_DIR / "dataset_merged.npy"

_BRIDGE_DIR_STR = str(BRIDGE_DIR)
if _BRIDGE_DIR_STR not in sys.path:
    sys.path.insert(0, _BRIDGE_DIR_STR)

from recipe_opt.search_space import SearchSpace  # noqa: E402
from recipe_opt.models.predictor import RecipePredictor  # noqa: E402


def _log(msg):
    sys.stderr.write("[recipe_predict_bridge] %s\n" % msg)
    sys.stderr.flush()


def _py(value):
    if isinstance(value, float):
        return round(float(value), 4)
    return value


def _backfill_imputer_dtype(predictor):
    """sklearn >=1.8 SimpleImputer.transform needs `_fill_dtype`, which pickles
    created with sklearn <=1.7.2 lack. Backfill from the fitted `_fit_dtype`."""
    pipeline = getattr(predictor, "_pipeline", None) or {}
    for key in ("x_imputer", "y_imputer"):
        imp = pipeline.get(key)
        if imp is not None and not hasattr(imp, "_fill_dtype") and hasattr(imp, "_fit_dtype"):
            imp._fill_dtype = imp._fit_dtype
            _log("backfilled %s._fill_dtype for sklearn compat" % key)


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
def action_list_materials(_request):
    """Material space of the predictor: order + index from map_merged.json."""
    space = SearchSpace(str(MAP_PATH))
    materials = [
        {"name": name, "index": i} for i, name in enumerate(space.material_names)
    ]
    return {
        "ok": True,
        "source": "recipe_opt",
        "count": len(materials),
        "materials": materials,
    }


def _coerce_percent(raw):
    """Accept int/float or numeric string with optional % / ：/ : separators
    already stripped by the caller. Returns float > 0 or None."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
    else:
        text = str(raw).strip().strip("%％").strip()
        if not text:
            return None
        try:
            value = float(text)
        except ValueError:
            return None
    if value <= 0 or value > 1000:  # guard: nonsense values never reach model
        return None
    return value


def action_predict(request):
    """Predict the 19 properties for one composition over the 96-material
    space. Matches strictly by name; normalizes the used set to sum 100."""
    recipe_raw = request.get("recipe")
    if not isinstance(recipe_raw, dict) or not recipe_raw:
        raise ValueError("recipe 必须是非空对象 {<原料名>: <百分比>}")

    predictor = RecipePredictor(
        model_path=str(MODEL_PATH),
        map_path=str(MAP_PATH),
        data_path=str(DATA_PATH),
    )
    t0 = time.time()
    predictor.initialize()
    _backfill_imputer_dtype(predictor)
    _log("predictor ready in %.2fs (%d materials, %d properties)"
         % (time.time() - t0, len(predictor.material_names),
            len(predictor.property_names)))

    known = set(predictor.material_names)
    used_raw = {}
    unused = {}
    for name, raw in recipe_raw.items():
        key = str(name).strip()
        if key in known:
            percent = _coerce_percent(raw)
            if percent is not None:
                used_raw[key] = percent
                continue
        # unknown name OR unusable value -> surfaced as unused, never modelled
        unused[key] = _py(raw) if not isinstance(raw, str) else str(raw)

    if not used_raw:
        raise ValueError("配方中没有匹配到 96 原料空间内的原料: %s"
                         % ", ".join(unused.keys()) or "empty")

    raw_sum = float(sum(used_raw.values()))
    applied = abs(raw_sum - 100.0) > 1e-6
    scale = 100.0 / raw_sum if applied else 1.0
    used = {name: round(percent * scale, 4) for name, percent in used_raw.items()}
    if applied:
        _log("normalizing composition %.6f -> 100 (scale=%.6f)"
             % (raw_sum, scale))

    recipe_feed = dict(used)
    predicted = predictor.predict_from_recipe(recipe_feed)
    predicted = {name: _py(v) for name, v in predicted.items()}

    _log("predicted %d properties for %d materials in %.2fs"
         % (len(predicted), len(used), time.time() - t0))

    return {
        "ok": True,
        "source": "recipe_opt",
        "predicted": predicted,
        "used": used,
        "unused": unused,
        "normalization": {
            "applied": applied,
            "raw_sum": round(raw_sum, 4),
            "scale": round(scale, 6),
        },
        "property_names": list(predictor.property_names),
        "material_count": len(predictor.material_names),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("stdin 为空: 期望一个 JSON 请求对象")
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("stdin JSON 解析失败: %s" % exc)
    if not isinstance(request, dict):
        raise ValueError("请求必须是 JSON 对象")

    action = request.get("action")
    if action == "list_materials":
        data = action_list_materials(request)
    elif action == "predict":
        data = action_predict(request)
    else:
        raise ValueError("未知 action: %r (支持: list_materials | predict)" % action)

    sys.stdout.write(json.dumps(data, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — CLI boundary
        _log("ERROR: %s" % exc)
        try:
            sys.stdout.write(json.dumps(
                {"ok": False, "error": str(exc), "source": "recipe_opt"},
                ensure_ascii=False,
            ))
            sys.stdout.flush()
        except Exception:  # noqa: BLE001
            pass
        sys.exit(1)
