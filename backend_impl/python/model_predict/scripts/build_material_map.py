#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build material_id -> display name (base) map from a yangquan.npy-style dataset.

The dataset's component_feature_names include 'material_id' and 'base'; `base` is
the human-readable material name (e.g. 61 -> 棕刚玉). This map lets the frontend
show names instead of raw ids.

Usage:
  python3 backend_impl/python/model_predict/scripts/build_material_map.py \
      /mnt/c/Users/admin/Downloads/example/yangquan.npy \
      backend_impl/python/model_predict/FEATURE/outputs/material_map.json
Defaults: npy = <model_predict>/../../../../yangquan.npy is NOT assumed; pass arg.
"""
import sys, json
from pathlib import Path


def main():
    here = Path(__file__).resolve()
    model_predict = here.parent.parent                     # .../model_predict
    default_out = model_predict / "FEATURE" / "outputs" / "material_map.json"
    npy = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else default_out
    if npy is None or not npy.exists():
        print("usage: build_material_map.py <yangquan.npy> [out.json]")
        sys.exit(2)

    import numpy as np
    d = np.load(str(npy), allow_pickle=True).item()
    meta = d.get("metadata", {})
    names = None
    for _, m in meta.items():
        names = m.get("X_comp_names")
        if names:
            break
    if not names:
        print("no X_comp_names in dataset metadata")
        sys.exit(3)
    idx_id = names.index("material_id")
    idx_base = names.index("base")

    counts = {}
    labels = {}
    for smp in d.get("samples", []):
        for row in smp.get("X_comp", []):
            try:
                mid = row[idx_id]
                base = row[idx_base]
            except Exception:
                continue
            if mid is None:
                continue
            key = str(int(mid)) if isinstance(mid, (int, float)) and float(mid).is_integer() else str(mid)
            counts[key] = counts.get(key, 0) + 1
            if base:
                labels.setdefault(key, str(base))

    materials = [
        {"material_id": k, "name": labels.get(k, ""), "samples": counts[k]}
        for k in sorted(counts, key=lambda x: (len(x), x))
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"materials": materials}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(out), "count": len(materials)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
