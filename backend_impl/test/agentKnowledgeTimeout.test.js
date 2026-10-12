'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const kg = require('../src/agent/tools/kgSearch');
const registry = require('../src/agent/tools');
const { runAgent } = require('../src/agent/loop');

test('response body timeout is classified and retains received-header timing', async t => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'upstream-fixture' });
    res.write('{');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const previous = process.env.AGENT_KG_BASE_URL;
  process.env.AGENT_KG_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(() => previous === undefined ? delete process.env.AGENT_KG_BASE_URL : process.env.AGENT_KG_BASE_URL = previous);
  const result = await kg.codQuery({ payload: {}, timeoutMs: 100 });
  assert.equal(result.data.code, 'knowledge_tool_timeout');
  assert.equal(result.data.request_timing.phase, 'response_body');
  assert.equal(result.data.request_timing.status, 200);
  assert.equal(result.data.request_timing.upstream_request_id, 'upstream-fixture');
  assert.ok(result.data.request_timing.headers_ms >= 0);
});

test('header timeout and parent cancellation are different outcomes', async t => {
  t.mock.method(global, 'fetch', (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  const timeout = await kg.codQuery({ payload: {}, timeoutMs: 25 });
  assert.equal(timeout.data.code, 'knowledge_tool_timeout');
  assert.equal(timeout.data.request_timing.headers_ms, null);
  const controller = new AbortController();
  const request = kg.codQuery({ payload: {}, signal: controller.signal, timeoutMs: 100 });
  controller.abort();
  assert.equal((await request).data.code, 'knowledge_request_cancelled');
});

test('first knowledge timeout blocks same-batch and subsequent retries but keeps other tools', async t => {
  const executed = [];
  t.mock.method(registry, 'runTool', async name => {
    executed.push(name);
    return name === 'kg_search' ? { ok: false, summary: '单次超时，请稍后重新提问。', data: { code: 'knowledge_tool_timeout' } }
      : { ok: true, summary: 'history', data: {} };
  });
  let step = 0; const frames = [];
  await runAgent({ messages: [{ role: 'user', content: 'test' }], context: { answerMode: 'knowledge_service' },
    emit: frame => frames.push(frame), provider: { available: true, async streamChat({ tools }) {
      if (++step === 1) return { tool_calls: ['kg_search', 'rag_search', 'search_history'].map((name, i) => ({
        id: String(i), function: { name, arguments: '{}' } })) };
      const names = tools.map(tool => tool.function.name);
      assert.ok(!names.includes('kg_search') && !names.includes('rag_search'));
      assert.ok(names.includes('read_evidence'));
      return { content: '结束' };
    } } });
  assert.deepEqual(executed, ['kg_search', 'search_history']);
  assert.equal(frames.find(f => f.name === 'rag_search' && f.type === 'tool_result').data.request_sent, false);
  assert.ok(frames.find(f => f.type === 'final').text.includes('单次超时'));
});

test('DeepSeek tool continuation relays returned reasoning only within current turn', async t => {
  t.mock.method(registry, 'runTool', async () => ({ ok: true, summary: 'fixture', data: {} }));
  let step = 0;
  await runAgent({ messages: [{ role: 'user', content: 'test' }], emit() {}, provider: {
    available: true, model: 'deepseek-flash', async streamChat({ messages }) {
      if (++step === 1) return { reasoning: 'provider-returned-state', tool_calls: [{ id: 'one',
        function: { name: 'kg_list', arguments: '{}' } }] };
      assert.equal(messages.find(m => m.tool_calls)?.reasoning_content, 'provider-returned-state');
      return { content: '结束' };
    }
  } });
  assert.equal(step, 2);
});

test('remaining time prevents another long retrieval while preserving a successful service answer', async t => {
  t.mock.method(registry, 'runTool', async () => ({ ok: true, data: { service_answer: {
    text: '原答案', references: [], citation_bindings: [], scope: {} } } }));
  let step = 0; const frames = [];
  await runAgent({ messages: [{ role: 'user', content: 'test' }], options: { timeoutMs: 1000 },
    context: { answerMode: 'knowledge_service' }, emit: f => frames.push(f),
    provider: { available: true, async streamChat({ tools }) {
      if (++step === 1) return { tool_calls: [{ id: 'one', function: { name: 'kg_search', arguments: '{}' } }] };
      assert.ok(!tools.some(s => s.function.name === 'kg_search'));
      assert.ok(tools.some(s => s.function.name === 'read_evidence'));
      return { content: '结束' };
    } } });
  assert.equal(frames.find(f => f.type === 'final').text, '原答案');
});
