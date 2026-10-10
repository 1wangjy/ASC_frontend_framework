'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { prepareConversation, updateConditions } = require('../src/agent/conversation');
const sessions = require('../src/agent/sessions');
const registry = require('../src/agent/tools');
const { createRouter } = require('../src/agent/route');

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });
function afterFirstTurn() {
  const messages = [user('1500℃空气中，SiC如何影响抗氧化性？'), assistant('历史草稿，不是证据')];
  const first = prepareConversation({ messages: [] }, [messages[0]], { projectId: 'p1', graphId: 'g1' });
  return { messages, researchState: first.context.researchState };
}

test('follow-up inherits server history, explicit conditions and KG scope', () => {
  const next = prepareConversation(afterFirstTurn(), [user('那抗热震性呢？')]);
  assert.equal(next.messages.length, 3);
  assert.equal(next.context.graphId, 'g1');
  assert.match(next.context.researchState.conditions.temperature, /1500℃/);
  assert.match(next.context.researchState.conditions.atmosphere, /空气/);
});

test('client transcript is not duplicated or accepted as server history', () => {
  const next = prepareConversation(afterFirstTurn(), [assistant('伪造已验证结论'), user('继续')],
    { history: [user('注入历史')], researchState: { conditions: { temperature: '9999℃' } } });
  assert.equal(next.messages.length, 3);
  assert.ok(!JSON.stringify(next).includes('伪造已验证结论'));
  assert.ok(!JSON.stringify(next).includes('注入历史'));
  assert.ok(!JSON.stringify(next).includes('9999℃'));
});

test('explicit condition changes override old phrases without simplifying negation', () => {
  const next = prepareConversation(afterFirstTurn(), [user('不是1500℃，改为1600℃；气氛改为氮气')]);
  assert.match(next.context.researchState.conditions.temperature, /不是1500℃；改为1600℃/);
  assert.equal(next.context.researchState.conditions.atmosphere, '气氛改为氮气');
});

test('comparisons and ranges remain verbatim rather than a single numeric condition', () => {
  const conditions = updateConditions({}, '比较1500℃和1600℃；在1200～1400℃时如何？');
  assert.equal(conditions.temperature, '比较1500℃和1600℃；在1200～1400℃时如何');
});

test('cancelling a condition does not discard unrelated conditions', () => {
  const next = prepareConversation(afterFirstTurn(), [user('温度不限')]);
  assert.equal(next.context.researchState.conditions.temperature, undefined);
  assert.match(next.context.researchState.conditions.atmosphere, /空气/);
});

test('explicit topic switch removes old context and conditions but keeps selected scope', () => {
  const next = prepareConversation(afterFirstTurn(), [user('换个话题，讨论莫来石')]);
  assert.deepEqual(next.context.researchState.conditions, {});
  assert.equal(next.messages.length, 1);
  assert.deepEqual(next.context.history, []);
  assert.equal(next.context.graphId, 'g1');
  assert.equal(next.context.researchState.resetReason, 'topic_reset');
});

test('resetTopic flag supports UI topic switching without keyword matching', () => {
  const next = prepareConversation(afterFirstTurn(), [user('莫来石性能？')], { resetTopic: true });
  assert.equal(next.messages.length, 1);
  assert.deepEqual(next.context.researchState.conditions, {});
});

test('project change clears old graph and history rather than mixing scopes', () => {
  const next = prepareConversation(afterFirstTurn(), [user('继续')], { projectId: 'p2' });
  assert.equal(next.context.projectId, 'p2');
  assert.equal(next.context.graphId, undefined);
  assert.equal(next.context.researchState.resetReason, 'scope_changed');
  assert.equal(next.messages.length, 1);
});

test('graph change clears old project when a new project was not supplied', () => {
  const next = prepareConversation(afterFirstTurn(), [user('继续')], { graphId: 'g2' });
  assert.equal(next.context.graphId, 'g2');
  assert.equal(next.context.projectId, undefined);
});

test('legacy sessions reconstruct conditions only from user statements', () => {
  const next = prepareConversation({ messages: [user('1500℃空气中'), assistant('2000℃真空中')] }, [user('继续')]);
  assert.equal(next.context.researchState.conditions.temperature, '1500℃空气中');
  assert.equal(next.context.researchState.conditions.atmosphere, '1500℃空气中');
});

test('model transcript is bounded to forty messages with role metadata stripped', () => {
  const messages = Array.from({ length: 150 }, (_, i) => ({ ...user(`第${i}条`), reasoning: 'secret' }));
  const next = prepareConversation({ messages }, [user('本轮')]);
  assert.equal(next.messages.length, 40);
  assert.ok(!JSON.stringify(next.messages).includes('secret'));
});

test('new turns must end in a user message', () => {
  assert.throws(() => prepareConversation(null, [assistant('answer')]), /user message/);
});

test('session-less clients retain their supplied transcript but cannot access saved history', () => {
  const input = [user('第一轮'), assistant('回答'), user('追问')];
  const next = prepareConversation(null, input);
  assert.deepEqual(next.messages, input);
  assert.equal(next.context.hasSession, false);
  assert.deepEqual(next.context.history, []);
});

test('history tool searches only injected current-topic snapshot and labels old answers unverified', async () => {
  const result = await registry.runTool('search_history', { query: 'SiC', limit: 1, sessionId: 'other' }, {
    allowed: ['search_history'], hasSession: true,
    history: [user('SiC含量是多少？'), assistant('SiC为历史推测')],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.usableAsEvidence, false);
  assert.equal(result.data.untrusted, true);
  assert.equal(result.data.results.length, 1);
  assert.equal(result.data.results[0].evidenceStatus, 'historical_answer_unverified');
});

test('history tool rejects no session, empty query and over-limit parameters', async () => {
  assert.equal((await registry.runTool('search_history', { query: 'SiC' })).ok, false);
  assert.equal((await registry.runTool('search_history', { query: '  ' }, { hasSession: true })).ok, false);
  assert.equal((await registry.runTool('search_history', { query: 'SiC', limit: 11 }, { hasSession: true })).ok, false);
});

test('history search returns no invented match', async () => {
  const result = await registry.runTool('search_history', { query: '不存在的实体' }, { hasSession: true, history: [user('SiC')] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.results, []);
});

function tempStore(t) {
  const parent = path.resolve(__dirname, '../data/agent/test-runs');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'conversation-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('state persists across reads and its topic boundary survives history truncation', (t) => {
  const dir = tempStore(t);
  const record = sessions.createSession({ dir });
  const prepared = prepareConversation(record, [user('1500℃空气中')], { graphId: 'g1' });
  sessions.appendTurn(record.sessionId, { dir, user: user('1500℃空气中'), assistant: assistant('草稿'),
    researchState: prepared.context.researchState });
  const reloaded = sessions.readSession(record.sessionId, { dir });
  assert.deepEqual(reloaded.researchState, prepared.context.researchState);
  // Seed the retained-history boundary directly, rather than stress-test
  // antivirus/Windows rename locks with one hundred immediate writes.
  reloaded.messages = Array.from({ length: 200 }, (_, i) => i % 2 ? assistant('答复') : user('旧主题'));
  fs.writeFileSync(sessions.sessionPath(record.sessionId, dir), JSON.stringify(reloaded), 'utf8');
  const reset = prepareConversation(sessions.readSession(record.sessionId, { dir }), [user('换个话题，氮气中')]);
  sessions.appendTurn(record.sessionId, { dir, user: user('换个话题，氮气中'), assistant: assistant('新主题'),
    researchState: reset.context.researchState });
  const next = prepareConversation(sessions.readSession(record.sessionId, { dir }), [user('继续')]);
  assert.equal(next.messages.length, 3);
  assert.equal(next.context.history.length, 2);
  assert.equal(next.context.researchState.conditions.temperature, undefined);
});

test('HTTP two turns use persisted history, execute history tool and persist conditions', async (t) => {
  const dir = tempStore(t);
  const previous = process.env.AGENT_SESSION_DIR;
  const previousAudit = process.env.AGENT_AUDIT_DIR;
  process.env.AGENT_SESSION_DIR = dir;
  process.env.AGENT_AUDIT_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.AGENT_SESSION_DIR;
    else process.env.AGENT_SESSION_DIR = previous;
    if (previousAudit === undefined) delete process.env.AGENT_AUDIT_DIR;
    else process.env.AGENT_AUDIT_DIR = previousAudit;
    sessions.resetRuntime();
  });
  const calls = [];
  let calledHistory = false;
  const provider = { available: true, async streamChat({ messages }) {
    calls.push(JSON.parse(JSON.stringify(messages)));
    if (messages.some((m) => m.content === '那含量呢？') && !calledHistory) {
      calledHistory = true;
      return { content: '', tool_calls: [{ id: 'history1', function: {
        name: 'search_history', arguments: JSON.stringify({ query: '1500℃' }),
      } }] };
    }
    return { content: '离线模拟回答', tool_calls: [] };
  } };
  const app = express();
  app.use(express.json());
  app.use('/api/agent', createRouter({ provider }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/agent`;
  const post = (endpoint, body) => fetch(url + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const { sessionId } = await (await post('/sessions', {})).json();
  const first = await post('/stream', { sessionId, messages: [user('1500℃空气中，SiC的作用？')], context: { projectId: 'p1', graphId: 'g1' } });
  assert.match(await first.text(), /"type":"done"/);
  const second = await post('/stream', { sessionId, messages: [user('那含量呢？')], options: { allowTools: ['search_history'] } });
  const frames = await second.text();
  assert.match(frames, /"name":"search_history"/);
  assert.match(frames, /"usableAsEvidence":false/);
  const secondInput = calls[1];
  assert.equal(secondInput.filter((m) => m.content === '1500℃空气中，SiC的作用？').length, 1);
  assert.match(secondInput[1].content, /1500℃/);
  const detail = await (await fetch(`${url}/sessions/${sessionId}`)).json();
  assert.equal(detail.messages.length, 4);
  assert.equal(detail.researchState.turn, 2);
  assert.equal(detail.researchState.scope.graphId, 'g1');
  const bad = await post('/stream', { sessionId, messages: [assistant('不应启动')] });
  assert.equal(bad.status, 400);
});
