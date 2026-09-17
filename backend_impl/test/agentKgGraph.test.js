/**
 * kg_graph bounding: with a synthetic 250-node / 400-edge graph served by a
 * stubbed fetcher, the tool must (a) respect the default and explicit limits,
 * (b) project every node/edge to a handful of small fields, (c) apply
 * node_type/keyword filters, and (d) reject out-of-range limits at the schema
 * gate. Offline: `fetch` is stubbed, no service is contacted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const toolRegistry = require('../src/agent/tools');

const NODE_COUNT = 250;
const EDGE_COUNT = 400;

function syntheticGraph() {
  const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
    uuid: `n${i}`,
    name: i % 5 === 0 ? `刚玉-${i}` : `材料-${i}`,
    entity_type: i % 2 === 0 ? 'Material' : 'Process',
    labels: ['Entity', i % 2 === 0 ? 'Material' : 'Process'],
    weight: 0.5,
    // Must never survive the projection:
    summary: 'x'.repeat(500),
    attributes: { secret: 'y'.repeat(500) },
    episodes: ['e1'],
  }));
  const edges = Array.from({ length: EDGE_COUNT }, (_, i) => ({
    source: `n${i % NODE_COUNT}`,
    target: `n${(i * 7) % NODE_COUNT}`,
    relation: `rel-${i}`,
    fact: 'fact '.repeat(20),
    weight: 0.25,
  }));
  return { success: true, data: { graph_id: 'g1', project_id: 'p1', build_stage: 'GRAPH_COMPLETED', node_count: NODE_COUNT, edge_count: EDGE_COUNT, nodes, edges } };
}

/** Stub the global fetch used by the tool modules (no network, no DNS). */
function stubGraph(t, graph) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(graph), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

test('kg_graph bounds a 250-node/400-edge graph to the defaults and projects 4 fields', async (t) => {
  const calls = stubGraph(t, syntheticGraph());
  const outcome = await toolRegistry.runTool('kg_graph', { graph_id: 'g1' });

  assert.equal(outcome.ok, true, outcome.summary);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/graph\/data\/g1$/);

  const { data } = outcome;
  assert.equal(data.node_count, 250);
  assert.equal(data.edge_count, 400);
  assert.equal(data.matched_nodes, 250);
  assert.equal(data.returned_nodes, 20, 'default node_limit is 20');
  assert.equal(data.returned_edges, 40, 'default edge_limit is 40');
  assert.equal(data.nodes_truncated, true);
  assert.equal(data.edges_truncated, true);

  for (const node of data.nodes) {
    assert.deepEqual(Object.keys(node).sort(), ['id', 'name', 'type', 'weight']);
    assert.equal(node.summary, undefined);
    assert.equal(node.attributes, undefined);
  }
  for (const edge of data.edges) {
    for (const key of Object.keys(edge)) {
      assert.ok(['source', 'target', 'relation', 'weight'].includes(key), `unexpected edge field ${key}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(data), /xxxxx|yyyyy/, 'bulk node attributes must not leak into the payload');
});

test('kg_graph honours explicit limits and filters by node_type / keyword', async (t) => {
  stubGraph(t, syntheticGraph());

  const limited = await toolRegistry.runTool('kg_graph', { graph_id: 'g1', node_limit: 5, edge_limit: 3 });
  assert.equal(limited.data.returned_nodes, 5);
  assert.equal(limited.data.returned_edges, 3);

  const byType = await toolRegistry.runTool('kg_graph', { graph_id: 'g1', node_type: 'material' });
  assert.equal(byType.data.matched_nodes, 125);
  assert.ok(byType.data.nodes.every((node) => node.type === 'Material'));
  assert.equal(byType.data.returned_nodes, 20);
  const keptIds = new Set(byType.data.nodes.map((node) => node.id));
  assert.ok(byType.data.edges.every((edge) => keptIds.has(edge.source) || keptIds.has(edge.target)));

  const byKeyword = await toolRegistry.runTool('kg_graph', { graph_id: 'g1', keyword: '刚玉' });
  assert.equal(byKeyword.data.matched_nodes, 50);
  assert.ok(byKeyword.data.nodes.every((node) => node.name.includes('刚玉')));
  assert.equal(byKeyword.data.filters.keyword, '刚玉');
});

test('kg_graph rejects an out-of-range node_limit at the schema gate (no request made)', async (t) => {
  const calls = stubGraph(t, syntheticGraph());

  const outcome = await toolRegistry.runTool('kg_graph', { graph_id: 'g1', node_limit: 999 });
  assert.equal(outcome.ok, false);
  assert.match(outcome.summary, /kg_graph\.node_limit: must be <= 100/);

  const missing = await toolRegistry.runTool('kg_graph', {});
  assert.equal(missing.ok, false);
  assert.match(missing.summary, /kg_graph 需要指定 graph_id/);
  assert.equal(calls.length, 0, 'invalid arguments must never reach the graph service');
});
