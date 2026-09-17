'use strict';

/**
 * tools/index.js — the agent tool registry.
 *
 * This is the ONLY set of tools that can ever be exposed or executed. Adding a
 * tool means adding a module here; anything not in this array is unreachable
 * from `/api/agent/*` (deny-by-default). No file/shell/database tool exists by
 * design — see policy.js for the hard rules.
 *
 * Each tool module exports:
 *   { name, description, parameters (JSON Schema), validate(args) -> body, execute(body, ctx) -> {ok, summary, data} }
 */

const policy = require('../policy');

const MODULES = [
  require('./kgList'),
  require('./kgGraph'),
  require('./kgSearch'),
  require('./ragSearch'),
  require('./predict'),
  require('./recipeOptimize'),
  require('./webBrowse'),
];

const REGISTRY = new Map(MODULES.map((tool) => [tool.name, tool]));

/** Public descriptors for GET /api/agent/tools. */
function listTools() {
  return MODULES.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function registeredNames() {
  return MODULES.map((tool) => tool.name);
}

/** OpenAI-style `tools` payload for the given (already restricted) names. */
function getToolSchemas(names) {
  return names
    .map((name) => REGISTRY.get(name))
    .filter(Boolean)
    .map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
}

/**
 * Execute a tool by name. Never throws: every outcome is an audit-logged
 * `{ok, summary, data}` so the SSE stream can always report a tool_result.
 *
 * @param {string} name       tool name as requested by the model
 * @param {unknown} rawArgs   raw arguments object
 * @param {{allowed:string[], signal?:AbortSignal, projectId?:string, graphId?:string,
 *          webAllowlist?:string[], sessionId?:string}} ctx
 */
async function runTool(name, rawArgs, ctx = {}) {
  const started = Date.now();
  const finish = (outcome) => {
    policy.auditCall({
      name,
      argsSummary: policy.summarizeArgs(name, rawArgs),
      ok: outcome.ok,
      ms: Date.now() - started,
      sessionId: ctx.sessionId,
      error: outcome.ok ? undefined : String(outcome.summary || '').slice(0, 200),
    });
    return outcome;
  };

  const tool = REGISTRY.get(name);
  if (!tool) {
    return finish({ ok: false, summary: `unknown tool "${name}" (not in registry)`, data: null });
  }
  if (Array.isArray(ctx.allowed) && !ctx.allowed.includes(name)) {
    return finish({ ok: false, summary: `tool "${name}" is disabled for this request`, data: null });
  }

  let args;
  try {
    // Generic schema gate (types/required/enums/bounds, unknown keys stripped).
    // Each tool then runs its own semantic `validate()` exactly once, inside
    // execute() — so argument mapping can never be applied twice.
    args = policy.validateArgs(tool.parameters, rawArgs, name);
  } catch (error) {
    return finish({ ok: false, summary: error.message, data: null });
  }

  try {
    const outcome = await tool.execute(args, {
      signal: ctx.signal,
      projectId: ctx.projectId,
      graphId: ctx.graphId,
      // Per-request host narrowing for web_browse (narrow-only; see policy.js).
      webAllowlist: ctx.webAllowlist,
    });
    if (!outcome || typeof outcome !== 'object') {
      return finish({ ok: false, summary: `tool "${name}" returned no result`, data: null });
    }
    return finish({
      ok: outcome.ok === true,
      summary: String(outcome.summary || (outcome.ok ? 'ok' : 'failed')).slice(0, 1200),
      data: boundData(outcome.data),
    });
  } catch (error) {
    return finish({ ok: false, summary: `tool "${name}" threw: ${error.message}`, data: null });
  }
}

const MAX_DATA_CHARS = 24000;

/** Keep tool payloads bounded before they reach the SSE frame / LLM context. */
function boundData(data) {
  if (data === undefined || data === null) return null;
  try {
    const text = JSON.stringify(data);
    if (text.length <= MAX_DATA_CHARS) return data;
    return { truncated: true, preview: text.slice(0, MAX_DATA_CHARS) };
  } catch {
    return { truncated: true, preview: String(data).slice(0, MAX_DATA_CHARS) };
  }
}

module.exports = {
  listTools,
  registeredNames,
  getToolSchemas,
  runTool,
};
