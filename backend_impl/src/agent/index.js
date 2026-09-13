'use strict';

/**
 * agent/index.js — public entry point of the multi-turn agent module.
 *
 * Modular & independently removable: mount with
 *   const agentRoutes = require('./agent');
 *   app.use('/api/agent', agentRoutes.router);
 * and delete that line (plus this directory) to remove the feature.
 *
 * Layers:
 *   provider.js  "ai"      — swappable OpenAI-compatible LLM client (tool calling)
 *   loop.js      "agent"   — agent loop: conversation state + tool execution
 *   policy.js              — deny-by-default tool policy, arg validation, audit
 *   tools/                 — registry of exactly five API-only tools
 *   route.js               — GET /tools + POST /stream (SSE)
 *
 * There is no file/shell/database tool and no code path that reads ./private,
 * backend_impl/data, *.sqlite, _code or .env.
 */

const { router } = require('./route');

module.exports = { router };
