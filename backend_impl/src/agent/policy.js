'use strict';

/**
 * policy.js — permission layer for the multi-turn agent.
 *
 * Deny-by-default. This module owns everything that decides *what may run*:
 *   1. tool exposure  : only names present in the tool registry can ever be
 *                       exposed/executed (`options.allowTools` may only narrow).
 *   2. argument gate  : per-tool JSON-Schema-lite validation before execution.
 *   3. network policy : web_browse host allowlist + private/link-local/metadata
 *                       address blocking (see webBrowse.js for redirect hops).
 *   4. audit          : one line per tool call, never containing private payloads.
 *   5. quota          : per-turn tool budget + cap on expensive tool calls.
 *
 * There is intentionally NO file, shell, database or env accessor anywhere in
 * this module or in `tools/` — the agent cannot read ./private,
 * backend_impl/data, sqlite files, _code, or .env by construction. The only
 * filesystem write in the whole module is the append-only audit trail
 * (audit.js), which stores argument *shapes*, never payloads.
 */

const audit = require('./audit');

const MAX_ARG_STRING = 4000;
const MAX_ARG_ARRAY = 64;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * Resolve the effective tool allowlist: registry ∩ requested (never the other
 * way round). Unknown names requested by a client silently grant nothing.
 * @param {string[]|undefined} requested
 * @param {string[]} registered
 * @returns {string[]}
 */
function resolveAllowedTools(requested, registered) {
  const known = new Set(registered);
  if (!Array.isArray(requested) || requested.length === 0) return [...registered];
  const narrowed = requested.filter((name) => known.has(name));
  return [...new Set(narrowed)];
}

function schemaTypeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Minimal JSON-Schema validation (the subset the tool contracts use):
 * type / required / properties / items / enum / minimum / maximum.
 * Returns the (shallow-copied, unknown keys stripped) args object.
 * @throws {Error} with a user-facing message on the first violation
 */
function validateArgs(schema, args, toolName) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  if (!schema || schema.type !== 'object') return input;

  const out = {};
  const props = schema.properties || {};
  for (const key of schema.required || []) {
    if (input[key] === undefined || input[key] === null) {
      throw new Error(`${toolName}: missing required argument "${key}"`);
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const spec = props[key];
    if (!spec) {
      // additionalProperties defaults to being ignored (never forwarded raw).
      continue;
    }
    out[key] = validateValue(spec, value, `${toolName}.${key}`);
  }
  return out;
}

function validateValue(spec, value, path) {
  const t = schemaTypeOf(value);
  if (spec.type && spec.type !== t) {
    // Accept an integer where a number is expected (and vice versa).
    const numeric = spec.type === 'number' && t === 'number';
    if (!numeric) throw new Error(`${path}: expected ${spec.type}, got ${t}`);
  }
  if (spec.type === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: expected a finite number`);
    if (spec.minimum !== undefined && value < spec.minimum) {
      throw new Error(`${path}: must be >= ${spec.minimum}`);
    }
    if (spec.maximum !== undefined && value > spec.maximum) {
      throw new Error(`${path}: must be <= ${spec.maximum}`);
    }
    return value;
  }
  if (spec.type === 'string') {
    if (value.length > MAX_ARG_STRING) throw new Error(`${path}: string too long`);
    if (Array.isArray(spec.enum) && !spec.enum.includes(value)) {
      throw new Error(`${path}: must be one of ${spec.enum.join(', ')}`);
    }
    return value;
  }
  if (spec.type === 'array') {
    if (value.length > MAX_ARG_ARRAY) throw new Error(`${path}: too many items (max ${MAX_ARG_ARRAY})`);
    if (!spec.items) return value;
    return value.map((item, i) => validateValue(spec.items, item, `${path}[${i}]`));
  }
  if (spec.type === 'object' && spec.properties) {
    const nested = {};
    for (const [key, sub] of Object.entries(value)) {
      if (!spec.properties[key]) continue;
      nested[key] = validateValue(spec.properties[key], sub, `${path}.${key}`);
    }
    for (const key of spec.required || []) {
      if (nested[key] === undefined) throw new Error(`${path}: missing required field "${key}"`);
    }
    return nested;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Network policy (web_browse)
// ---------------------------------------------------------------------------

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /^\[?::ffff:(127|10|192\.168|169\.254)\./i,
  /\.internal$/i,
  /^metadata\./i,
  /\.metadata\./i,
];

/** True when the hostname/IP literal is private, link-local or metadata. */
function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(host));
}

/** True when a resolved IP (v4/v6) is private/link-local/loopback/ULA. */
function isBlockedIp(address) {
  const ip = String(address || '').toLowerCase();
  if (!ip) return true;
  if (ip.includes(':')) {
    return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')
      || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.');
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Parse AGENT_WEB_ALLOWLIST; supports exact hosts and `*.suffix` wildcards. */
function parseHostAllowlist(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isHostAllowlisted(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return allowlist.some((entry) => {
    if (entry.startsWith('*.')) return host.endsWith(entry.slice(1));
    return host === entry;
  });
}

/**
 * NARROW-ONLY allowlist intersection: a per-request list may remove hosts from
 * the operator allowlist but can never add one. Entries are compared as exact
 * patterns, so `*.example.com` cannot be widened from `a.example.com` either.
 * @param {string[]} base       operator allowlist (AGENT_WEB_ALLOWLIST)
 * @param {string[]|undefined} requested  per-request narrowing
 * @returns {string[]}
 */
function narrowAllowlist(base, requested) {
  const allowed = Array.isArray(base) ? base : [];
  if (!Array.isArray(requested) || requested.length === 0) return [...allowed];
  const known = new Set(allowed);
  const narrowed = requested
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => known.has(entry));
  return [...new Set(narrowed)];
}

// ---------------------------------------------------------------------------
// Quota (per turn)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOOLS = 8;
const DEFAULT_MAX_OPTIMIZE = 1;
const RECIPE_OPT_MAX_CALLS_CAP = 2;

/** Tools expensive enough to deserve their own per-turn cap. */
const EXPENSIVE_TOOLS = new Set(['recipe_optimize']);

/**
 * Resolve this turn's tool budget. Client options may only lower the defaults;
 * the recipe_optimize cap is additionally hard-capped by
 * AGENT_RECIPE_OPT_MAX_CALLS (default 2), which options cannot raise.
 * @param {{maxTools?:number, maxOptimize?:number}} options
 * @param {Record<string,string|undefined>} [env]
 */
function resolveQuota(options = {}, env = process.env) {
  const hardCap = clampInt(env.AGENT_RECIPE_OPT_MAX_CALLS, RECIPE_OPT_MAX_CALLS_CAP, 1, 8);
  return {
    maxTools: clampInt(options.maxTools, DEFAULT_MAX_TOOLS, 1, 32),
    maxOptimize: clampInt(options.maxOptimize, DEFAULT_MAX_OPTIMIZE, 1, hardCap),
    maxOptimizeHardCap: hardCap,
  };
}

/**
 * Reason the NEXT tool call must be refused, or null when it may run.
 * @param {string} name
 * @param {{tools:number, optimize:number}} usage  calls already made this turn
 * @param {{maxTools:number, maxOptimize:number}} quota
 * @returns {string|null}
 */
function toolQuotaReason(name, usage, quota) {
  if (EXPENSIVE_TOOLS.has(name) && usage.optimize >= quota.maxOptimize) {
    return `${name} 本回合最多调用 ${quota.maxOptimize} 次（昂贵操作），本次调用已被配额拒绝；`
      + '请直接使用已有的优化结果作答。';
  }
  if (usage.tools >= quota.maxTools) {
    return `本回合工具调用次数已达上限（${quota.maxTools} 次），本次调用已被配额拒绝；请基于已有结果作答。`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const AUDIT_KEYS = [
  'query', 'url', 'host', 'algorithm', 'budget', 'topK', 'conditions', 'properties',
  'rows', 'cols', 'X_global_len', 'targets', 'targetCount',
];

/**
 * Build a redacted, bounded summary of tool arguments. Only shape/keys ever
 * leave this function — never bulk scientific payloads.
 */
function summarizeArgs(name, args) {
  const safe = {};
  if (!args || typeof args !== 'object') return safe;
  // Shape-only descriptors for large arrays.
  if (Array.isArray(args.X_comp)) {
    safe.rows = args.X_comp.length;
    safe.cols = Array.isArray(args.X_comp[0]) ? args.X_comp[0].length : 0;
  }
  if (Array.isArray(args.X_global)) safe.X_global_len = args.X_global.length;
  if (Array.isArray(args.targets)) safe.targetCount = args.targets.length;
  for (const key of AUDIT_KEYS) {
    const value = args[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 120);
    else if (typeof value === 'number') safe[key] = value;
    else if (typeof value === 'boolean') safe[key] = value;
    else if (Array.isArray(value) && safe[key] === undefined) {
      safe[key] = value.slice(0, 8).map((v) => (typeof v === 'string' ? v.slice(0, 60) : v));
    }
  }
  return safe;
}

/**
 * One audit line per tool call: {ts, tool, argsSummary, ok, ms, sessionId?}.
 * Printed to stdout AND appended to the NDJSON trail (audit.js). Only argument
 * shapes are ever recorded — never payloads, urls' bodies or private data.
 * @param {{name:string, argsSummary?:object, ok:boolean, ms:number, sessionId?:string, error?:string, auditDir?:string}} entry
 */
function auditCall(entry) {
  const line = {
    ts: new Date().toISOString(),
    tool: entry.name,
    argsSummary: entry.argsSummary || {},
    ok: !!entry.ok,
    ms: entry.ms,
  };
  if (entry.sessionId) line.sessionId = String(entry.sessionId).slice(0, 64);
  if (entry.error) line.error = String(entry.error).slice(0, 200);
  // eslint-disable-next-line no-console
  console.log('[agent:audit]', JSON.stringify(line));
  audit.appendAuditLine(line, { dir: entry.auditDir });
  return line;
}

module.exports = {
  clampInt,
  resolveAllowedTools,
  validateArgs,
  isBlockedHost,
  isBlockedIp,
  parseHostAllowlist,
  isHostAllowlisted,
  narrowAllowlist,
  resolveQuota,
  toolQuotaReason,
  summarizeArgs,
  auditCall,
  PRIVATE_HOST_PATTERNS,
  DEFAULT_MAX_TOOLS,
  DEFAULT_MAX_OPTIMIZE,
  RECIPE_OPT_MAX_CALLS_CAP,
  EXPENSIVE_TOOLS,
};
