#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Materialize the unified ML dataset into the ASC data-management business tables.

Reads ONLY the read-only ML tables (ml_formula / ml_formula_component) from the ASC
sqlite database and INSERTs equivalent rows into the business tables that the
数据管理 (data management) module reads:

  ml_formula_component  ->  mc_material  (one canonical MC per distinct (dataset_source, material_id))
                         + mp_properties (one own MP per MC, wired via MC.component_list / MP.mc_ids)
  ml_formula            ->  mr_formula   (one MR per formula; MR.component_list references the MCs with ratio_pct)
  ml_formula.y_labels   ->  tp_test_properties (one TP per formula that has y; MR.tp_ids <-> TP.mr_ids)

Only inserts. Never updates/removes non-ML business rows. Idempotent: before inserting,
every row this script previously created is deleted (delete-then-insert), identified by
stable ML markers (see MARKERS below). Re-running therefore yields identical counts and
deterministic ids (id sequence resumes after the current DB max per table).

Id scheme: prefix + 6-digit zero-padded sequence continuing after the current DB max
numeric suffix per table (mirrors the sample seed rows MC_000001.., MR_000001.., TP_000001..),
so TEXT(9) ids never collide with existing rows.

Prints ONLY counts / ids / keys on stdout (no raw y or feature sample values) — the ML
dataset is privacy-sensitive.

Usage:
  python3 backend_impl/scripts/materialize_ml_dataset.py [database.db]
"""
import json
import math
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"

# --- ML marker conventions (used for idempotent delete-then-insert) -------------
MC_BATCH_PREFIX = "ML-"          # mc_material.batch_no starts with this for ML rows
MR_CREATOR_PREFIX = "ml-ingest:"  # mr_formula.creator starts with this for ML rows
MR_NAME_PREFIX = "[ML] "          # mr_formula.formula_name prefix (redundant marker)
MR_BATCH_PREFIX = "ML-"           # mr_formula.batch_no prefix (redundant marker)
TP_COND_PREFIX = "ML\u6570\u636e\u96c6: "  # tp_test_properties.test_condition prefix

MC_TYPE_FALLBACK = "\u5176\u4ed6"  # '其他' — ML data carries no refractory-role taxonomy
MR_TYPE_FALLBACK = "\u672a\u5206\u7c7b"  # '未分类'

# Stable physical/chemical subset of the 51 component features kept in MP.fixed_properties.
# Derived / per-component / post-firing / bookkeeping keys (PC1..PC20, fired_*, reserved_*,
# material_id, ratio_pct) are excluded from fixed but preserved verbatim in custom_properties.
FIXED_KEYS = sorted([
    "AL2O3", "CaO", "Fe2O3", "K2O", "MgO", "Na2O", "PH", "SiC", "SiO2", "TiO2",
    "base", "bulk_density", "d50", "loss_on_ignition", "moisture",
    "particle_size_mean", "particle_size_std", "ph", "porosity",
    "true_density", "water_absorption",
])
FULL_KEYS = sorted([
    "AL2O3", "CaO", "Fe2O3", "K2O", "MgO", "Na2O", "PC1", "PC10", "PC11", "PC12",
    "PC13", "PC14", "PC15", "PC16", "PC17", "PC18", "PC19", "PC2", "PC20", "PC3",
    "PC4", "PC5", "PC6", "PC7", "PC8", "PC9", "PH", "SiC", "SiO2", "TiO2", "base",
    "bulk_density", "d50", "fired_bulk_density", "fired_cold_modulus",
    "fired_crushing_strength", "fired_linear_change", "loss_on_ignition",
    "material_id", "moisture", "particle_size_mean", "particle_size_std", "ph",
    "porosity", "ratio_pct", "reserved_feature_1", "reserved_feature_2",
    "reserved_feature_3", "reserved_feature_4", "true_density", "water_absorption",
])

Y_KEYS = ["bulk_density", "cold_modulus", "crushing_strength", "linear_change"]


def _clean(o):
    """Convert non-finite floats to None so JSON stays strictly valid."""
    if isinstance(o, float):
        if math.isnan(o) or math.isinf(o):
            return None
        return o
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    return o


def _j(o):
    return json.dumps(o, ensure_ascii=False)


def _real(v):
    """True when v is a usable non-missing scalar (None/'None'/nan/'' are missing)."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() not in ("", "None", "nan")
    if isinstance(v, float):
        return not (math.isnan(v) or math.isinf(v))
    return True


class Minter:
    """Prefix + 6-digit zero-padded ids, continuing from the DB max numeric suffix."""

    def __init__(self, conn):
        self.conn = conn
        self.next_suffix = {}

    def _base(self, table, prefix):
        if prefix in self.next_suffix:
            return self.next_suffix[prefix]
        rows = self.conn.execute(
            "SELECT {col} FROM {tbl}".format(col=table.split(".")[1], tbl=table.split(".")[0])
        ).fetchall()
        numeric = []
        for (rid,) in rows:
            if rid.startswith(prefix + "_") and len(rid) == len(prefix) + 7:
                suffix = rid[len(prefix) + 1:]
                if suffix.isdigit():
                    numeric.append(int(suffix))
        self.next_suffix[prefix] = (max(numeric) if numeric else 0) + 1
        return self.next_suffix[prefix]

    def mint(self, table, prefix):
        """table like 'mc.mc_id'; returns a fresh unused '<prefix>_NNNNNN' id."""
        col = table.split(".")[1]
        nxt = self._base(table, prefix)
        while True:
            candidate = "{}_{:06d}".format(prefix, nxt)
            nxt += 1
            hit = self.conn.execute(
                "SELECT 1 FROM {tbl} WHERE {col} = ?".format(tbl=table.split(".")[0], col=col),
                (candidate,),
            ).fetchone()
            if hit is None:
                self.next_suffix[prefix] = nxt
                return candidate


def delete_previous_ml_rows(conn):
    """Delete rows this script created on earlier runs (idempotency), leaves others intact."""
    # 1) TPs: marked via test_condition
    cur = conn.execute("DELETE FROM tp_test_properties WHERE test_condition LIKE ?",
                       (TP_COND_PREFIX + "%",))
    deleted_tp = cur.rowcount
    # 2) MRs: marked via creator (name/batch prefixes are redundant markers)
    cur = conn.execute("DELETE FROM mr_formula WHERE creator LIKE ?", (MR_CREATOR_PREFIX + "%",))
    deleted_mr = cur.rowcount
    conn.execute("DELETE FROM mr_formula WHERE formula_name LIKE ?", (MR_NAME_PREFIX + "%",))
    conn.execute("DELETE FROM mr_formula WHERE batch_no LIKE ?", (MR_BATCH_PREFIX + "%",))
    # 3) MCs: no creator column -> batch_no marker
    deleted_mc = [r[0] for r in conn.execute(
        "SELECT mc_id FROM mc_material WHERE batch_no LIKE ?", (MC_BATCH_PREFIX + "%",)
    ).fetchall()]
    for mc_id in deleted_mc:
        conn.execute("DELETE FROM mc_material WHERE mc_id = ?", (mc_id,))
    # 4) MPs: no marker column -> owned MPs are exactly those whose mc_ids only reference
    #    the deleted ML MCs (every ML MP we create references exactly one ML MC)
    deleted_mp = 0
    if deleted_mc:
        deleted_set = set(deleted_mc)
        for (mp_id, mc_ids_json) in conn.execute(
            "SELECT mp_id, mc_ids FROM mp_properties"
        ).fetchall():
            try:
                refs = json.loads(mc_ids_json)
            except (TypeError, ValueError):
                refs = []
            if isinstance(refs, list) and refs and set(refs) <= deleted_set:
                conn.execute("DELETE FROM mp_properties WHERE mp_id = ?", (mp_id,))
                deleted_mp += 1
    return {"tp": deleted_tp, "mr": deleted_mr, "mc": len(deleted_mc), "mp": deleted_mp}


def main():
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DB_DEFAULT
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ------------------------------------------------------------------ read ML data
    formulas = conn.execute(
        "SELECT id, dataset_source, recipe_id, n_components, y_labels "
        "FROM ml_formula ORDER BY dataset_source, recipe_id"
    ).fetchall()
    components = conn.execute(
        "SELECT id, dataset_source, recipe_id, comp_index, material_id, ratio_pct, "
        "component_features FROM ml_formula_component "
        "ORDER BY dataset_source, recipe_id, comp_index"
    ).fetchall()

    try:
        conn.execute("BEGIN")

        # ------------------------------------------------------------- idempotent reset
        deleted_prev = delete_previous_ml_rows(conn)

        mc_minter = Minter(conn)
        mp_minter = Minter(conn)
        mr_minter = Minter(conn)
        tp_minter = Minter(conn)

        now_ts = (now, now)

        # -------------------------------------------------------- materials (MC + MP)
        # One canonical MC per distinct (dataset_source, material_id); identity = the
        # original material_id text. Deterministic order: first appearance (min ml row id).
        by_key = {}
        for comp in components:
            key = (comp["dataset_source"], comp["material_id"])
            if key not in by_key or comp["id"] < by_key[key]["first_id"]:
                by_key[key] = {
                    "first_id": comp["id"],
                    "source": comp["dataset_source"],
                    "material_id": comp["material_id"],
                    "features": json.loads(comp["component_features"]),
                }
        ordered_keys = sorted(by_key, key=lambda k: by_key[k]["first_id"])
        material_mc = {}   # key -> mc_id
        material_label = {}  # key -> display label
        n_mc = 0
        n_mp = 0
        for key in ordered_keys:
            info = by_key[key]
            src, mid = info["source"], info["material_id"]
            feats = _clean(info["features"])
            mc_id = mc_minter.mint("mc_material.mc_id", "MC")
            mp_id = mp_minter.mint("mp_properties.mp_id", "MP")
            base = feats.get("base")
            label = "{}({}-{})".format(base, src, mid) if _real(base) else "{}-{}".format(src, mid)
            material_mc[key] = mc_id
            material_label[key] = label

            fixed = {k: feats.get(k) for k in FIXED_KEYS}
            custom = {k: feats.get(k) for k in FULL_KEYS}
            conn.execute(
                "INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, "
                "mc_ids, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,0)",
                (mp_id, _j(fixed), _j(custom), _j([mc_id]), *now_ts),
            )
            conn.execute(
                "INSERT INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, "
                "create_time, update_time, is_delete) VALUES (?,?,?,?,0,?,?,0)",
                (mc_id, "{}{}-{}".format(MC_BATCH_PREFIX, src, mid), MC_TYPE_FALLBACK,
                 _j([[label, mp_id, "{}", 100]]), *now_ts),
            )
            n_mc += 1
            n_mp += 1

        # ------------------------------------------------------------- formulas (MR + TP)
        comps_by_recipe = {}
        for comp in components:
            comps_by_recipe.setdefault((comp["dataset_source"], comp["recipe_id"]), []).append(comp)

        n_mr = 0
        n_tp = 0
        skipped = []  # (source, recipe_id, reason) formulas materialized as nothing
        sample_mr = None  # first materialized mr sample info
        for f in formulas:
            src, rid = f["dataset_source"], f["recipe_id"]
            comps = comps_by_recipe.get((src, rid), [])
            if not comps:
                skipped.append((src, rid, "zero-components"))
                continue
            mr_id = mr_minter.mint("mr_formula.mr_id", "MR")

            # materialize lazily if a comp ever referenced an unknown material (safety)
            component_list = []
            for comp in comps:
                key = (comp["dataset_source"], comp["material_id"])
                if key not in material_mc:
                    # Reuse the same construction as the material loop above.
                    feats = _clean(json.loads(comp["component_features"]))
                    mc_id = mc_minter.mint("mc_material.mc_id", "MC")
                    mp_id = mp_minter.mint("mp_properties.mp_id", "MP")
                    base = feats.get("base")
                    label = "{}({}-{})".format(base, src, comp["material_id"]) if _real(base) else "{}-{}".format(src, comp["material_id"])
                    material_mc[key] = mc_id
                    material_label[key] = label
                    conn.execute(
                        "INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, "
                        "mc_ids, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,0)",
                        (mp_id, _j({k: feats.get(k) for k in FIXED_KEYS}),
                         _j({k: feats.get(k) for k in FULL_KEYS}), _j([mc_id]), *now_ts),
                    )
                    conn.execute(
                        "INSERT INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, "
                        "create_time, update_time, is_delete) VALUES (?,?,?,?,0,?,?,0)",
                        (mc_id, "{}{}-{}".format(MC_BATCH_PREFIX, src, comp["material_id"]),
                         MC_TYPE_FALLBACK, _j([[label, mp_id, "{}", 100]]), *now_ts),
                    )
                    n_mc += 1
                    n_mp += 1
                ratio = comp["ratio_pct"] if comp["ratio_pct"] is not None else None
                component_list.append([material_label[key], material_mc[key], "{}", ratio])

            # optional measured-properties TP (one per formula with y)
            y = {}
            if f["y_labels"]:
                try:
                    y = json.loads(f["y_labels"])
                except ValueError:
                    y = {}
                if not isinstance(y, dict) or not y:
                    y = {}
            tp_id = None
            if y:
                present = [k for k in Y_KEYS if isinstance(y.get(k), dict) and y[k]]
                temp_conds = {k: sorted(str(t) for t in y[k].keys()) for k in present}
                tp_id = tp_minter.mint("tp_test_properties.tp_id", "TP")
                test_params = {
                    "property_keys": present,
                    "temperature_conditions": temp_conds,
                    "value_shape": "per-property dict of temperature-condition -> value string "
                                   "(some cells 'a / b' = paired samples)",
                }
                conn.execute(
                    "INSERT INTO tp_test_properties (tp_id, mp_id, test_params, test_results, "
                    "mr_ids, test_condition, create_time, update_time, is_delete) "
                    "VALUES (?,NULL,?,?,?,?,?,?,0)",
                    (tp_id, _j(test_params), _j(y), _j([mr_id]),
                     "{}: {}".format(TP_COND_PREFIX, src), *now_ts),
                )
                n_tp += 1

            conn.execute(
                "INSERT INTO mr_formula (mr_id, formula_name, formula_type, batch_no, "
                "component_list, tp_ids, fe_ids, ru_ids, creator, create_time, update_time, "
                "is_delete) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)",
                (mr_id, "{}{}-{}".format(MR_NAME_PREFIX, src, rid), MR_TYPE_FALLBACK,
                 "{}{}".format(MR_BATCH_PREFIX, src), _j(component_list),
                 _j([tp_id] if tp_id else []), "[]", "[]",
                 "{}{}".format(MR_CREATOR_PREFIX, src), *now_ts),
            )
            n_mr += 1
            if sample_mr is None:
                sample_mr = {
                    "source": src, "recipe_id": rid, "mr_id": mr_id, "tp_id": tp_id,
                    "components": [(mc_id, ratio) for (_l, mc_id, _p, ratio) in component_list[:3]],
                }

        conn.execute("COMMIT")
    except Exception:
        conn.rollback()
        raise

    # ------------------------------------------------------------------- verification
    def count(tbl):
        return conn.execute("SELECT COUNT(*) FROM {}".format(tbl)).fetchone()[0]

    def counts_after():
        return {
            "mc_material": count("mc_material"),
            "mp_properties": count("mp_properties"),
            "mr_formula": count("mr_formula"),
            "tp_test_properties": count("tp_test_properties"),
            "ml_formula": count("ml_formula"),
            "ml_formula_component": count("ml_formula_component"),
        }

    counts = counts_after()
    ml_mc = conn.execute(
        "SELECT mc_id, batch_no FROM mc_material WHERE batch_no LIKE ? ORDER BY mc_id",
        (MC_BATCH_PREFIX + "%",),
    ).fetchall()
    ml_mr = conn.execute(
        "SELECT mr_id, creator FROM mr_formula WHERE creator LIKE ? ORDER BY mr_id",
        (MR_CREATOR_PREFIX + "%",),
    ).fetchall()

    # sample associations: first ML MC (and its MP), first ML MR (and its TP)
    mc_sample = ml_mc[0] if ml_mc else None
    mp_sample = None
    if mc_sample:
        row = conn.execute(
            "SELECT mc_id, component_list FROM mc_material WHERE mc_id = ?", (mc_sample["mc_id"],)
        ).fetchone()
        comp_entry = json.loads(row["component_list"])[0]
        mp_row = conn.execute(
            "SELECT mp_id, mc_ids FROM mp_properties WHERE mp_id = ?", (comp_entry[1],)
        ).fetchone()
        mp_sample = {"mp_id": mp_row["mp_id"], "mc_ids": json.loads(mp_row["mc_ids"])}
    mr_sample = None
    if sample_mr:
        mr_row = conn.execute(
            "SELECT mr_id, component_list, tp_ids FROM mr_formula WHERE mr_id = ?",
            (sample_mr["mr_id"],),
        ).fetchone()
        mr_sample = {
            "source": sample_mr["source"],
            "recipe_id": sample_mr["recipe_id"],
            "mr_id": mr_row["mr_id"],
            "component_list": json.loads(mr_row["component_list"]),
            "tp_ids": json.loads(mr_row["tp_ids"]),
        }
    tp_sample = None
    if sample_mr and sample_mr["tp_id"]:
        tp_row = conn.execute(
            "SELECT tp_id, mr_ids, test_condition FROM tp_test_properties WHERE tp_id = ?",
            (sample_mr["tp_id"],),
        ).fetchone()
        tp_params = conn.execute(
            "SELECT test_params FROM tp_test_properties WHERE tp_id = ?", (sample_mr["tp_id"],)
        ).fetchone()
        tp_sample = {
            "tp_id": tp_row["tp_id"],
            "mr_ids": json.loads(tp_row["mr_ids"]),
            "test_condition": tp_row["test_condition"],
            "test_params_property_keys": json.loads(tp_params["test_params"])["property_keys"],
        }

    print("=== materialize_ml_dataset summary ===")
    print("deleted previous ML rows:", deleted_prev)
    print("inserted MC (materials):", n_mc, "| MP:", n_mp, "| MR:", n_mr, "| TP:", n_tp)
    print("distinct (dataset_source, material_id):", len(ordered_keys))
    print("formulas skipped (zero components):", len(skipped), skipped[:5])
    print("table counts after materialize:", counts)
    if mc_sample:
        print("sample MC:", mc_sample["mc_id"], "batch_no:", mc_sample["batch_no"])
        print("  -> its MP:", mp_sample)
    if mr_sample:
        print("sample MR:", mr_sample["mr_id"], "({} - {})".format(mr_sample["source"], mr_sample["recipe_id"]))
        print("  component_list[0:3]:", mr_sample["component_list"][:3])
        print("  tp_ids:", mr_sample["tp_ids"])
    if tp_sample:
        print("sample TP:", tp_sample["tp_id"], "mr_ids:", tp_sample["mr_ids"],
              "property_keys:", tp_sample["test_params_property_keys"])
    conn.close()


if __name__ == "__main__":
    main()
