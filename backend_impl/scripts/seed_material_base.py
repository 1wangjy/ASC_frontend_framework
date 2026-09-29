#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed the material base registry from the handed-over dataset.

Source of truth: `_ref/handover/ML/datasetv2.npy` — its `X_comp` carries `material_id`
and `base` (human-readable material name). There are 89 distinct ids and each maps to
exactly one base name, so this file is the canonical seed.

Outputs:
  1) data/material_base_map.json                     — 注册表快照（base_name ↔ material_id）
  2) <model_predict>/FEATURE/outputs/material_map.json — 前端展示用 material_id → 名称映射（重建为 89 条）

Usage:
  python3 backend_impl/scripts/seed_material_base.py [dataset.npy] [--json PATH] [--map PATH]
"""
import argparse
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_NPY = REPO / "_ref/handover/ML/datasetv2.npy"
DEFAULT_JSON = REPO / "data/material_base_map.json"
DEFAULT_MAP = REPO / "backend_impl/python/model_predict/FEATURE/outputs/material_map.json"


def load_pairs(npy: Path):
    import numpy as np

    data = np.load(str(npy), allow_pickle=True).item()
    names = None
    for _, meta in (data.get("metadata") or {}).items():
        names = meta.get("X_comp_names")
        if names:
            break
    if not names:
        # 部分数据集把列名放在顶层 metadata 的其它键里
        for meta in (data.get("metadata") or {}).values():
            if isinstance(meta, dict) and "X_comp_names" in meta:
                names = meta["X_comp_names"]
                break
    if not names:
        raise SystemExit("dataset has no X_comp_names")
    idx_id, idx_base = names.index("material_id"), names.index("base")

    counts, labels = Counter(), {}
    for sample in data.get("samples", []):
        for row in sample.get("X_comp", []):
            raw_id, base = row[idx_id], row[idx_base]
            if raw_id is None:
                continue
            mid = str(int(raw_id)) if isinstance(raw_id, (int, float)) and float(raw_id).is_integer() else str(raw_id)
            counts[mid] += 1
            if base:
                label = str(base).strip()
                if mid in labels and labels[mid] != label:
                    raise SystemExit(f"material_id {mid} has multiple base names: {labels[mid]} / {label}")
                labels[mid] = label
    missing = [mid for mid in counts if mid not in labels]
    if missing:
        raise SystemExit(f"material_id without base name: {missing[:10]}")
    return counts, labels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("npy", nargs="?", default=str(DEFAULT_NPY))
    ap.add_argument("--json", default=str(DEFAULT_JSON))
    ap.add_argument("--map", default=str(DEFAULT_MAP))
    args = ap.parse_args()

    counts, labels = load_pairs(Path(args.npy))
    bases = []
    for i, (mid, base_name) in enumerate(sorted(labels.items(), key=lambda kv: int(kv[0])), start=1):
        bases.append({
            "base_id": f"BASE_{i:06d}",
            "base_name": base_name,
            "material_id": mid,
            "category": "",
            "aliases": [],
            "enabled": True,
            "source": "datasetv2",
            "samples": counts[mid],
        })

    # 1) 注册表快照（rules 留给人工/API 追加，这里保持为空数组）
    snapshot = {
        "version": 1,
        "updated_at": "seed",
        "note": "原料 base 名注册表：base_name ↔ 预测模型 material_id（one-hot 位 material_id__<id>_frac）",
        "source_dataset": str(args.npy),
        "bases": bases,
        "rules": [],
    }
    json_path = Path(args.json)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), "utf8")

    # 2) 前端展示映射（material_id → 名称），由 26 条重建为全量
    map_path = Path(args.map)
    map_path.parent.mkdir(parents=True, exist_ok=True)
    map_path.write_text(json.dumps({
        "materials": [
            {"material_id": b["material_id"], "name": b["base_name"], "samples": b["samples"]} for b in bases
        ]
    }, ensure_ascii=False, indent=2), "utf8")

    print(f"bases: {len(bases)}")
    print(f"registry json: {json_path}")
    print(f"material_map json: {map_path}")
    print("sample:", [(b["material_id"], b["base_name"]) for b in bases[:5]])


if __name__ == "__main__":
    main()
