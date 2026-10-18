'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('../src/agent/loop');
const registry = require('../src/agent/tools');
const { serviceAnswer } = require('../src/agent/serviceAnswer');
const context = { projectId: 'p', graphId: 'g', answerMode: 'knowledge_service' };
const original = '知识服务原答案\n'.repeat(3500);
const response = { ok: true, data: { service_answer: { text: original,
  references: [{ reference_id: 'ref1', document_title: '文献', original_quote: '原始引文' }],
  citation_bindings: [{ reference_id: 'ref1', answer_excerpt: '服务绑定' }],
  scope: { project_id: 'p', graph_id: 'g' }, qa_run_id: 'q1' } } };
test('service answer and original references survive without rewrite or citation-ID gating', () => {
  const answer = serviceAnswer(response, context);
  assert.equal(answer.text, original);
  assert.equal(answer.citations[0].text, '原始引文');
  assert.deepEqual(answer.citation_bindings, response.data.service_answer.citation_bindings);
  assert.equal(answer.answer_check.semantic_support_verified, false);
  assert.equal(serviceAnswer(response, { graphId: 'other' }), null);
  assert.equal(serviceAnswer({ ...response, ok: false }, context), null);
});
test('service answer preserves remaining batch and subsequent tool decisions without rewrite', async t => {
  let modelCalls = 0, tools = 0;
  t.mock.method(registry, 'runTool', async () => { tools++; return response; });
  const frames = [];
  await runAgent({ messages: [{ role: 'user', content: '材料问题' }], context, emit: f => frames.push(f),
    provider: { available: true, async streamChat({ messages }) {
      modelCalls++;
      if (modelCalls === 1) return { tool_calls: ['kg_search', 'rag_search'].map((name,i) =>
        ({ id: String(i), function: { name, arguments: '{"query":"材料问题"}' } })) };
      assert.ok(messages.filter(m => m.role === 'tool').every(m => m.content.length < 12000));
      if (modelCalls === 2) return { tool_calls: [{ id: 'read', function: {
        name: 'read_evidence', arguments: '{"evidence_id":"ev_test"}' } }] };
      return { content: '不能覆盖服务原答案' };
    } } });
  assert.equal(modelCalls, 3); assert.equal(tools, 3);
  assert.deepEqual(frames.filter(f => f.type === 'tool_result').map(f => f.name), ['kg_search', 'rag_search', 'read_evidence']);
  assert.equal(frames.filter(f => f.type === 'final').length, 1);
  assert.equal(frames.find(f => f.type === 'final').text, original);
  assert.equal(frames.at(-1).type, 'done');
});

test('one sufficient search may end naturally without forcing extra tools', async t => {
  t.mock.method(registry, 'runTool', async () => response);
  let step = 0; const frames = [];
  await runAgent({ messages: [{ role: 'user', content: '材料问题' }], context, emit: f => frames.push(f),
    provider: { available: true, async streamChat() { return ++step === 1 ? { tool_calls: [{ id: '1',
      function: { name: 'kg_search', arguments: '{}' } }] } : { content: '结束' }; } } });
  assert.equal(step, 2);
  assert.equal(frames.filter(f => f.type === 'tool_call').length, 1);
  assert.equal(frames.find(f => f.type === 'final').text, original);
});

test('tool budget exhaustion still publishes retained service answer unchanged', async t => {
  t.mock.method(registry, 'runTool', async () => response);
  let step = 0; const frames = [];
  await runAgent({ messages: [{ role: 'user', content: '材料问题' }], context,
    options: { maxTools: 1 }, emit: f => frames.push(f),
    provider: { available: true, async streamChat({ tools }) {
      if (++step === 1) return { tool_calls: [{ id: '1', function: { name: 'kg_search', arguments: '{}' } }] };
      assert.equal(tools.length, 0); return { content: '结束' };
    } } });
  assert.equal(frames.find(f => f.type === 'final').text, original);
});
test('service failure cannot be replaced with a model-invented materials answer', async t => {
  t.mock.method(registry, 'runTool', async () => ({ ok: false, summary: 'offline unavailable', data: {} }));
  let step = 0; const frames = [];
  await runAgent({ messages: [{ role: 'user', content: '材料问题' }], context, emit: f => frames.push(f),
    provider: { available: true, async streamChat() { return ++step === 1 ? { tool_calls: [{ id: '1',
      function: { name: 'kg_search', arguments: '{"query":"材料问题"}' } }] } : { content: '模型自己猜测的材料结论' }; } } });
  const final = frames.find(f => f.type === 'final');
  assert.equal(final.answer_check.status, 'no_service_answer');
  assert.ok(!final.text.includes('模型自己猜测'));
});
test('real tool adapter retains full publication while model projection remains compact', async t => {
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ success: true, data: {
    final_answer: original, references: response.data.service_answer.references, citation_bindings: [{ reference_id: 'ref1' }] } })));
  const result = await registry.runTool('kg_search', { query: '材料问题' }, { ...context, allowed: new Set(['kg_search']) });
  assert.equal(result.data.service_answer.text, original);
  assert.equal(serviceAnswer(result, context).text, original);
});

test('oversized service answer is an explicit failure, not a silently clipped publication', async t => {
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ success: true,
    data: { final_answer: 'x'.repeat(64001), references: [] } })));
  const result = await registry.runTool('kg_search', { query: '材料问题' }, context);
  assert.equal(result.ok, false);
  assert.equal(result.data.code, 'service_answer_too_large');
  assert.equal(serviceAnswer(result, context), null);
});
