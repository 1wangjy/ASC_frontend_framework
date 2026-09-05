#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
recipe_opt_bridge.py — Model2 配方优化 (POST /api/model2/optimize) standalone backend.

Reads ONE JSON object from stdin:
{
  "targets":   [ {"name": str, "direction": "max"|"min"|"constrain"|..., "lower": float|null, "upper": float|null}, ...],
               # optional — omitted/empty => recipe_opt.config.TARGET_THRESHOLDS defaults
  "algorithm": "nsga2" | "evolutionary" | "bayesian" | "hybrid" | "random",
  "budget":    int   # number of iterations (default 60)
}

By default the bridge runs the optimization through the real `recipe_opt`
package (symlinked at backend_impl/python/recipe_opt ->
_code/recipe-opt-model/src/recipe_opt), then writes ONE JSON object to stdout —
the /api/model2/optimize `data` contract:

{
  "ok": true,
  "algorithm": "...",
  "iterations": int,
  "best_recipe":     {"materials": [name, ...], "proportions": [% , ...]},   // % values, sum ~= 100
  "best_objective":  float,   // penalty-inclusive scalar cost, smaller is better
  "best_predicted":  {"<internal property name>": float, ...},
  "trace":           [{"iteration": int, "best_objective": float}, ...],     // best-so-far
  "pareto_front":    [{"materials": [...], "proportions": [...], "objectives": {<prop>: float}}],
  "hypervolume":     float | null,
  "target_met":      {"<internal property name>": bool}
}

With "stream": true the SAME search runs, but stdout becomes NDJSON: one
{"type":"progress","iteration":<int 1-based>,"best_objective":<running
best-so-far>,"algorithm":"<id>"} line is flushed immediately after EVERY
evaluated candidate (real time, as evaluations happen), and after the run one
final line {"type":"result","data":{<the payload above>}} is flushed.

Nothing but those JSON lines is written to stdout (logs go to stderr).
Exit code 0 on success; non-zero on failure.

Notes
-----
* Property names are kept aligned with recipe_opt's internal property_names
  (friendly Chinese labels from the model mapping, e.g. "耐压强度[1450℃]").
  Friendly request names (English aliases like "compressive_strength" or bare
  Chinese concepts like "耐压强度") are resolved onto those internal names via
  the alias tables below; the resolution is logged to stderr.
* recipe_opt's sklearn pipeline was pickled with sklearn 1.7.2; when running
  under a newer sklearn (>= 1.8) SimpleImputer.transform requires a
  `_fill_dtype` attribute that old pickles lack — it is backfilled from the
  fitted `_fit_dtype` after load (no-op on a matching sklearn).
* recipe_opt's RandomSearchOptimizer/BayesianOptimizer and
  EvolutionaryOptimizer contain a vector-shape bug (`p.reshape(M, 3)` on an
  (M,) proportions vector). The package files are NOT modified: the bridge
  installs in-process, structure-faithful replacements of those two
  `optimize()` methods that build the (M, 3) model input the same way the
  (working) NSGA2 optimizer does.
"""
import json
import re
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

import numpy as np  # noqa: E402

from recipe_opt.config import OptimizationConfig, TARGET_THRESHOLDS  # noqa: E402
from recipe_opt.models.predictor import RecipePredictor  # noqa: E402
from recipe_opt.models.objective import (  # noqa: E402
    ObjectiveFunction,
    MultiObjectiveFunction,
)
from recipe_opt.optimizers.bayesian import RandomSearchOptimizer  # noqa: E402
from recipe_opt.optimizers.evolutionary import EvolutionaryOptimizer  # noqa: E402
from recipe_opt.optimizers.hybrid import HybridOptimizer  # noqa: E402
from recipe_opt.optimizers.nsga2 import NSGA2Optimizer  # noqa: E402
from recipe_opt.constraints import RecipeConstraint  # noqa: E402
from recipe_opt.search_space import SearchSpace  # noqa: E402
from recipe_opt.pareto import ParetoFront  # noqa: E402

DEFAULT_BUDGET = 60
MAX_BUDGET = 1000

ALGORITHMS = {"nsga2", "evolutionary", "bayesian", "hybrid", "random"}

# ---------------------------------------------------------------------------
# Property-name resolution (friendly request name -> recipe_opt internal name)
# ---------------------------------------------------------------------------
# canonical Chinese base  ->  internal property names start with it
CONCEPT_BASES = [
    "高温抗折",
    "抗折强度",
    "线变化率",
    "耐压强度",
    "体密",
    "吸水率",
    "气孔率",
]
# request tokens / aliases -> canonical Chinese base
CONCEPT_SYNONYMS = {
    "体密": "体密",
    "体积密度": "体密",
    "bulk_density": "体密",
    "bulk density": "体密",
    "bd": "体密",
    "吸水率": "吸水率",
    "water_absorption": "吸水率",
    "water absorption": "吸水率",
    "抗折强度": "抗折强度",
    "flexural_strength": "抗折强度",
    "flexural strength": "抗折强度",
    "modulus_of_rupture": "抗折强度",
    "常温抗折": "抗折强度",
    "耐压强度": "耐压强度",
    "compressive_strength": "耐压强度",
    "compressive strength": "耐压强度",
    "ccs": "耐压强度",
    "高温抗折": "高温抗折",
    "hot_modulus_of_rupture": "高温抗折",
    "hot modulus of rupture": "高温抗折",
    "hmor": "高温抗折",
    "线变化率": "线变化率",
    "linear_change": "线变化率",
    "linear_change_rate": "线变化率",
    "permanent_linear_change": "线变化率",
    "气孔率": "气孔率",
    "显气孔率": "气孔率",
    "apparent_porosity": "气孔率",
    "apparent porosity": "气孔率",
    "porosity": "气孔率",
}

_DIRECTION_SYNONYMS = {
    "max": "maximize",
    "maximize": "maximize",
    "maximum": "maximize",
    "maximise": "maximize",
    "high": "maximize",
    "越大越好": "maximize",
    "最大": "maximize",
    "min": "minimize",
    "minimize": "minimize",
    "minimise": "minimize",
    "minimum": "minimize",
    "low": "minimize",
    "越小越好": "minimize",
    "最小": "minimize",
    "constrain": "constrain",
    "range": "constrain",
    "target": "constrain",
    "区间": "constrain",
    "约束": "constrain",
}

_TEMP_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:℃|°C)", re.IGNORECASE)
_TOKEN_RE = re.compile(r"[^A-Za-z0-9\u4e00-\u9fff]+")


def _log(msg):
    sys.stderr.write("[recipe_opt_bridge] " + msg + "\n")
    sys.stderr.flush()


def _normalize_direction(raw):
    key = str(raw or "").strip().lower().replace(" ", "_")
    d = _DIRECTION_SYNONYMS.get(key) or _DIRECTION_SYNONYMS.get(str(raw or "").strip().lower())
    return d or "maximize"


def _resolve_property_name(name, property_names):
    """Map a friendly request name onto an internal property name (or None)."""
    n = (str(name or "").strip())
    if not n:
        return None
    if n in property_names:
        return n

    temp = None
    m = _TEMP_RE.search(n)
    if m:
        temp = float(m.group(1))
    tokens = [t for t in _TOKEN_RE.split(n.lower()) if t]
    if temp is None:
        # a bare 3-4 digit token (110 / 1100 / 1450 / 1500) is a temperature
        digit_tokens = sorted((t for t in tokens if t.isdigit() and 2 <= len(t) <= 4),
                              key=len, reverse=True)
        if digit_tokens:
            temp = float(digit_tokens[0])

    # Chinese token -> base (longest match first), then English multi-word alias
    base = None
    for tok in tokens:
        if tok in CONCEPT_SYNONYMS and not base:
            base = CONCEPT_SYNONYMS[tok]
    if base is None:
        for alias, canonical in CONCEPT_SYNONYMS.items():
            words = set(alias.split(" "))
            if words and words.issubset(set(tokens)):
                base = canonical
                break
    if base is None:
        return None

    candidates = [p for p in property_names if p.startswith(base)]
    if not candidates:
        return None

    if temp is not None:
        label = "%s[%g℃]" % (base, temp)
        if label in property_names:
            return label
        for p in candidates:
            m2 = re.match(r"^%s\[(\d+(?:\.\d+)?)℃\]$" % re.escape(base), p)
            if m2 and abs(float(m2.group(1)) - temp) < 1e-9:
                return p
        return None
    # no temperature given: prefer the canonical default-set property, else the
    # highest-temperature candidate (deterministic)
    for p in candidates:
        if p in TARGET_THRESHOLDS:
            return p
    if candidates:
        return sorted(
            candidates,
            key=lambda p: float(re.match(r"^%s\[(\d+)℃\]$" % re.escape(base), p).group(1))
            if re.match(r"^%s\[(\d+)℃\]$" % re.escape(base), p) else -1,
            reverse=True,
        )[0]
    return None


def _effective_targets(targets):
    """Guarantee strictly-positive steering thresholds.

    recipe_opt's ObjectiveFunction scores by dividing by the target threshold
    (config['min'] for maximize, config['max'] for minimize), so a missing or
    zero bound raises ZeroDivisionError. For properties the user left unbounded
    we inject the canonical TARGET_THRESHOLDS bound when defined, otherwise a
    safe floor of 1.0 (or ~0 for an explicit non-positive bound). The same
    effective config drives steering, reported per-target costs, the scalar
    objective, and target_met, so every number is internally consistent.
    """
    effective = {}
    for prop, cfg in targets.items():
        direction = cfg.get("direction", "maximize")
        c = dict(cfg)
        if direction == "maximize":
            lo = c.get("min")
            if lo is None:
                canon = TARGET_THRESHOLDS.get(prop, {}).get("min")
                c["min"] = canon if canon is not None else 1.0
            elif float(lo) <= 0:
                c["min"] = 1e-6
        elif direction == "minimize":
            hi = c.get("max")
            if hi is None:
                canon = TARGET_THRESHOLDS.get(prop, {}).get("max")
                c["max"] = canon if canon is not None else 1.0
            elif float(hi) <= 0:
                c["max"] = 1e-6
        effective[prop] = c
    return effective


def _build_target_config(req_target, property_names):
    """One request target -> {internal name: {"direction", "min"?, "max"?}}."""
    internal = _resolve_property_name(req_target.get("name"), property_names)
    if internal is None:
        raise ValueError(
            "未知目标属性: %r —— 可用属性: %s" % (req_target.get("name"), ", ".join(property_names))
        )
    cfg = {"direction": _normalize_direction(req_target.get("direction"))}
    lower = req_target.get("lower")
    upper = req_target.get("upper")
    if lower is not None:
        cfg["min"] = float(lower)
    if upper is not None:
        cfg["max"] = float(upper)
    _log("target %r -> internal %r config=%s" % (req_target.get("name"), internal, cfg))
    return internal, cfg


# ---------------------------------------------------------------------------
# recipe_opt compatibility & bug-fix shims (in-process only)
# ---------------------------------------------------------------------------
def _backfill_imputer_dtype(predictor):
    """sklearn >=1.8 SimpleImputer.transform needs `_fill_dtype`, which pickles
    created with sklearn <=1.7.2 lack. Backfill from the fitted `_fit_dtype`."""
    pipeline = getattr(predictor, "_pipeline", None) or {}
    for key in ("x_imputer", "y_imputer"):
        imp = pipeline.get(key)
        if imp is not None and not hasattr(imp, "_fill_dtype") and hasattr(imp, "_fit_dtype"):
            imp._fill_dtype = imp._fit_dtype
            _log("backfilled %s._fill_dtype for sklearn compat" % key)


def _build_X_from_p(p, M):
    """(M,) proportion vector -> (M, 3) model input (same as NSGA2 encodes)."""
    X = np.zeros((M, 3), dtype=np.float64)
    X[:, 0] = (p > 0.001).astype(np.float64)
    X[:, 2] = p
    return X


def _patched_random_optimize(self, n_iterations=None):
    """Structure-faithful fix of recipe_opt RandomSearchOptimizer.optimize
    (original crashes: p.reshape(M, 3) on an (M,) vector)."""
    start_time = time.time()
    n_iter = int(n_iterations or self.config.max_iterations)
    M = self.search_space.n_materials
    best_score = -1e6
    best_p = None
    for _ in range(n_iter):
        p = self.random_recipe()
        mask = p > 0.001
        X = _build_X_from_p(p, M)
        score = self._evaluate_recipe(X.reshape(1, M, 3), mask.reshape(1, -1))
        if score > best_score:
            best_score = float(score)
            best_p = p
    if best_p is None:
        best_p = self.random_recipe()
    best_X = _build_X_from_p(best_p, M)
    best_mask = best_p > 0.001
    return self._build_result(best_X, best_mask, best_score, n_iter, start_time)


def _patched_evolutionary_optimize(self, n_iterations=None):
    """Structure-faithful fix of recipe_opt EvolutionaryOptimizer.optimize
    (original crashes on the same (M,) -> (M, 3) reshape)."""
    start_time = time.time()
    n_iter = int(n_iterations or self.config.max_iterations)
    n_gen = max(1, n_iter // self.config.population_size)
    pop_size = self.config.population_size
    M = self.search_space.n_materials

    population = [self.random_recipe() for _ in range(pop_size)]
    fitness = []
    for p in population:
        mask = p > 0.001
        X = _build_X_from_p(p, M)
        fitness.append(self._evaluate_recipe(X.reshape(1, M, 3), mask.reshape(1, -1)))

    best_idx = int(np.argmax(fitness))
    best_p = population[best_idx]
    best_score = fitness[best_idx]

    for _gen in range(n_gen):
        new_population = []
        for _i in range(pop_size):
            parent1, parent2 = self._tournament_select(population, fitness, k=3)
            child = self._crossover(parent1, parent2)
            child = self._mutate(child, rate=0.1)
            child = self.constraint.project(child)
            new_population.append(child)
        child_fitness = []
        for p in new_population:
            mask = p > 0.001
            X = _build_X_from_p(p, M)
            child_fitness.append(self._evaluate_recipe(X.reshape(1, M, 3), mask.reshape(1, -1)))
        for i in range(pop_size):
            if child_fitness[i] > fitness[i]:
                population[i] = new_population[i]
                fitness[i] = child_fitness[i]
        gen_best = int(np.argmax(fitness))
        if fitness[gen_best] > best_score:
            best_score = fitness[gen_best]
            best_p = population[gen_best]

    best_X = _build_X_from_p(best_p, M)
    best_mask = best_p > 0.001
    total_iters = (n_gen + 1) * pop_size
    return self._build_result(best_X, best_mask, best_score, total_iters, start_time)


def _install_optimizer_fixes():
    RandomSearchOptimizer.optimize = _patched_random_optimize
    EvolutionaryOptimizer.optimize = _patched_evolutionary_optimize
    # HybridOptimizer instantiates RandomSearchOptimizer/EvolutionaryOptimizer,
    # so the class-level patch above transparently fixes it too.


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------
def _py(value):
    if isinstance(value, np.floating) or isinstance(value, float):
        return float(value)
    if isinstance(value, np.integer) or isinstance(value, int):
        return int(value)
    if isinstance(value, np.ndarray):
        return [_py(v) for v in value.tolist()]
    if isinstance(value, dict):
        return {k: _py(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_py(v) for v in value]
    return value


def _decode_percent_recipe(search_space, X3, mask):
    """(M,3) X + (M,) mask -> {material_name: percent} (plain floats)."""
    recipe = search_space.decode_recipe(X3, mask)
    return {k: _py(v) for k, v in recipe.items()}


def _sorted_arrays(recipe):
    items = sorted(recipe.items(), key=lambda kv: -float(kv[1]))
    return {"materials": [k for k, _ in items], "proportions": [float(v) for _, v in items]}


def _target_met(config_targets, props):
    out = {}
    for prop_name, cfg in config_targets.items():
        value = props.get(prop_name)
        if value is None:
            out[prop_name] = False
            continue
        direction = cfg.get("direction", "maximize")
        if direction == "maximize":
            out[prop_name] = bool(value >= cfg.get("min", 0))
        elif direction == "minimize":
            out[prop_name] = bool(value <= cfg.get("max", 1e6))
        else:  # constrain
            lo = cfg.get("min", -1e6)
            hi = cfg.get("max", 1e6)
            out[prop_name] = bool(lo <= value <= hi)
    return out


def _cost_vector_fn(predictor, targets):
    """Pure per-target cost-vector calculator reusing the package's own
    MultiObjective semantics (all directions -> minimize costs)."""
    mo = MultiObjectiveFunction(predictor, targets=targets)
    return lambda props: np.asarray(mo._compute_objective_vector(props), dtype=np.float64)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run(request, emit=None):
    """Run one optimization.

    request : dict with algorithm/budget/targets (+ optional stream flag,
              handled by main() which supplies ``emit``).
    emit    : optional callable(msg_dict) invoked after *every* recorded
              candidate evaluation with a {"type":"progress", ...} payload so
              stream mode can flush progress in real time.  None (non-stream)
              keeps the original single-JSON-at-end behaviour byte-identical.
    """
    algorithm = str(request.get("algorithm") or "nsga2").strip().lower()
    if algorithm not in ALGORITHMS:
        raise ValueError("未知算法: %r (可用: %s)" % (algorithm, ", ".join(sorted(ALGORITHMS))))
    try:
        budget = max(1, min(int(request.get("budget") or DEFAULT_BUDGET), MAX_BUDGET))
    except (TypeError, ValueError):
        budget = DEFAULT_BUDGET

    _log("start: algorithm=%s budget=%d" % (algorithm, budget))

    if not MODEL_PATH.exists():
        raise FileNotFoundError("预测模型不存在: %s" % MODEL_PATH)
    if not MAP_PATH.exists():
        raise FileNotFoundError("映射文件不存在: %s" % MAP_PATH)
    if not DATA_PATH.exists():
        raise FileNotFoundError("数据集不存在: %s" % DATA_PATH)

    # ---- predictor -------------------------------------------------------
    predictor = RecipePredictor(
        model_path=str(MODEL_PATH),
        data_path=str(DATA_PATH),
        map_path=str(MAP_PATH),
    )
    t0 = time.time()
    predictor.initialize()
    _log("predictor initialized in %.1fs (%d materials, %d properties)"
         % (time.time() - t0, len(predictor.material_names), len(predictor.property_names)))
    _backfill_imputer_dtype(predictor)

    property_names = list(predictor.property_names)

    # ---- targets ---------------------------------------------------------
    raw_targets = request.get("targets")
    if raw_targets is None:
        raw_targets = []
    if not isinstance(raw_targets, list):
        raise ValueError("targets 必须是数组")

    if raw_targets:
        targets = {}
        for t in raw_targets:
            if not isinstance(t, dict):
                raise ValueError("targets 元素必须是对象")
            internal, cfg = _build_target_config(t, property_names)
            targets[internal] = cfg
    else:
        targets = dict(TARGET_THRESHOLDS)
        _log("no targets given -> TARGET_THRESHOLDS defaults: %s" % ", ".join(targets))

    targets = _effective_targets(targets)
    _log("effective targets: %s" % json.dumps(targets, ensure_ascii=False))

    config = OptimizationConfig(
        targets=targets,
        max_iterations=budget,
        algorithm=algorithm,
    )

    # ---- search space / constraint --------------------------------------
    search_space = SearchSpace(map_path=str(MAP_PATH))
    constraint = RecipeConstraint(
        max_ingredients=config.max_ingredients,
        min_ingredients=config.min_ingredients,
        min_content=config.min_content,
        max_content=config.max_content,
        material_names=search_space.material_names,
    )
    _log("search space: %d materials" % search_space.n_materials)

    # ---- record every predictor.predict call (1 per evaluated candidate) -
    # In stream mode (emit is not None) each recorded evaluation additionally
    # flushes a {"type":"progress", ...} line to stdout *as it happens*, with
    # the running best-so-far scalar cost — the same quantity the final trace
    # is derived from, so the live stream and the terminal trace agree.
    evaluations = []
    running_best = float("inf")
    orig_predict = predictor.predict

    def tee_predict(X, X_mask):
        nonlocal running_best
        props = orig_predict(X, X_mask)
        evaluations.append({"X": np.array(X, copy=True), "props": props})
        if emit is not None:
            cost = float(np.sum(cost_vec(props)))
            if cost < running_best:
                running_best = cost
            emit({
                "type": "progress",
                "iteration": len(evaluations),
                "best_objective": float(running_best),
                "algorithm": algorithm,
            })
        return props

    predictor.predict = tee_predict

    cost_vec = _cost_vector_fn(predictor, targets)
    prop_names = list(targets.keys())
    n_targets = len(prop_names)

    def scalar_cost(props):
        return float(np.sum(cost_vec(props)))

    # ---- pick optimizer ---------------------------------------------------
    _install_optimizer_fixes()
    if algorithm == "nsga2":
        objective = MultiObjectiveFunction(predictor, targets=targets)
        optimizer = NSGA2Optimizer(predictor, objective, constraint, search_space, config)
    else:
        objective = ObjectiveFunction(predictor, targets=targets)
        optimizer = {
            "evolutionary": EvolutionaryOptimizer,
            "hybrid": HybridOptimizer,
        }.get(algorithm, RandomSearchOptimizer)(
            predictor, objective, constraint, search_space, config
        )

    t0 = time.time()
    result = optimizer.optimize(budget)
    _log("optimize finished in %.1fs -> %s (score=%s)"
         % (time.time() - t0, result.algorithm, result.best_score))

    if not evaluations:
        raise RuntimeError("优化过程未产生任何候选评估")

    # ---- best candidate: min penalty-inclusive scalar cost -----------------
    costs = [scalar_cost(e["props"]) for e in evaluations]
    best_i = int(np.argmin(costs))
    best_entry = evaluations[best_i]
    X3 = np.asarray(best_entry["X"]).reshape(search_space.n_materials, 3)
    best_mask = X3[:, 0] > 0.001
    best_recipe = _decode_percent_recipe(search_space, X3, best_mask)
    best_predicted = {k: _py(v) for k, v in best_entry["props"].items()}
    best_objective = float(costs[best_i])
    _log("best candidate #%d/%d objective=%.4f ingredients=%d"
         % (best_i + 1, len(evaluations), best_objective, len(best_recipe)))

    # ---- trace: best-so-far per recorded step ------------------------------
    trace = []
    running_best = float("inf")
    for idx, c in enumerate(costs, start=1):
        if c < running_best:
            running_best = c
        trace.append({"iteration": int(idx), "best_objective": float(running_best)})

    # ---- pareto front -------------------------------------------------------
    if algorithm == "nsga2" and getattr(result, "pareto_front", None):
        pareto_entries = []
        for sol in result.pareto_front:
            recipe = _py(sol.get("recipe") or {})
            vec = [float(v) for v in (sol.get("objectives") or [])]
            objs = {}
            for name, val in zip(prop_names, vec):
                objs[name] = val
            entry = dict(_sorted_arrays(recipe))
            entry["objectives"] = objs
            pareto_entries.append(entry)
    else:
        # single-objective family: build a non-dominated set over every
        # recorded candidate using the package's own Pareto utilities
        pf = ParetoFront(max_size=100, directions=["minimize"] * n_targets)
        for e, cvec in zip(evaluations, [cost_vec(e["props"]) for e in evaluations]):
            Xe = np.asarray(e["X"]).reshape(search_space.n_materials, 3)
            maske = Xe[:, 0] > 0.001
            recipe = _decode_percent_recipe(search_space, Xe, maske)
            pf.add(np.asarray(cvec, dtype=np.float64), {
                "recipe": recipe,
                "objectives": [float(v) for v in cvec],
            })
        pareto_entries = []
        for sol in pf.solutions:
            objs = {}
            for name, val in zip(prop_names, sol["objectives"]):
                objs[name] = float(val)
            entry = dict(_sorted_arrays(sol["recipe"]))
            entry["objectives"] = objs
            pareto_entries.append(entry)

    hypervolume = None
    if algorithm == "nsga2" and getattr(result, "hypervolume", None) is not None:
        hypervolume = float(result.hypervolume)

    data = {
        "ok": True,
        "algorithm": algorithm,
        "iterations": len(trace),
        "best_recipe": _sorted_arrays(best_recipe),
        "best_objective": best_objective,
        "best_predicted": best_predicted,
        "trace": trace,
        "pareto_front": pareto_entries,
        "hypervolume": hypervolume,
        "target_met": _target_met(targets, best_predicted),
    }
    return data


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

    stream = bool(request.get("stream"))

    def emit(msg):
        sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    if stream:
        # Real-time mode: one NDJSON line per evaluated candidate
        # ({"type":"progress",...}), then one final result line
        # ({"type":"result","data":{...same payload as non-stream...}}).
        data = run(request, emit=emit)
        emit({"type": "result", "data": data})
    else:
        data = run(request)
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
        sys.exit(1)
