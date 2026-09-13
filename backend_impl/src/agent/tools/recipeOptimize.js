'use strict';

/**
 * recipeOptimize — call the local recipe-optimization model through its
 * STANDARD API only: POST {AGENT_RECIPE_OPT_BASE_URL}/api/model2/optimize
 * (backend_impl route → python recipe_opt_bridge.py).
 *
 * This is the most expensive tool in the registry (each run evaluates the
 * predictor `budget` times), so the budget is hard-capped (default 60) and the
 * tool description tells the model to use it only when optimisation is
 * explicitly requested.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const TIMEOUT_MS = Number(process.env.AGENT_RECIPE_OPT_TIMEOUT_MS || 300000);
const ALGORITHMS = ['nsga2', 'evolutionary', 'bayesian', 'hybrid', 'random'];

function maxBudget() {
  const parsed = Number(process.env.AGENT_RECIPE_OPT_MAX_BUDGET);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 60;
}

function optimizeUrl() {
  const base = String(process.env.AGENT_RECIPE_OPT_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return `${base}/api/model2/optimize`;
}

const parameters = {
  type: 'object',
  properties: {
    algorithm: {
      type: 'string',
      enum: ALGORITHMS,
      description: '优化算法，默认 nsga2。',
    },
    budget: {
      type: 'number',
      description: '评估预算（即调用预测模型的次数）。默认 60，硬上限 60；数值越大越慢。',
      minimum: 1,
      maximum: 60,
    },
    targets: {
      type: 'array',
      description: '优化目标列表（可选），例如 [{name:"crushing_strength",direction:"maximize",lower:0,upper:200}]。',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          direction: { type: 'string', enum: ['maximize', 'minimize'] },
          lower: { type: 'number' },
          upper: { type: 'number' },
        },
        required: ['name', 'direction'],
      },
    },
  },
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const algorithm = args.algorithm === undefined ? 'nsga2' : args.algorithm;
  if (!ALGORITHMS.includes(algorithm)) {
    throw new Error(`recipe_optimize: algorithm must be one of ${ALGORITHMS.join(', ')}`);
  }
  const cap = maxBudget();
  const requested = args.budget === undefined ? cap : Number(args.budget);
  if (!Number.isFinite(requested) || requested < 1) {
    throw new Error('recipe_optimize: budget must be a positive number');
  }
  const budget = Math.min(cap, Math.round(requested));

  const payload = { algorithm, budget };
  if (args.targets !== undefined) {
    if (!Array.isArray(args.targets) || args.targets.length === 0 || args.targets.length > 8) {
      throw new Error('recipe_optimize: targets must be an array of 1..8 entries');
    }
    payload.targets = args.targets.map((target, i) => {
      const name = target && typeof target.name === 'string' ? target.name.trim() : '';
      if (!name) throw new Error(`recipe_optimize: targets[${i}].name is required`);
      const direction = target.direction === 'minimize' ? 'minimize' : 'maximize';
      const out = { name, direction };
      if (Number.isFinite(Number(target.lower))) out.lower = Number(target.lower);
      if (Number.isFinite(Number(target.upper))) out.upper = Number(target.upper);
      return out;
    });
  }
  return payload;
}

function summarizeRun(data) {
  const bits = [`algorithm=${data.algorithm}`, `iterations=${data.iterations}`];
  if (data.best_objective !== undefined) bits.push(`best_objective=${JSON.stringify(data.best_objective).slice(0, 300)}`);
  if (data.best_predicted) bits.push(`best_predicted=${JSON.stringify(data.best_predicted).slice(0, 300)}`);
  if (data.target_met !== undefined) bits.push(`target_met=${JSON.stringify(data.target_met).slice(0, 200)}`);
  return bits.join(', ');
}

async function execute(payload, ctx) {
  const url = optimizeUrl();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = ctx && ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, summary: `recipe_optimize: service unreachable at ${url} (${reason})`, data: { url } };
  }

  const text = await response.text();
  let envelope = null;
  try {
    envelope = JSON.parse(text);
  } catch {
    return {
      ok: false,
      summary: `recipe_optimize: service returned non-JSON (HTTP ${response.status})`,
      data: { url, status: response.status, body: text.slice(0, 500) },
    };
  }

  const data = envelope.data || envelope;
  if (!response.ok || !data || data.ok !== true) {
    const message = envelope.message || (data && (data.message || data.error)) || `HTTP ${response.status}`;
    return { ok: false, summary: `recipe_optimize failed: ${String(message).slice(0, 300)}`, data: { url, status: response.status } };
  }

  return {
    ok: true,
    summary: summarizeRun(data),
    data: {
      algorithm: data.algorithm,
      iterations: data.iterations,
      budget: payload.budget,
      best_recipe: data.best_recipe,
      best_objective: data.best_objective,
      best_predicted: data.best_predicted,
      target_met: data.target_met,
      hypervolume: data.hypervolume,
      pareto_front: Array.isArray(data.pareto_front) ? data.pareto_front.slice(0, 5) : undefined,
    },
  };
}

module.exports = {
  name: 'recipe_optimize',
  description:
    '调用本地配方优化模型（标准 API /api/model2/optimize）搜索最优配方。**昂贵操作**：每次运行会调用预测模型 '
    + 'budget 次（默认/上限 60），耗时可能数十秒到数分钟；仅在用户明确要求“优化配方/寻优”时调用一次，不要反复调用。',
  parameters,
  validate,
  execute,
};
