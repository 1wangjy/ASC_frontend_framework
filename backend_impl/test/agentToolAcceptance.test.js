'use strict';
// Functional contracts only. All service responses in this file are fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/agent/tools');
const { EvidenceStore } = require('../src/agent/evidence');
const { prepareConversation } = require('../src/agent/conversation');

test('acceptance: all nine registered tools expose a function schema', () => {
  const names = registry.registeredNames();
  assert.equal(names.length, 9);
  assert.equal(registry.getToolSchemas(names).length, 9);
  for (const item of registry.listTools()) {
    assert.ok(item.description);
    assert.equal(item.parameters.type, 'object');
  }
});

test('acceptance: history reads only active-topic server history and reset clears it', async () => {
  const record = { messages: [
    { role: 'user', content: '旧话题 SiC' },
    { role: 'user', content: '当前话题 SiC' },
    { role: 'assistant', content: '当前 SiC 服务答案' },
  ], researchState: { version: 1, historyStart: 1, scope: { projectId: 'p1', graphId: 'g1' }, turn: 1 } };
  const incoming = [{ role: 'user', content: '继续' }];
  const prepared = prepareConversation(record, incoming, {});
  const result = await registry.runTool('search_history', { query: 'SiC' }, prepared.context);
  assert.equal(result.ok, true);
  assert.equal(result.data.results.length, 2);
  assert.ok(result.data.results.every(item => !item.content.includes('旧话题')));
  assert.equal(result.data.usableAsEvidence, false);
  const reset = prepareConversation(record, [{ role: 'user', content: '换个话题' }], {});
  assert.equal((await registry.runTool('search_history', { query: 'SiC' }, reset.context)).data.results.length, 0);
  assert.equal((await registry.runTool('search_history', { query: 'SiC' }, { hasSession: false })).ok, false);
});

test('acceptance: evidence reads a complete registered snippet and rejects unknown/cross-turn IDs', async () => {
  const store = new EvidenceStore({ projectId: 'p1', graphId: 'g1' });
  const quote = '这是 API 返回的片段。'.repeat(70);
  const [item] = store.register([{ document_title: 'fixture paper', paper_id: 'paper1', original_quote: quote }],
    { project_id: 'p1', graph_id: 'g1' });
  const result = await registry.runTool('read_evidence', { evidence_id: item.evidence_id }, { evidenceStore: store });
  assert.equal(result.ok, true);
  assert.equal(result.data.text, quote);
  assert.equal((await registry.runTool('read_evidence', { evidence_id: 'ev_' + '0'.repeat(24) }, { evidenceStore: store })).ok, false);
  assert.equal((await registry.runTool('read_evidence', { evidence_id: item.evidence_id }, { evidenceStore: new EvidenceStore() })).ok, false);
  assert.equal((await registry.runTool('read_evidence', { evidence_id: '../paper.md' }, { evidenceStore: store })).ok, false);
});

test('acceptance: prediction sends numeric parameters and preserves service output', async t => {
  let body;
  const payload = { predictions: [{ property: 'bulk_density', condition: '110℃', value: 2.75, unit: 'g/cm3' }] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(String(url), /\/api\/v1\/predict\/simple$/);
    body = JSON.parse(options.body);
    return Response.json(payload);
  });
  const args = { X_comp: [[61, 70], [42, 30]], X_global: [3.6, 10, 0], conditions: ['110℃'], properties: ['bulk_density'] };
  const result = await registry.runTool('predict', args);
  assert.equal(result.ok, true);
  assert.deepEqual(body, args);
  assert.deepEqual(result.data, payload);
});

test('acceptance: prediction rejects invalid parameters without contacting service', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected call'); });
  for (const args of [{}, { X_comp: [] }, { X_comp: [[61, '70']] }, { X_comp: [[61]] }]) {
    assert.equal((await registry.runTool('predict', args)).ok, false);
  }
  assert.equal(calls, 0);
});

test('acceptance: prediction reports HTTP failure and malformed JSON', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  const first = await registry.runTool('predict', { X_comp: [[61, 70]] });
  assert.equal(first.ok, false);
  assert.match(first.summary, /503/);
  t.mock.method(globalThis, 'fetch', async () => new Response('not json', { status: 200 }));
  const second = await registry.runTool('predict', { X_comp: [[61, 70]] });
  assert.equal(second.ok, false);
  assert.match(second.summary, /non-JSON/);
});

test('acceptance: prediction reports an unreachable service', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fixture unavailable'); });
  const result = await registry.runTool('predict', { X_comp: [[61, 70]] });
  assert.equal(result.ok, false);
  assert.match(result.summary, /unreachable/);
});
