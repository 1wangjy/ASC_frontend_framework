/**
 * T3 — session persistence.
 *
 * Covers the on-disk store (atomic writes, turn append, summary/list shape,
 * unsafe ids, degraded persistence) plus the /api/agent/sessions HTTP routes.
 * Offline: temp directories only, no network, no LLM.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const express = require('express');
const sessions = require('../src/agent/sessions');
const { createRouter } = require('../src/agent/route');

function tmpDir(t, prefix = 'agent-sessions-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Point AGENT_SESSION_DIR at `dir` for the duration of one test. */
function withSessionDir(t, dir) {
  const previous = process.env.AGENT_SESSION_DIR;
  process.env.AGENT_SESSION_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_SESSION_DIR;
    else process.env.AGENT_SESSION_DIR = previous;
  });
}

function withEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen(t, app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise((done) => {
        server.closeAllConnections?.();
        server.close(() => done());
      }));
      resolve(server);
    });
  });
}

function agentApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/agent', createRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

test('createSession writes one JSON file under AGENT_SESSION_DIR, atomically', (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);

  const record = sessions.createSession({ title: '配方问答' });
  const file = path.join(dir, `${record.sessionId}.json`);
  assert.equal(sessions.sessionDir(), dir, 'AGENT_SESSION_DIR wins over the default');
  assert.match(record.sessionId, /^[0-9a-f-]{36}$/, 'session ids are random UUIDs');

  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(onDisk, {
    sessionId: record.sessionId,
    title: '配方问答',
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    messages: [],
  });
  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')),
    [],
    'the tmp file is renamed away, never left behind'
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'session files are owner-only');

  assert.equal(sessions.createSession().title, '新会话', 'untitled sessions get the default title');
  assert.equal(sessions.readSession('nope'), null);
});

test('appendTurn persists the user and assistant messages and derives `turns`', (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);
  const { sessionId } = sessions.createSession();

  const assistant = {
    role: 'assistant',
    content: '约 55%',
    toolCalls: [{ name: 'kg_search', argsSummary: { query: '莫来石' }, ok: true, ms: 120 }],
  };
  sessions.appendTurn(sessionId, {
    user: { role: 'user', content: '1500℃ 下莫来石含量？' },
    assistant,
  });

  const record = sessions.readSession(sessionId);
  assert.equal(record.messages.length, 2);
  assert.equal(record.messages[0].role, 'user');
  assert.deepEqual(record.messages[1], assistant);
  assert.equal(sessions.countTurns(record.messages), 1);
  assert.equal(sessions.turnCount(sessionId), 1, 'the next turn is index 1 (0-based)');
  assert.equal(record.title, '1500℃ 下莫来石含量？', 'the first question names an untouched session');
  assert.notEqual(record.updatedAt, undefined);

  // Persisted, not just in memory.
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, `${sessionId}.json`), 'utf8'));
  assert.deepEqual(onDisk.messages, record.messages);
  assert.equal(onDisk.title, record.title);
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), []);

  // An explicit title is never overwritten by the first message.
  const titled = sessions.createSession({ title: '我起的名字' });
  sessions.appendTurn(titled.sessionId, {
    user: { role: 'user', content: '别覆盖我' },
    assistant: { role: 'assistant', content: '好的' },
  });
  assert.equal(sessions.readSession(titled.sessionId).title, '我起的名字');
});

test('listSessions returns newest-first summaries and honours the limit', async (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);

  const first = sessions.createSession({ title: 'first' });
  await sleep(5);
  const second = sessions.createSession({ title: 'second' });
  await sleep(5);
  sessions.appendTurn(first.sessionId, {
    user: { role: 'user', content: '问题' },
    assistant: { role: 'assistant', content: '答案' },
  });

  const list = sessions.listSessions();
  assert.deepEqual(list.map((entry) => entry.sessionId), [first.sessionId, second.sessionId]);
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'sessionId', 'title', 'turns', 'updatedAt']);
  assert.equal(list[0].turns, 1);
  assert.equal(list[1].turns, 0);
  assert.equal(sessions.listSessions({ limit: 1 }).length, 1);
  assert.equal(sessions.listSessions({ limit: 0 })[0].sessionId, first.sessionId, 'limit is clamped to >= 1');
  assert.deepEqual(sessions.listSessions({ dir: tmpDir(t) }), [], 'an empty directory lists nothing');
});

test('deleteSession is idempotent and unsafe ids never reach the filesystem', (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);
  const { sessionId } = sessions.createSession();
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'not a session');

  assert.equal(sessions.deleteSession(sessionId), true);
  assert.equal(sessions.readSession(sessionId), null);
  assert.equal(sessions.deleteSession(sessionId), false, 'deleting twice is not an error');
  assert.equal(sessions.deleteSession('../secret'), false);
  assert.equal(sessions.deleteSession('secret'), false);
  assert.equal(sessions.isValidSessionId('sess-1_ok'), true);
  assert.equal(sessions.isValidSessionId('../etc/passwd'), false);
  assert.equal(sessions.isValidSessionId(''), false);
  assert.throws(() => sessions.sessionPath('../../etc/passwd'), /invalid sessionId/);
  assert.equal(sessions.readSession('secret.txt'), null);
});

test('a corrupt or unwritable session store only warns — never throws', (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);
  const warn = t.mock.method(console, 'warn', () => {});
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');

  assert.equal(sessions.readSession('broken'), null);
  assert.deepEqual(sessions.listSessions(), []);
  assert.ok(warn.mock.callCount() >= 1, 'the corrupt file is reported, not swallowed silently');

  // A session directory that cannot exist: every write degrades to a warning.
  const base = tmpDir(t);
  const blocker = path.join(base, 'blocker');
  fs.writeFileSync(blocker, 'plain file');
  process.env.AGENT_SESSION_DIR = path.join(blocker, 'nested');
  assert.doesNotThrow(() => sessions.createSession({ title: 'doomed' }));
  assert.equal(sessions.appendTurn('doomed', { user: { role: 'user', content: 'x' } }), null);
  assert.equal(sessions.readSession('doomed'), null);
});

// ---------------------------------------------------------------------------
// Runtime state (resume buffer + turn slot)
// ---------------------------------------------------------------------------

test('the ring buffer keeps the last AGENT_SSE_BUFFER frames and fans them out', (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);
  withEnv(t, 'AGENT_SSE_BUFFER', '3');
  sessions.resetRuntime();
  const { sessionId } = sessions.createSession();
  assert.equal(sessions.bufferSize(), 3);

  for (const text of ['a', 'b', 'c', 'd']) sessions.publish(sessionId, { type: 'message_delta', text });

  assert.deepEqual(sessions.replay(sessionId, 0).map((entry) => entry.frame.text), ['b', 'c', 'd']);
  assert.deepEqual(sessions.replay(sessionId, 0).map((entry) => entry.id), [2, 3, 4], 'ids keep counting');
  assert.deepEqual(sessions.replay(sessionId, 3).map((entry) => entry.frame.text), ['d']);
  assert.deepEqual(sessions.replay(sessionId, 4), []);
  assert.equal(sessions.lastEventId(sessionId), 4);
  assert.equal(sessions.lastBufferedFrame(sessionId).frame.text, 'd');

  const seen = [];
  const off = sessions.subscribe(sessionId, (id, frame) => seen.push([id, frame.text]));
  sessions.publish(sessionId, { type: 'final', text: 'e' });
  off();
  sessions.publish(sessionId, { type: 'done', steps: 1 });
  assert.deepEqual(seen, [[5, 'e']], 'unsubscribed listeners stop receiving');

  assert.equal(sessions.publish('not a valid id!', { type: 'done' }), null);
  assert.deepEqual(sessions.replay('never-seen', 0), []);
  sessions.resetRuntime(sessionId);
  assert.deepEqual(sessions.replay(sessionId, 0), []);
});

test('the turn slot is single-occupancy per session', () => {
  sessions.resetRuntime();
  const id = 'turn-slot';
  assert.equal(sessions.isTurnActive(id), false);
  assert.equal(sessions.beginTurn(id), true);
  assert.equal(sessions.beginTurn(id), false, 'a second concurrent turn is refused');
  sessions.endTurn(id);
  assert.equal(sessions.isTurnActive(id), false);
  assert.equal(sessions.beginTurn(id), true);
  sessions.resetRuntime(id);
});

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

test('the session routes create, list, read and delete a session', async (t) => {
  const dir = tmpDir(t);
  withSessionDir(t, dir);
  const server = await listen(t, agentApp());
  const base = `http://127.0.0.1:${server.address().port}/api/agent`;

  const created = await fetch(`${base}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '会话 A' }),
  });
  assert.equal(created.status, 200);
  const session = await created.json();
  assert.deepEqual(Object.keys(session).sort(), ['createdAt', 'sessionId', 'title']);

  sessions.appendTurn(session.sessionId, {
    user: { role: 'user', content: '莫来石含量？' },
    assistant: { role: 'assistant', content: '约 55%', toolCalls: [{ name: 'kg_search', argsSummary: {}, ok: true, ms: 12 }] },
  });

  const list = await (await fetch(`${base}/sessions?limit=20`)).json();
  assert.equal(Array.isArray(list), true);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'sessionId', 'title', 'turns', 'updatedAt']);
  assert.equal(list[0].turns, 1);

  const detail = await (await fetch(`${base}/sessions/${session.sessionId}`)).json();
  assert.equal(detail.sessionId, session.sessionId);
  assert.equal(detail.title, '会话 A');
  assert.equal(detail.messages.length, 2);
  assert.deepEqual(detail.messages.map((message) => message.role), ['user', 'assistant']);
  assert.equal(detail.messages[1].toolCalls[0].name, 'kg_search');

  const missing = await fetch(`${base}/sessions/deadbeef`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 404);
  const unsafe = await fetch(`${base}/sessions/${encodeURIComponent('../secret')}`);
  assert.equal(unsafe.status, 400, 'a traversal-shaped id never reaches the filesystem');

  const deleted = await (await fetch(`${base}/sessions/${session.sessionId}`, { method: 'DELETE' })).json();
  assert.deepEqual(deleted, { ok: true, deleted: true });
  assert.equal((await (await fetch(`${base}/sessions/${session.sessionId}`, { method: 'DELETE' })).json()).deleted, false);
  assert.equal((await (await fetch(`${base}/sessions/${session.sessionId}`)).json()).code, 404);
  assert.deepEqual(await (await fetch(`${base}/sessions`)).json(), []);
});
