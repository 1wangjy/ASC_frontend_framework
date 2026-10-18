'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/agent/tools');

test('model arguments cannot override the selected project/graph or inject a simulation scope', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls += 1; throw new Error('must_not_contact_service'); });
  const ctx = { projectId: 'p1', graphId: 'g1' };
  for (const [name, args] of [
    ['kg_graph', { graph_id: 'g2' }],
    ['kg_search', { query: '材料', project_id: 'p2' }],
    ['kg_search', { query: '材料', graph_id: 'g2' }],
    ['rag_search', { query: '材料', graph_id: 'g2' }],
    ['rag_search', { query: '材料', simulation_id: 'unknown-simulation' }],
  ]) {
    const result = await registry.runTool(name, args, ctx);
    assert.equal(result.ok, false);
    assert.equal(result.data.code, 'scope_mismatch');
    assert.equal(result.data.request_sent, false);
  }
  assert.equal(calls, 0);
});

test('matching scope and omitted graph arguments retain normal scoped graph reads', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return Response.json({ success: true, data: { graph_id: 'g1', project_id: 'p1', nodes: [], edges: [] } });
  });
  for (const args of [{ graph_id: 'g1' }, {}]) {
    const result = await registry.runTool('kg_graph', args, { projectId: 'p1', graphId: 'g1' });
    assert.equal(result.ok, true, result.summary);
  }
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.endsWith('/api/graph/data/g1')));
});
