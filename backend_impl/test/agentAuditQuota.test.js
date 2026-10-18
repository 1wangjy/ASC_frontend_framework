/**
 * Audit persistence (NDJSON trail) and per-turn quota enforcement in the loop.
 * Offline: the LLM is a scripted stub and `fetch` is stubbed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const audit = require('../src/agent/audit');
const policy = require('../src/agent/policy');
const { runAgent } = require('../src/agent/loop');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

test('audit file defaults to backend_impl/data/agent/audit-YYYY-MM-DD.jsonl', () => {
  const expectedDir = path.join(__dirname, '..', 'data', 'agent');
  assert.equal(audit.defaultAuditDir(), expectedDir);
  assert.equal(audit.auditDir(), expectedDir, 'no AGENT_AUDIT_DIR configured → default');
  assert.equal(audit.auditDir('/tmp/other'), path.resolve('/tmp/other'));
  assert.equal(audit.auditFileName(new Date('2026-09-17T23:59:59Z')), 'audit-2026-09-17.jsonl');
  assert.equal(
    audit.auditFilePath(new Date('2026-09-17T10:00:00Z'), expectedDir),
    path.join(expectedDir, 'audit-2026-09-17.jsonl')
  );
});

test('auditCall appends one bounded NDJSON line, creating the directory lazily', (t) => {
  const base = tmpDir(t);
  const dir = path.join(base, 'nested', 'agent'); // must not exist yet
  assert.equal(fs.existsSync(dir), false);
  const log = t.mock.method(console, 'log', () => {});

  policy.auditCall({
    name: 'predict',
    argsSummary: { rows: 2, cols: 51, conditions: ['1500℃'] },
    ok: true,
    ms: 42,
    sessionId: 'sess-1',
    auditDir: dir,
  });
  policy.auditCall({ name: 'web_browse', argsSummary: { url: 'https://example.com/x' }, ok: false, ms: 3, error: 'blocked', auditDir: dir });

  const file = path.join(dir, audit.auditFileName());
  assert.equal(fs.existsSync(file), true, 'the audit directory is created on first write');
  assert.match(path.basename(file), /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/);

  const lines = readLines(file);
  assert.equal(lines.length, 2);
  assert.deepEqual(Object.keys(lines[0]).sort(), ['argsSummary', 'ms', 'ok', 'sessionId', 'tool', 'ts']);
  assert.equal(lines[0].tool, 'predict');
  assert.equal(lines[0].ok, true);
  assert.equal(lines[0].ms, 42);
  assert.equal(lines[0].sessionId, 'sess-1');
  assert.deepEqual(lines[0].argsSummary, { rows: 2, cols: 51, conditions: ['1500℃'] });
  assert.match(lines[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(lines[1].tool, 'web_browse');
  assert.equal(lines[1].ok, false);
  assert.equal(lines[1].error, 'blocked');
  assert.equal('sessionId' in lines[1], false);

  // Summary-only: the trail never carries bulk payloads.
  const raw = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(raw, /"X_comp"|"nodes"|"content"/);
  assert.equal(log.mock.callCount(), 2, 'each call is still echoed to stdout');
});

test('auditCall honours AGENT_AUDIT_DIR and never throws on an unwritable target', (t) => {
  const dir = tmpDir(t);
  const previous = process.env.AGENT_AUDIT_DIR;
  process.env.AGENT_AUDIT_DIR = dir;
  t.mock.method(console, 'log', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_AUDIT_DIR;
    else process.env.AGENT_AUDIT_DIR = previous;
  });

  policy.auditCall({ name: 'kg_list', argsSummary: {}, ok: true, ms: 1 });
  const file = path.join(dir, audit.auditFileName());
  assert.equal(fs.existsSync(file), true, 'AGENT_AUDIT_DIR is picked up from the environment');
  assert.equal(readLines(file)[0].tool, 'kg_list');

  // A path that cannot be a directory: the turn must survive the failed write.
  policy.auditCall({ name: 'kg_list', argsSummary: {}, ok: true, ms: 1, auditDir: path.join(file, 'nope') });
  assert.ok(warn.mock.callCount() >= 1);
});

// ---------------------------------------------------------------------------
// Quota enforcement in the loop
// ---------------------------------------------------------------------------

/** Provider that replays a script of assistant messages, recording the prompts. */
function scriptedProvider(script) {
  const prompts = [];
  let turn = 0;
  return {
    available: true,
    prompts,
    async streamChat({ messages, onDelta }) {
      prompts.push(messages);
      const message = script[Math.min(turn, script.length - 1)];
      turn += 1;
      if (message.content) onDelta(message.content);
      return { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls || [] };
    },
  };
}

function toolCalls(...names) {
  return names.map((name, i) => ({
    id: `c${i}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(name === 'kg_list' ? { limit: 1 } : { graph_id: 'g1' }) },
  }));
}

function stubKgFetch(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ success: true, data: [], count: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

async function run(provider, options, emit) {
  await runAgent({
    messages: [{ role: 'user', content: 'hi' }],
    options,
    emit,
    provider,
  });
  return emit.frames;
}

function collector() {
  const frames = [];
  const emit = (frame) => frames.push(frame);
  emit.frames = frames;
  return emit;
}

test('loop stops executing tools once the per-turn tool budget is spent', async (t) => {
  stubKgFetch(t);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const dir = tmpDir(t);
  const previous = process.env.AGENT_AUDIT_DIR;
  process.env.AGENT_AUDIT_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_AUDIT_DIR;
    else process.env.AGENT_AUDIT_DIR = previous;
  });

  const provider = scriptedProvider([
    { content: '', tool_calls: toolCalls('kg_list', 'kg_list', 'kg_list') },
    { content: 'done', tool_calls: [] },
  ]);
  const frames = await run(provider, { maxTools: 2, sessionId: 'sess-quota' }, collector());

  const results = frames.filter((frame) => frame.type === 'tool_result');
  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, true);
  assert.equal(results[2].ok, false, 'the third call exceeds maxTools=2');
  assert.deepEqual(results[2].data.quota_exceeded, true);
  assert.match(results[2].summary, /已达上限（2 次）/);

  const final = frames.find((frame) => frame.type === 'final');
  assert.match(final.text, /done/);
  assert.equal(frames.at(-1).type, 'done');
  assert.equal(provider.prompts.length, 2, 'one tool-free completion is reserved after the quota is hit');

  const lines = readLines(path.join(dir, audit.auditFileName()));
  assert.equal(lines.length, 3);
  assert.equal(lines[2].ok, false);
  assert.equal(lines[2].sessionId, 'sess-quota');
  assert.match(lines[2].error, /quota: maxTools=2/);
});

test('loop caps expensive recipe_optimize calls per turn without crashing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ ok: true, algorithm: 'nsga2', iterations: 5, best_objective: [1] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  ));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});

  const provider = scriptedProvider([
    { content: '', tool_calls: toolCalls('recipe_optimize', 'recipe_optimize') },
    { content: 'done', tool_calls: [] },
  ]);
  const frames = await run(provider, { maxOptimize: 1 }, collector());

  const results = frames.filter((frame) => frame.type === 'tool_result');
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].summary, /recipe_optimize 本回合最多调用 1 次/);
  assert.equal(frames.at(-1).type, 'done');
});

test('loop bounds the number of steps and never runs more than maxSteps', async (t) => {
  stubKgFetch(t);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});

  const provider = scriptedProvider([{ content: '', tool_calls: toolCalls('kg_list') }]);
  const frames = await run(provider, { maxSteps: 2 }, collector());

  assert.equal(provider.prompts.length, 2);
  assert.equal(frames.filter((frame) => frame.type === 'tool_call').length, 1);
  const done = frames.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.steps, 2);
  assert.equal(frames.find((frame) => frame.type === 'final').answer_check.status, 'incomplete');
});

test('quota options cannot exceed the AGENT_RECIPE_OPT_MAX_CALLS hard cap', () => {
  const previous = process.env.AGENT_RECIPE_OPT_MAX_CALLS;
  process.env.AGENT_RECIPE_OPT_MAX_CALLS = '1';
  try {
    assert.equal(policy.resolveQuota({ maxOptimize: 4 }).maxOptimize, 1);
    assert.equal(policy.resolveQuota({}).maxOptimize, 1);
  } finally {
    if (previous === undefined) delete process.env.AGENT_RECIPE_OPT_MAX_CALLS;
    else process.env.AGENT_RECIPE_OPT_MAX_CALLS = previous;
  }
});
