'use strict';

/**
 * sessions.js — durable chat-session store (T3) + the in-memory SSE frame ring
 * buffer used for reconnect/resume (T11).
 *
 * Storage
 *   ${AGENT_SESSION_DIR || backend_impl/data/agent/sessions}/<sessionId>.json
 *   (`backend_impl/data` is gitignored; the directory is created lazily, so no
 *   setup step is required.)
 *
 * File shape
 *   { sessionId, title, createdAt, updatedAt,
 *     messages:[{ role:'user'|'assistant', content,
 *                 toolCalls?:[{name,argsSummary,ok,ms}], error?:{code?,message} }] }
 *
 * Writes are atomic (tmp file + rename) and best-effort by design: a read-only
 * or full disk must degrade persistence, never break an agent turn.
 *
 * NOT durable — deliberately process memory only (see the module doc contract):
 *   • per-session frame ring buffer (last AGENT_SSE_BUFFER frames, default 200)
 *     replayed by POST /api/agent/stream {resumeFromEventId};
 *   • live turn listeners (fan-out for clients reconnecting mid-turn);
 *   • the "turn is running" flag used to reject concurrent turns.
 * A backend restart loses resumable frames; persisted sessions survive, and a
 * client simply falls back to GET /api/agent/sessions/:id.
 *
 * A sessionId coming from the network is only ever used after
 * `isValidSessionId`, so no path outside the session directory is reachable.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { clampInt } = require('./policy');

/** `backend_impl/data/agent/sessions` — inside the gitignored data directory. */
const DEFAULT_SESSION_DIR = path.join(__dirname, '..', '..', 'data', 'agent', 'sessions');

const DEFAULT_TITLE = '新会话';
const DEFAULT_BUFFER_SIZE = 200;
const MAX_BUFFER_SIZE = 5000;
const MAX_TITLE_CHARS = 120;
const MAX_MESSAGES_PER_SESSION = 200;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/** Session ids are opaque and path-safe: they become file names. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function defaultSessionDir() {
  return DEFAULT_SESSION_DIR;
}

/** Resolve the session directory: explicit override > AGENT_SESSION_DIR > default. */
function sessionDir(override) {
  const raw = override !== undefined && override !== null ? override : process.env.AGENT_SESSION_DIR;
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? path.resolve(value) : DEFAULT_SESSION_DIR;
}

/** Ring-buffer depth for resume replay (AGENT_SSE_BUFFER, default 200). */
function bufferSize(env = process.env) {
  return clampInt(env.AGENT_SSE_BUFFER, DEFAULT_BUFFER_SIZE, 1, MAX_BUFFER_SIZE);
}

function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_PATTERN.test(id);
}

/** Absolute path of a session file. Caller must have validated the id. */
function sessionPath(id, dirOverride) {
  if (!isValidSessionId(id)) throw new Error(`invalid sessionId "${id}"`);
  return path.join(sessionDir(dirOverride), `${id}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function clampTitle(title) {
  const value = typeof title === 'string' ? title.trim() : '';
  return value ? value.slice(0, MAX_TITLE_CHARS) : null;
}

/** Number of user turns recorded in a session (one user message per turn). */
function countTurns(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((total, message) => total + (message && message.role === 'user' ? 1 : 0), 0);
}

/** Public projection of a stored session (no internal bookkeeping fields). */
function summarize(record) {
  return {
    sessionId: record.sessionId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    turns: countTurns(record.messages),
  };
}

// ---------------------------------------------------------------------------
// Persistence (best-effort, atomic)
// ---------------------------------------------------------------------------

/**
 * Atomic JSON write: full file to a sibling tmp path, then rename.
 * @returns {boolean} false (warned) when the write failed
 */
function writeSessionFile(file, record) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch (error) {
    console.warn('[agent:sessions] write failed:', error.message);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* the tmp file is already gone — nothing else to clean up */
    }
    return false;
  }
}

/** Read one session, or null when absent/corrupt/not a valid id. */
function readSession(id, options = {}) {
  if (!isValidSessionId(id)) return null;
  let raw;
  try {
    raw = fs.readFileSync(sessionPath(id, options.dir), 'utf8');
  } catch {
    return null;
  }
  try {
    const record = JSON.parse(raw);
    if (!record || typeof record !== 'object' || record.sessionId !== id) return null;
    return {
      sessionId: record.sessionId,
      title: clampTitle(record.title) || DEFAULT_TITLE,
      createdAt: record.createdAt || nowIso(),
      updatedAt: record.updatedAt || record.createdAt || nowIso(),
      messages: Array.isArray(record.messages) ? record.messages : [],
      ...(record.researchState && record.researchState.version === 1 ? { researchState: record.researchState } : {}),
    };
  } catch (error) {
    console.warn(`[agent:sessions] ${id}.json is not valid JSON:`, error.message);
    return null;
  }
}

/**
 * Create (and persist) a session.
 * @param {{title?:string, id?:string, dir?:string}} [options]
 * @returns {{sessionId:string, title:string, createdAt:string, updatedAt:string, messages:Array}}
 */
function createSession(options = {}) {
  const sessionId = isValidSessionId(options.id) ? options.id : crypto.randomUUID();
  const title = clampTitle(options.title) || DEFAULT_TITLE;
  const timestamp = nowIso();
  const record = { sessionId, title, createdAt: timestamp, updatedAt: timestamp, messages: [] };
  writeSessionFile(sessionPath(sessionId, options.dir), record);
  return record;
}

/** Delete a session file (idempotent). @returns {boolean} whether one existed */
function deleteSession(id, options = {}) {
  if (!isValidSessionId(id)) return false;
  let file;
  try {
    file = sessionPath(id, options.dir);
    const existed = fs.existsSync(file);
    fs.rmSync(file, { force: true });
    return existed;
  } catch (error) {
    console.warn('[agent:sessions] delete failed:', error.message);
    return false;
  }
}

/**
 * Most recently updated sessions first.
 * @param {{limit?:number, dir?:string}} [options]
 */
function listSessions(options = {}) {
  const dir = sessionDir(options.dir);
  const limit = clampInt(options.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return []; // nothing persisted yet
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const record = readSession(entry.slice(0, -'.json'.length), { dir });
    if (record) records.push(summarize(record));
  }
  records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return records.slice(0, limit);
}

/**
 * Append one completed turn (user message + assistant reply) and persist
 * atomically. Best-effort: returns null (warned) when persistence failed.
 * @param {string} id
 * @param {{user?:object, assistant?:object, dir?:string}} turn
 */
function appendTurn(id, turn = {}) {
  const record = readSession(id, { dir: turn.dir });
  if (!record) {
    console.warn(`[agent:sessions] cannot append to unknown session ${id}`);
    return null;
  }
  const isFirstTurn = record.messages.length === 0;
  const added = [turn.user, turn.assistant].filter((message) => message && typeof message === 'object');
  for (const message of added) record.messages.push(message);
  const removed = Math.max(0, record.messages.length - MAX_MESSAGES_PER_SESSION);
  if (turn.researchState && turn.researchState.version === 1) record.researchState = turn.researchState;
  if (record.researchState) record.researchState = { ...record.researchState,
    historyStart: Math.max(0, (record.researchState.historyStart || 0) - removed) };
  if (record.messages.length > MAX_MESSAGES_PER_SESSION) {
    record.messages = record.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  // First real question names an otherwise-untitled session (explicit titles win).
  if (isFirstTurn && record.title === DEFAULT_TITLE && turn.user && typeof turn.user.content === 'string') {
    const derived = clampTitle(turn.user.content);
    if (derived) record.title = derived;
  }
  record.updatedAt = nowIso();
  writeSessionFile(sessionPath(id, turn.dir), record);
  return record;
}

// ---------------------------------------------------------------------------
// Runtime state: frame ring buffer, listeners, running-turn flag
// ---------------------------------------------------------------------------

/**
 * @typedef {{frames:Array<{id:number,frame:object}>, nextId:number,
 *            listeners:Set<Function>, active:boolean}} Runtime
 */
const RUNTIMES = new Map();

function runtime(id) {
  let state = RUNTIMES.get(id);
  if (!state) {
    state = { frames: [], nextId: 1, listeners: new Set(), active: false };
    RUNTIMES.set(id, state);
  }
  return state;
}

/**
 * Assign the next frame id for a session, buffer the frame in the ring and fan
 * it out to every live listener.
 * @param {string} id
 * @param {object} frame  SSE payload (the JSON written after `data:`)
 * @returns {{id:number, frame:object}|null}
 */
function publish(id, frame) {
  if (!isValidSessionId(id)) return null;
  const state = runtime(id);
  const buffered = { id: state.nextId, frame };
  state.nextId += 1;
  state.frames.push(buffered);
  const depth = bufferSize();
  if (state.frames.length > depth) state.frames.splice(0, state.frames.length - depth);
  for (const listener of [...state.listeners]) {
    try {
      listener(buffered.id, buffered.frame);
    } catch (error) {
      console.warn('[agent:sessions] listener failed:', error.message);
      state.listeners.delete(listener);
    }
  }
  return buffered;
}

/** Buffered frames with `id > afterId` (oldest first) — the resume replay. */
function replay(id, afterId) {
  const state = RUNTIMES.get(id);
  if (!state) return [];
  const from = Number.isFinite(afterId) ? afterId : 0;
  return state.frames.filter((entry) => entry.id > from);
}

/** Last buffered frame, or null — lets a resuming client skip waiting. */
function lastBufferedFrame(id) {
  const state = RUNTIMES.get(id);
  if (!state || state.frames.length === 0) return null;
  return state.frames[state.frames.length - 1];
}

/** Highest frame id ever issued for a session (0 when none). */
function lastEventId(id) {
  const state = RUNTIMES.get(id);
  return state ? state.nextId - 1 : 0;
}

/** Subscribe to frames published for a session. @returns {() => void} unsubscribe */
function subscribe(id, listener) {
  const state = runtime(id);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/**
 * Claim the session's single turn slot.
 * @returns {boolean} false when a turn is already running (HTTP 409 upstream)
 */
function beginTurn(id) {
  const state = runtime(id);
  if (state.active) return false;
  state.active = true;
  return true;
}

function endTurn(id) {
  const state = RUNTIMES.get(id);
  if (state) state.active = false;
}

function isTurnActive(id) {
  const state = RUNTIMES.get(id);
  return Boolean(state && state.active);
}

/** Number of turns already persisted (0-based index of the NEXT turn). */
function turnCount(id, options = {}) {
  const record = readSession(id, options);
  return record ? countTurns(record.messages) : 0;
}

/** Drop in-memory state (tests, and after a session is deleted). */
function resetRuntime(id) {
  if (id === undefined) RUNTIMES.clear();
  else RUNTIMES.delete(id);
}

module.exports = {
  DEFAULT_TITLE,
  DEFAULT_SESSION_DIR,
  DEFAULT_BUFFER_SIZE,
  MAX_MESSAGES_PER_SESSION,
  defaultSessionDir,
  sessionDir,
  bufferSize,
  isValidSessionId,
  sessionPath,
  createSession,
  readSession,
  listSessions,
  deleteSession,
  appendTurn,
  countTurns,
  summarize,
  publish,
  replay,
  lastBufferedFrame,
  lastEventId,
  subscribe,
  beginTurn,
  endTurn,
  isTurnActive,
  turnCount,
  resetRuntime,
};
