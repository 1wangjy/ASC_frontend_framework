'use strict';

/**
 * audit.js — durable, append-only audit trail for agent tool calls.
 *
 * One NDJSON line per tool call, written to
 *   ${AGENT_AUDIT_DIR || backend_impl/data/agent}/audit-YYYY-MM-DD.jsonl
 * (`backend_impl/data` is already gitignored; the directory is created lazily
 * on the first write, so no setup step is required).
 *
 * Line shape (summary only — never tool payloads, never private data):
 *   { ts, tool, argsSummary, ok, ms, sessionId?, error? }
 *
 * Writing is best-effort by design: a read-only or full disk must degrade the
 * audit trail, never break an agent turn.
 */

const fs = require('node:fs');
const path = require('node:path');

/** `backend_impl/data/agent` — inside the gitignored data directory. */
const DEFAULT_AUDIT_DIR = path.join(__dirname, '..', '..', 'data', 'agent');

function defaultAuditDir() {
  return DEFAULT_AUDIT_DIR;
}

/** Resolve the audit directory: explicit override > AGENT_AUDIT_DIR > default. */
function auditDir(override) {
  const raw = override !== undefined && override !== null ? override : process.env.AGENT_AUDIT_DIR;
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? path.resolve(value) : DEFAULT_AUDIT_DIR;
}

/** `audit-YYYY-MM-DD.jsonl` for the given day (UTC, matching the `ts` field). */
function auditFileName(date) {
  const when = date instanceof Date ? date : new Date(date === undefined ? Date.now() : date);
  return `audit-${when.toISOString().slice(0, 10)}.jsonl`;
}

/** Absolute path of the audit file for a day. */
function auditFilePath(date, dirOverride) {
  return path.join(auditDir(dirOverride), auditFileName(date));
}

/**
 * Append one JSON line. Returns the file path, or null when the write failed
 * (logged as a warning — callers must keep going).
 * @param {object} entry
 * @param {{dir?:string, date?:Date}} [options]
 */
function appendAuditLine(entry, options = {}) {
  const dir = auditDir(options.dir);
  const file = path.join(dir, auditFileName(options.date));
  let line;
  try {
    line = JSON.stringify(entry);
  } catch (error) {
    console.warn('[agent:audit] entry not serialisable:', error.message);
    return null;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
    return file;
  } catch (error) {
    console.warn('[agent:audit] write failed:', error.message);
    return null;
  }
}

module.exports = {
  defaultAuditDir,
  auditDir,
  auditFileName,
  auditFilePath,
  appendAuditLine,
};
