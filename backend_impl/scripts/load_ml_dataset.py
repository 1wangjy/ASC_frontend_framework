#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Load ./private/*.npy (privacy, local-only) into the ASC sqlite database.

Schema (see backend_impl/src/config/init-sqlite.js):
  ml_formula           one row per (dataset_source, recipe_id)
  ml_formula_component one row per (dataset_source, recipe_id, comp_index)

Reads ONLY counts on stdout (no sample values) — dataset is privacy-sensitive.
Idempotent: upsert on UNIQUE(dataset_source, recipe_id[, comp_index]).
Usage:
  python3 backend_impl/scripts/load_ml_dataset.py \
      [path/to/dataset_clean_meanstd.npy] [path/to/sqlite/database.db]
Defaults resolve relative to this script's repo.
"""
import sys, os, json, sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent                       # ASC_frontend_framework
NPY_DEFAULT = REPO / "private" / "dataset_clean_meanstd.npy"
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS ml_formula (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_source TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  n_components INTEGER NOT NULL DEFAULT 0,
  x_global TEXT NOT NULL DEFAULT '[]',
  x_global_names TEXT NOT NULL DEFAULT '[]',
  y_labels TEXT NOT NULL DEFAULT '{}',
  remark TEXT DEFAULT '',
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_delete INTEGER DEFAULT 0,
  UNIQUE(dataset_source, recipe_id)
);
CREATE TABLE IF NOT EXISTS ml_formula_component (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_source TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  comp_index INTEGER NOT NULL,
  material_id TEXT,
  ratio_pct REAL,
  component_features TEXT NOT NULL DEFAULT '{}',
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dataset_source, recipe_id, comp_index)
);
CREATE INDEX IF NOT EXISTS idx_ml_formula_source ON ml_formula(dataset_source);
CREATE INDEX IF NOT EXISTS idx_ml_comp_source_recipe ON ml_formula_component(dataset_source, recipe_id);
"""

def py(v):
    """numpy scalar -> python native (privacy-safe: numbers/strings only)."""
    import numpy as np
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, (float, int)):
        return v
    if isinstance(v, str):
        return v
    try:
        return float(v)
    except Exception:
        try:
            return str(v)
        except Exception:
            return None

def main():
    npy_path = Path(sys.argv[1]) if len(sys.argv) > 1 else NPY_DEFAULT
    db_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DB_DEFAULT
    import numpy as np
    data = np.load(str(npy_path), allow_pickle=True).item()
    metadata = data.get("metadata", {})
    samples = data.get("samples", [])

    conn = sqlite3.connect(str(db_path))
    conn.executescript(CREATE_SQL)
    cur = conn.cursor()

    # cache comp/global names per source
    names_cache = {site: m for site, m in metadata.items()}

    up_f = up_c = 0
    for s in samples:
        src = s.get("dataset_source", "")
        recipe_id = s.get("recipe_id", "")
        Xc = s.get("X_comp")
        Xg = s.get("X_global")
        yl = s.get("y_labels")
        remark = s.get("remark", "")

        meta = names_cache.get(src, {})
        comp_names = meta.get("X_comp_names") or []
        gnames = meta.get("X_global_names") or []

        n = len(Xc) if Xc is not None else 0

        xg_list = [py(x) for x in (Xg if Xg is not None else [])]
        # y_labels may nest numpy arrays/scalars -> deep-convert
        yj = json.dumps(_deep(yl))

        cur.execute(
            """INSERT INTO ml_formula
                 (dataset_source, recipe_id, n_components, x_global, x_global_names,
                  y_labels, remark, update_time)
               VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
               ON CONFLICT(dataset_source, recipe_id) DO UPDATE SET
                 n_components=excluded.n_components, x_global=excluded.x_global,
                 x_global_names=excluded.x_global_names, y_labels=excluded.y_labels,
                 remark=excluded.remark, update_time=CURRENT_TIMESTAMP""",
            (src, recipe_id, n, json.dumps(xg_list), json.dumps(list(gnames)), yj, remark),
        )
        up_f += 1

        # replace components for this key
        cur.execute(
            "DELETE FROM ml_formula_component WHERE dataset_source=? AND recipe_id=?",
            (src, recipe_id),
        )
        for i, row in enumerate(Xc if Xc is not None else []):
            feats = {}
            material_id = ratio = None
            for j, val in enumerate(row):
                nm = comp_names[j] if j < len(comp_names) else f"f{j}"
                pv = py(val)
                feats[nm] = pv
                if nm == "material_id":
                    material_id = pv if isinstance(pv, str) else str(pv) if pv is not None else None
                elif nm == "ratio_pct" and isinstance(pv, (int, float)):
                    ratio = pv
            cur.execute(
                """INSERT INTO ml_formula_component
                     (dataset_source, recipe_id, comp_index, material_id, ratio_pct,
                      component_features)
                   VALUES (?,?,?,?,?,?)
                   ON CONFLICT(dataset_source, recipe_id, comp_index) DO UPDATE SET
                     material_id=excluded.material_id, ratio_pct=excluded.ratio_pct,
                     component_features=excluded.component_features""",
                (src, recipe_id, i, material_id, ratio, json.dumps(feats)),
            )
            up_c += 1

    conn.commit()

    # ---- report counts only (privacy-safe) ----
    for table in ("ml_formula", "ml_formula_component"):
        r = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table}: {r} rows")
    by_src = cur.execute(
        "SELECT dataset_source, COUNT(*) FROM ml_formula GROUP BY dataset_source"
    ).fetchall()
    print("ml_formula by source:", dict(by_src))
    print(f"loaded {up_f} formulas / {up_c} components into {db_path}")
    conn.close()

def _deep(o):
    import numpy as np
    if isinstance(o, np.ndarray):
        return [_deep(x) for x in o.tolist()]
    if isinstance(o, dict):
        return {k: _deep(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_deep(x) for x in o]
    return py(o)

if __name__ == "__main__":
    main()
