#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Load ./private/*.npy (privacy, local-only) into the ASC sqlite database.

Schema (see backend_impl/src/config/init-sqlite.js):
  ml_formula            one row per (dataset_source, recipe_id)
  ml_formula_component  one row per (dataset_source, recipe_id, comp_index)
  ml_dataset_meta       per-source feature/schema metadata
  ml_feature_stats      per-source numeric feature normalize stats (mean/std/min/max)

Reads ONLY counts on stdout (no sample values) — dataset is privacy-sensitive.
Idempotent: upsert on UNIQUE keys; stats/meta recomputed each run.
Usage:
  python3 backend_impl/scripts/load_ml_dataset.py [npy] [database.db]
"""
import sys, os, json, sqlite3
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
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
CREATE TABLE IF NOT EXISTS ml_dataset_meta (
  dataset_source TEXT PRIMARY KEY,
  sample_count INTEGER NOT NULL DEFAULT 0,
  total_component_count INTEGER NOT NULL DEFAULT 0,
  comp_feature_names TEXT NOT NULL DEFAULT '[]',
  global_feature_names TEXT NOT NULL DEFAULT '[]',
  y_feature_keys TEXT NOT NULL DEFAULT '[]',
  dataset_version TEXT DEFAULT '1',
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  remark TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ml_feature_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_source TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  feature_kind TEXT NOT NULL CHECK(feature_kind IN ('comp','global')),
  count INTEGER NOT NULL DEFAULT 0,
  mean REAL,
  std REAL,
  min REAL,
  max REAL,
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dataset_source, feature_name, feature_kind)
);
"""

def py(v):
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, (float, int)):
        return float(v)
    if isinstance(v, str):
        return v
    try:
        return float(v)
    except Exception:
        try:
            return str(v)
        except Exception:
            return None

def _deep(o):
    if isinstance(o, np.ndarray):
        return [_deep(x) for x in o.tolist()]
    if isinstance(o, dict):
        return {k: _deep(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_deep(x) for x in o]
    return py(o)

def _is_num(v):
    return isinstance(v, (float, int)) and not isinstance(v, bool)

def main():
    npy_path = Path(sys.argv[1]) if len(sys.argv) > 1 else NPY_DEFAULT
    db_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DB_DEFAULT
    data = np.load(str(npy_path), allow_pickle=True).item()
    metadata = data.get("metadata", {})
    samples = data.get("samples", [])
    version = str(data.get("dataset_version") or "1")

    conn = sqlite3.connect(str(db_path))
    conn.executescript(CREATE_SQL)
    cur = conn.cursor()

    # stats accumulators per source: {name: [count, sum, sumsq, min, max]}
    comp_stats = {}  # source -> dict
    glob_stats = {}
    comp_counts = {}  # source -> total components
    # y top-level keys per source
    y_keys = {}

    up_f = up_c = 0
    for s in samples:
        src = s.get("dataset_source", "")
        recipe_id = s.get("recipe_id", "")
        Xc = s.get("X_comp")
        Xg = s.get("X_global")
        yl = s.get("y_labels")
        remark = s.get("remark", "")

        meta = metadata.get(src, {})
        comp_names = meta.get("X_comp_names") or []
        gnames = meta.get("X_global_names") or []
        n = len(Xc) if Xc is not None else 0

        xg_list = [py(x) for x in (Xg if Xg is not None else [])]
        cur.execute(
            """INSERT INTO ml_formula
                 (dataset_source, recipe_id, n_components, x_global, x_global_names,
                  y_labels, remark, update_time)
               VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
               ON CONFLICT(dataset_source, recipe_id) DO UPDATE SET
                 n_components=excluded.n_components, x_global=excluded.x_global,
                 x_global_names=excluded.x_global_names, y_labels=excluded.y_labels,
                 remark=excluded.remark, update_time=CURRENT_TIMESTAMP""",
            (src, recipe_id, n, json.dumps(xg_list), json.dumps(list(gnames)),
             json.dumps(_deep(yl)), remark),
        )
        up_f += 1

        cur.execute(
            "DELETE FROM ml_formula_component WHERE dataset_source=? AND recipe_id=?",
            (src, recipe_id),
        )
        cs = comp_stats.setdefault(src, {})
        gs = glob_stats.setdefault(src, {})
        comp_counts[src] = comp_counts.get(src, 0) + n
        y_keys.setdefault(src, [])[:] = list(_deep(yl).keys()) if isinstance(yl, dict) else []

        for i, row in enumerate(Xc if Xc is not None else []):
            feats = {}
            material_id = ratio = None
            for j, val in enumerate(row):
                nm = comp_names[j] if j < len(comp_names) else "f%d" % j
                pv = py(val)
                feats[nm] = pv
                if _is_num(pv):
                    a = cs.setdefault(nm, [0, 0.0, 0.0, float("inf"), float("-inf")])
                    a[0] += 1; a[1] += pv; a[2] += pv * pv
                    a[3] = min(a[3], pv); a[4] = max(a[4], pv)
                if nm == "material_id":
                    material_id = str(pv) if pv is not None else None
                elif nm == "ratio_pct" and _is_num(pv):
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

        # global stats
        for nm, pv in zip(gnames, xg_list):
            if _is_num(pv):
                a = gs.setdefault(nm, [0, 0.0, 0.0, float("inf"), float("-inf")])
                a[0] += 1; a[1] += pv; a[2] += pv * pv
                a[3] = min(a[3], pv); a[4] = max(a[4], pv)

    conn.commit()

    # ---- write per-source meta + stats ----
    for src, m in metadata.items():
        comp_names = m.get("X_comp_names") or []
        gnames = m.get("X_global_names") or []
        n_samp = cur.execute(
            "SELECT COUNT(*) FROM ml_formula WHERE dataset_source=?", (src,)
        ).fetchone()[0]
        cur.execute(
            """INSERT INTO ml_dataset_meta
                 (dataset_source, sample_count, total_component_count, comp_feature_names,
                  global_feature_names, y_feature_keys, dataset_version, ingested_at, remark)
               VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP, 'ingested from private/*.npy')
               ON CONFLICT(dataset_source) DO UPDATE SET
                 sample_count=excluded.sample_count,
                 total_component_count=excluded.total_component_count,
                 comp_feature_names=excluded.comp_feature_names,
                 global_feature_names=excluded.global_feature_names,
                 y_feature_keys=excluded.y_feature_keys,
                 dataset_version=excluded.dataset_version,
                 ingested_at=CURRENT_TIMESTAMP""",
            (src, n_samp, comp_counts.get(src, 0), json.dumps(list(comp_names)),
             json.dumps(list(gnames)), json.dumps(list(y_keys.get(src, []))), version),
        )
        # stats: drop old, insert fresh
        cur.execute("DELETE FROM ml_feature_stats WHERE dataset_source=?", (src,))
        for fk, acc in (("comp", comp_stats.get(src, {})), ("global", glob_stats.get(src, {}))):
            for name, (cnt, sm, ssq, mn, mx) in acc.items():
                if cnt <= 0:
                    continue
                mean = sm / cnt
                var = max(0.0, ssq / cnt - mean * mean)
                cur.execute(
                    """INSERT INTO ml_feature_stats
                         (dataset_source, feature_name, feature_kind, count, mean, std, min, max)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (src, name, fk, cnt, mean, float(var ** 0.5), mn, mx),
                )

    conn.commit()

    # ---- report counts only (privacy-safe) ----
    for table in ("ml_formula", "ml_formula_component", "ml_dataset_meta", "ml_feature_stats"):
        r = cur.execute("SELECT COUNT(*) FROM %s" % table).fetchone()[0]
        print("%s: %d rows" % (table, r))
    by_src = cur.execute(
        "SELECT dataset_source, COUNT(*) FROM ml_formula GROUP BY dataset_source"
    ).fetchall()
    print("ml_formula by source:", dict(by_src))
    print("loaded %d formulas / %d components into %s" % (up_f, up_c, db_path))
    conn.close()

if __name__ == "__main__":
    main()
