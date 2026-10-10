/**
 * T11 — SSE robustness, plus the /api/agent/metrics integration check.
 *
 * Covers: `id:` framing + monotonic sequence, the turn-level timeout (a tool
 * that ignores its AbortSignal must not be able to hang the turn), resume
 * replay from the in-memory ring buffer (including trimming), live resume of a
 * running turn, and metrics recorded from a real stream.
 *
 * Offline: express on an ephemeral port, scripted providers, stubbed fetch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const express = require('express');
const { createRouter, HEARTBEAT_MS, heartbeatMs } = require('../src/agent/route');
const sessions = require('../src/agent/sessions');
const metrics = require('../src/agent/metrics');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sse-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

/**
 * Agent module on an ephemeral port, with an injected provider and temp
 * storage. The KG service is pointed at a fake host so the stubbed `fetch`
 * below can be told apart from the test's own HTTP calls.
 */
async function startAgent(t, options = {}) {
  withEnv(t, 'AGENT_KG_BASE_URL', 'https://kg.test');
  const previous = {
    sessions: process.env.AGENT_SESSION_DIR,
    audit: process.env.AGENT_AUDIT_DIR,
  };
  process.env.AGENT_SESSION_DIR = tmpDir(t);
  process.env.AGENT_AUDIT_DIR = tmpDir(t);
  t.after(() => {
    for (const [key, value] of [['AGENT_SESSION_DIR', previous.sessions], ['AGENT_AUDIT_DIR', previous.audit]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  sessions.resetRuntime();
  metrics.reset();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/agent', createRouter({ provider: options.provider }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  }));

  const base = `http://127.0.0.1:${server.address().port}/api/agent`;
  return {
    base,
    createSession: async () => (await (await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).json()),
  };
}

/** `id: <n>` + `data: {...}` pairs; `: comment` keep-alives are collected too. */
function createSseParser() {
  const frames = [];
  const comments = [];
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingId = null;
  return {
    frames,
    comments,
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('id:')) {
          pendingId = Number(line.slice(3).trim());
        } else if (line.startsWith('data:')) {
          frames.push({ id: pendingId, frame: JSON.parse(line.slice(5).trim()) });
        } else if (line.startsWith(':')) {
          comments.push(line);
        }
      }
    },
  };
}

/** POST /stream and collect every frame until the server ends the response. */
async function postStream(url, body) {
  const response = await fetch(`${url}/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: response.status, body: await response.json(), frames: [] };
  const parser = createSseParser();
  for await (const chunk of response.body) parser.push(chunk);
  return { status: response.status, frames: parser.frames };
}

/** POST /stream without waiting: the caller decides when the turn may finish. */
function openStream(url, body) {
  const parser = createSseParser();
  const started = fetch(`${url}/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const done = (async () => {
    try {
      const response = await started;
      if (!response.ok) return { status: response.status, body: await response.json() };
      for await (const chunk of response.body) parser.push(chunk);
      return { status: response.status };
    } catch (error) {
      return { error: error.message };
    }
  })();
  return { frames: parser.frames, comments: parser.comments, done };
}

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

function scriptedProvider(script, options = {}) {
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
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls || [],
        usage: options.usage,
      };
    },
  };
}

function toolCalls(...names) {
  return names.map((name, i) => ({
    id: `c${i}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(name === 'kg_list' ? { limit: 1 } : name === 'web_browse' ? { url: 'https://example.com' } : { graph_id: 'g1' }),
    },
  }));
}

/**
 * Stub the tools' `fetch` (the KG service) while letting the test's own
 * requests to the agent server through.
 * @param {string} base       the agent server, e.g. http://127.0.0.1:34567/api/agent
 * @param {Function} [handler] replaces the "empty KG" default
 */
function stubKgFetch(t, base, handler) {
  const realFetch = globalThis.fetch;
  const kgResponse = async () => new Response(
    JSON.stringify({ success: true, data: [], count: 0 }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith(base)) return realFetch(url, init);
    return (handler || kgResponse)(url, init);
  });
}

/** A KG fetch that blocks until `release()` — a tool that must be waited out. */
function gatedKgFetch() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    release,
    handler: async () => {
      await gate;
      return new Response(JSON.stringify({ success: true, data: [], count: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
}

const USER = { role: 'user', content: '列出可用图谱' };

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------

test('every SSE frame carries a monotonic `id:` and the stream ends with done', async (t) => {
  const { base, createSession } = await startAgent(t, {
    provider: scriptedProvider([
      { content: '', tool_calls: toolCalls('kg_list') },
      { content: '共 0 个图谱', tool_calls: [] },
    ]),
  });
  stubKgFetch(t, base);
  const { sessionId } = await createSession();

  const { status, frames } = await postStream(base, { messages: [USER], sessionId });
  assert.equal(status, 200);
  assert.ok(frames.length >= 4);
  assert.deepEqual(frames.map((entry) => entry.id), frames.map((_, i) => i + 1), 'ids start at 1 and increment');
  assert.deepEqual(frames.map((entry) => entry.frame.type), [
    'turn_started', 'model_status', 'model_status',
    'tool_call',
    'tool_result',
    'model_status', 'model_status',
    'message_delta',
    'final',
    'done',
  ]);
  assert.equal(frames.at(-1).frame.type, 'done');
  assert.equal(frames.at(-1).frame.sessionId, sessionId);
  assert.equal(frames.at(-1).frame.turnIndex, 0, 'turnIndex is the 0-based index of the turn');
  assert.equal(typeof frames.find(entry => entry.frame.type === 'tool_result').frame.ms, 'number', 'tool_result reports its duration');
  assert.equal(frames.at(-1).frame.timing.schema, 'agent.timing.v1');
  assert.equal(HEARTBEAT_MS, 15000, 'the keep-alive contract is 15s');
  assert.equal(heartbeatMs({}), 15000);
});

test('a long tool call keeps the stream alive with `: ping` comments', async (t) => {
  withEnv(t, 'AGENT_SSE_HEARTBEAT_MS', '120');
  const gated = gatedKgFetch();
  const { base, createSession } = await startAgent(t, {
    provider: scriptedProvider([
      { content: '', tool_calls: toolCalls('kg_list') },
      { content: '好', tool_calls: [] },
    ]),
  });
  stubKgFetch(t, base, gated.handler);
  const { sessionId } = await createSession();

  const live = openStream(base, { messages: [USER], sessionId });
  assert.equal(await waitFor(() => live.frames.length > 0), true, 'the tool call is in flight');
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(
    live.comments.includes(': ping'),
    `heartbeats flow while the tool runs (got ${JSON.stringify(live.comments)})`
  );
  gated.release();
  const result = await live.done;
  assert.equal(result.error, undefined);
  assert.equal(live.frames.at(-1).frame.type, 'done');
});

test('HTTP errors are plain JSON, never a half-open stream', async (t) => {
  const { base } = await startAgent(t, { provider: scriptedProvider([{ content: 'hi', tool_calls: [] }]) });

  const noMessages = await postStream(base, {});
  assert.equal(noMessages.status, 400);

  const unknown = await postStream(base, { messages: [USER], sessionId: 'does-not-exist' });
  assert.equal(unknown.status, 404);
  assert.match(unknown.body.message, /unknown sessionId/);

  const badResume = await postStream(base, { messages: [USER], resumeFromEventId: 1 });
  assert.equal(badResume.status, 400);
  assert.match(badResume.body.message, /requires sessionId/);
});

// ---------------------------------------------------------------------------
// Turn timeout
// ---------------------------------------------------------------------------

test('turn timeout emits error{turn_timeout} then done and stops calling tools', async (t) => {
  withEnv(t, 'AGENT_TURN_TIMEOUT_MS', '150');
  const provider = scriptedProvider([
    { content: '', tool_calls: toolCalls('kg_list') },
    { content: '不该走到这里', tool_calls: [] },
  ]);
  const { base, createSession } = await startAgent(t, { provider });
  // A tool call that ignores its AbortSignal entirely: the turn must still end.
  stubKgFetch(t, base, () => new Promise(() => {}));
  const { sessionId } = await createSession();

  const started = Date.now();
  const { frames } = await postStream(base, { messages: [USER], sessionId });
  const elapsed = Date.now() - started;

  const error = frames.find((entry) => entry.frame.type === 'error');
  assert.ok(error, 'the timeout is reported to the client');
  assert.equal(error.frame.code, 'turn_timeout');
  assert.match(error.frame.message, /超时/);
  assert.equal(frames.at(-1).frame.type, 'done');
  assert.equal(frames.filter((entry) => entry.frame.type === 'tool_call').length, 1, 'no tool is called after the timeout');
  assert.equal(provider.prompts.length, 1, 'no further LLM step after the timeout');
  assert.ok(elapsed < 5000, `the turn ended promptly (${elapsed} ms)`);

  // The abandoned tool call is bounded too: resume replays through `done`.
  const replay = await postStream(base, { sessionId, resumeFromEventId: 0 });
  assert.equal(replay.frames.at(-1).frame.type, 'done');
  const session = await (await fetch(`${base}/sessions/${sessionId}`)).json();
  assert.equal(session.messages.length, 2, 'the timed-out turn is still persisted');
  assert.equal(session.messages[1].error.code, 'turn_timeout');
  assert.equal(sessions.isTurnActive(sessionId), false, 'the turn slot is released');
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

test('resume replays only the frames after resumeFromEventId and then ends', async (t) => {
  withEnv(t, 'AGENT_SSE_BUFFER', '3');
  const { base, createSession } = await startAgent(t, {
    provider: scriptedProvider([
      { content: '', tool_calls: toolCalls('kg_list') },
      { content: '共 0 个图谱', tool_calls: [] },
    ]),
  });
  stubKgFetch(t, base);
  const { sessionId } = await createSession();

  const first = await postStream(base, { messages: [USER], sessionId });
  const lastId = first.frames.at(-1).id;
  assert.ok(first.frames.length > 3, 'the turn produced more frames than the buffer holds');

  const all = await postStream(base, { sessionId, resumeFromEventId: 0 });
  assert.deepEqual(
    all.frames.map((entry) => entry.id),
    [lastId - 2, lastId - 1, lastId],
    'only the last AGENT_SSE_BUFFER=3 frames survive, with their original ids'
  );
  assert.equal(all.frames.at(-1).frame.type, 'done');

  const tail = await postStream(base, { sessionId, resumeFromEventId: lastId - 1 });
  assert.deepEqual(tail.frames.map((entry) => entry.id), [lastId]);

  const nothing = await postStream(base, { sessionId, resumeFromEventId: lastId });
  assert.deepEqual(nothing.frames, [], 'resuming at the head of the buffer replays nothing');

  // Replaying never re-buffers or duplicates the turn.
  const session = await (await fetch(`${base}/sessions/${sessionId}`)).json();
  assert.equal(session.messages.length, 2);
});

test('resume follows a still-running turn to its done frame without starting another', async (t) => {
  const gated = gatedKgFetch();
  const provider = scriptedProvider([
    { content: '', tool_calls: toolCalls('kg_list') },
    { content: '共 0 个图谱', tool_calls: [] },
  ]);
  const { base, createSession } = await startAgent(t, { provider });
  stubKgFetch(t, base, gated.handler);
  const { sessionId } = await createSession();

  const live = openStream(base, { messages: [USER], sessionId });
  assert.equal(await waitFor(() => sessions.replay(sessionId, 0).length > 0), true, 'the turn is in flight');

  // A reconnecting client sends the same body again, plus resumeFromEventId.
  const resumed = openStream(base, { messages: [USER], sessionId, resumeFromEventId: 0 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  gated.release();

  const [liveResult, resumedResult] = await Promise.all([live.done, resumed.done]);
  assert.equal(liveResult.error, undefined);
  assert.equal(resumedResult.error, undefined);
  assert.equal(resumed.frames.at(-1).frame.type, 'done');
  assert.deepEqual(
    resumed.frames.map((entry) => entry.frame.type),
    ['turn_started', 'model_status', 'model_status', 'tool_call', 'tool_result',
      'model_status', 'model_status', 'message_delta', 'final', 'done'],
    'replayed frames precede the live ones'
  );
  assert.deepEqual(resumed.frames.map((entry) => entry.id), live.frames.map(entry => entry.id));
  assert.deepEqual(resumed.frames.at(-1).frame.timing, live.frames.at(-1).frame.timing);
  assert.equal(provider.prompts.length, 2, 'the resume request started no second turn');

  const session = await (await fetch(`${base}/sessions/${sessionId}`)).json();
  assert.equal(session.messages.length, 2, 'the turn is appended exactly once');
  assert.deepEqual(session.messages[1].timing, live.frames.at(-1).frame.timing);
});

test('a second concurrent turn on one session is refused with 409', async (t) => {
  const gated = gatedKgFetch();
  const { base, createSession } = await startAgent(t, {
    provider: scriptedProvider([
      { content: '', tool_calls: toolCalls('kg_list') },
      { content: '完成', tool_calls: [] },
    ]),
  });
  stubKgFetch(t, base, gated.handler);
  const { sessionId } = await createSession();

  const live = openStream(base, { messages: [USER], sessionId });
  assert.equal(await waitFor(() => sessions.isTurnActive(sessionId)), true);
  const conflict = await postStream(base, { messages: [USER], sessionId });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 409);

  gated.release();
  await live.done;
  assert.equal(sessions.isTurnActive(sessionId), false, 'the slot frees up again');
  const after = await postStream(base, { messages: [{ role: 'user', content: '再来一次' }], sessionId });
  assert.equal(after.status, 200);
  assert.equal(after.frames.at(-1).frame.turnIndex, 1);
});

// ---------------------------------------------------------------------------
// Metrics integration
// ---------------------------------------------------------------------------

test('GET /metrics aggregates the turns that actually streamed', async (t) => {
  const provider = scriptedProvider(
    [
      { content: '', tool_calls: toolCalls('kg_list', 'rm_rf') },
      { content: '完成了', tool_calls: [] },
    ],
    { usage: { prompt: 12, completion: 4, total: 16, reported: true } }
  );
  const { base, createSession } = await startAgent(t, { provider });
  stubKgFetch(t, base);
  const { sessionId } = await createSession();

  await postStream(base, { messages: [USER], sessionId });
  const snapshot = await (await fetch(`${base}/metrics`)).json();

  assert.equal(snapshot.turns, 1);
  assert.equal(snapshot.toolCalls, 2);
  assert.equal(snapshot.toolErrors, 1, 'the unknown tool is a tool error');
  assert.deepEqual(snapshot.tokens, { prompt: 24, completion: 8, total: 32, reported: true });
  assert.equal(snapshot.tools.kg_list.calls, 1);
  assert.equal(snapshot.tools.kg_list.errors, 0);
  assert.equal(snapshot.tools.rm_rf.calls, 1);
  assert.equal(snapshot.tools.rm_rf.errors, 1);
  assert.ok(snapshot.avgTurnMs >= 0);
});
