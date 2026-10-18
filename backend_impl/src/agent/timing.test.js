'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('./loop');
const tools = require('./tools');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const question = [{ role: 'user', content: '测试问题' }];
const toolCall = { id: 'knowledge', function: { name: 'kg_search', arguments: '{}' } };

test('timing separates model and knowledge calls; service answer is unchanged', async t => {
  t.mock.method(tools, 'runTool', async () => { await sleep(20); return { ok: true, data: {
    service_answer: { text: '  服务原答案\n', references: [], citation_bindings: [], scope: {} } } }; });
  let step = 0;
  const provider = { available: true, async streamChat() { await sleep(15);
    return ++step === 1 ? { tool_calls: [toolCall] } : { content: '完成' }; } };
  const frames = [];
  const result = await runAgent({ messages: question, context: { answerMode: 'knowledge_service' },
    provider, emit: f => frames.push(f) });
  assert.ok(result.timing.modelMs >= 10);
  assert.ok(result.timing.knowledgeToolMs >= 15);
  assert.equal(result.timing.otherToolMs, 0);
  assert.equal(result.timing.totalMs, result.timing.modelMs + result.timing.knowledgeToolMs + result.timing.otherMs);
  assert.deepEqual(frames.at(-1).timing, result.timing);
  assert.equal(frames.find(f => f.type === 'final').text, '  服务原答案\n');
  assert.equal(frames[0].type, 'turn_started');
  assert.equal(frames.find(f => f.type === 'model_status').status, 'running');
  const call = frames.find(f => f.type === 'tool_call');
  const outcome = frames.find(f => f.type === 'tool_result');
  assert.ok(outcome.finishedAt >= call.startedAt);
  assert.equal(outcome.ms, result.timing.knowledgeToolMs);
});

for (const stopped of [false, true]) test(`interrupted knowledge call records duration (${stopped ? 'stop' : 'timeout'})`, async t => {
  const controller = new AbortController();
  t.mock.method(tools, 'runTool', () => new Promise(() => {}));
  const frames = [];
  const provider = { available: true, async streamChat() { return { tool_calls: [toolCall] }; } };
  const stopTimer = stopped ? setTimeout(() => controller.abort(), 30) : null;
  t.after(() => clearTimeout(stopTimer));
  const result = await runAgent({ messages: question, provider, signal: controller.signal,
    options: { timeoutMs: 60 }, emit: f => frames.push(f) });
  const outcome = frames.find(f => f.type === 'tool_result');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.stopped, stopped);
  assert.ok(outcome.ms >= 15);
  assert.equal(result.timing.knowledgeToolMs, outcome.ms);
  assert.equal(frames.find(f => f.type === 'error').code, stopped ? 'turn_stopped' : 'turn_timeout');
  assert.ok(frames.at(-1).timing.totalMs >= outcome.ms);
});

test('model timeout has terminal phase and timing without pretending a tool ran', async () => {
  const frames = [];
  const result = await runAgent({ messages: question, options: { timeoutMs: 60 },
    provider: { available: true, streamChat: () => new Promise(() => {}) }, emit: f => frames.push(f) });
  assert.ok(result.timing.modelMs >= 40);
  assert.equal(result.timing.knowledgeToolMs, 0);
  assert.equal(frames.filter(f => f.type === 'model_status').at(-1).status, 'interrupted');
});
