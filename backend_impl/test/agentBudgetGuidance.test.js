'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('../src/agent/loop');
const registry = require('../src/agent/tools');
const policy = require('../src/agent/policy');
const call = (name, i) => ({ id: `c${i}`, function: { name, arguments: '{}' } });
const budget = messages => JSON.parse(messages.find(m => m.role === 'system' && m.content.startsWith('服务端本轮剩余额度')).content.split('：')[1].split('\n')[0]);

test('remaining retrieval budget removes both shared retrieval tools but preserves evidence reading', async t => {
  t.mock.method(registry, 'runTool', async () => ({ ok: true, summary: 'fixture', data: {} }));
  let step = 0;
  await runAgent({ messages: [{ role: 'user', content: 'test' }], options: { maxTools: 8 }, emit() {}, provider: {
    available: true, async streamChat({ messages, tools }) {
      step++;
      const names = tools.map(s => s.function.name);
      const state = budget(messages);
      if (step === 1) {
        assert.equal(state.remaining_tools, 8);
        assert.ok(state.remaining_retrieval_calls >= 1);
        return { tool_calls: Array.from({ length: state.remaining_retrieval_calls }, (_, i) => call(i % 2 ? 'rag_search' : 'kg_search', i)) };
      }
      assert.ok(!names.includes('kg_search') && !names.includes('rag_search'));
      assert.ok(names.includes('read_evidence'));
      assert.equal(state.remaining_retrieval_calls, 0);
      assert.ok(state.remaining_tools < 8);
      return { content: '证据不足，无法确定。' };
    }
  } });
  assert.equal(step, 2);
});

test('over-budget batches remain locally refused and next model call has zero tools and remaining quota', async t => {
  let executions = 0;
  t.mock.method(registry, 'runTool', async () => { executions++; return { ok: true, summary: 'fixture', data: {} }; });
  t.mock.method(policy, 'auditCall', () => {});
  const frames = [];
  let step = 0;
  await runAgent({ messages: [{ role: 'user', content: 'test' }], options: { maxTools: 2 }, emit: f => frames.push(f), provider: {
    available: true, async streamChat({ messages, tools }) {
      if (++step === 1) return { tool_calls: [call('kg_list', 1), call('kg_list', 2), call('kg_list', 3)] };
      assert.deepEqual(tools, []);
      assert.equal(budget(messages).remaining_tools, 0);
      assert.equal(budget(messages).final_only, true);
      return { content: '已有结果。' };
    }
  } });
  assert.equal(executions, 2);
  assert.equal(frames.find(f => f.type === 'tool_result' && f.ok === false).data.quota_exceeded, true);
});
