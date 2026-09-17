'use strict';

/**
 * metrics.js — counters behind GET /api/agent/metrics (T9).
 *
 * Process-lifetime aggregates: they cover everything this process has served
 * since boot and are reset by a restart. That is intentional — the durable,
 * per-call record already exists as the NDJSON audit trail (audit.js), and an
 * in-memory counter costs nothing on the hot path of every turn.
 *
 * Token accounting comes from the provider's `usage` block. Providers/streams
 * that do not return usage contribute 0 and leave `tokens.reported === false`,
 * so the caller can tell "no tokens used" apart from "upstream did not say".
 *
 * A "tool call" is a tool the model asked for and the loop reported back
 * (including quota-refused calls, which are also `ok:false` errors).
 */

function emptyState() {
  return {
    turns: 0,
    toolCalls: 0,
    toolErrors: 0,
    turnMs: 0,
    tokens: { prompt: 0, completion: 0, total: 0, reported: false },
    tools: new Map(),
  };
}

let state = emptyState();

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toolBucket(name) {
  let bucket = state.tools.get(name);
  if (!bucket) {
    bucket = { calls: 0, errors: 0, ms: 0 };
    state.tools.set(name, bucket);
  }
  return bucket;
}

/**
 * Record one finished agent turn.
 *
 * @param {object} turn
 * @param {number} [turn.ms]      wall-clock duration of the turn
 * @param {Array<{name:string, ok:boolean, ms:number}>} [turn.tools] tool calls emitted by the turn
 * @param {{prompt?:number, completion?:number, total?:number, reported?:boolean}} [turn.usage]
 */
function recordTurn(turn = {}) {
  state.turns += 1;
  state.turnMs += finite(turn.ms);

  for (const call of Array.isArray(turn.tools) ? turn.tools : []) {
    if (!call || typeof call.name !== 'string' || !call.name) continue;
    const bucket = toolBucket(call.name);
    bucket.calls += 1;
    bucket.ms += finite(call.ms);
    state.toolCalls += 1;
    if (call.ok !== true) {
      bucket.errors += 1;
      state.toolErrors += 1;
    }
  }

  const usage = turn.usage;
  if (usage && usage.reported !== false && (finite(usage.total) || finite(usage.prompt) || finite(usage.completion))) {
    state.tokens.prompt += finite(usage.prompt);
    state.tokens.completion += finite(usage.completion);
    state.tokens.total += finite(usage.total);
    state.tokens.reported = true;
  }
  return snapshot();
}

/** Current aggregate, shaped exactly like the GET /api/agent/metrics body. */
function snapshot() {
  const tools = {};
  for (const name of [...state.tools.keys()].sort()) {
    const bucket = state.tools.get(name);
    tools[name] = {
      calls: bucket.calls,
      errors: bucket.errors,
      avgMs: bucket.calls ? Math.round(bucket.ms / bucket.calls) : 0,
    };
  }
  return {
    turns: state.turns,
    toolCalls: state.toolCalls,
    toolErrors: state.toolErrors,
    tokens: {
      prompt: state.tokens.prompt,
      completion: state.tokens.completion,
      total: state.tokens.total,
      // false → the upstream provider returned no usage block for any turn.
      reported: state.tokens.reported,
    },
    avgTurnMs: state.turns ? Math.round(state.turnMs / state.turns) : 0,
    tools,
  };
}

/** Reset every counter (tests; no HTTP route exposes this). */
function reset() {
  state = emptyState();
}

module.exports = { recordTurn, snapshot, reset };
