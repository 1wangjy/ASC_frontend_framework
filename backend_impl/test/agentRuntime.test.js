'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAICompatibleProvider, createProvider } = require('../src/agent/provider');
const { createAgentApp } = require('../src/agent/server');
const { runAgent } = require('../src/agent/loop');

test('streaming provider preserves length termination instead of misreporting stop', async () => {
  const p = new OpenAICompatibleProvider({ apiUrl: 'https://llm.example', apiKey: 'fixture',
    fetchImpl: async () => new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n') });
  const result = await p.streamChat({ messages: [], tools: [], onDelta() {} });
  assert.equal(result.finish_reason, 'length');
});

test('last allowed step is tool-free and length-truncated drafts are incomplete', async () => {
  const frames = [];
  const provider = { available: true, async streamChat({ tools }) {
    assert.deepEqual(tools, []);
    return { content: '未完成断言', finish_reason: 'length', tool_calls: [] };
  } };
  await runAgent({ provider, messages: [{ role: 'user', content: '测试' }], options: { maxSteps: 1 }, emit: (f) => frames.push(f) });
  assert.equal(frames.find((f) => f.type === 'final').answer_check.status, 'incomplete');
  assert.ok(!JSON.stringify(frames).includes('未完成断言'));
});

function env(t, updates) {
  const original = {};
  for (const [key, value] of Object.entries(updates)) {
    original[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('Agent-specific model configuration overrides shared service configuration', (t) => {
  env(t, { AGENT_LLM_API_URL: 'http://127.0.0.1:9000/v1', AGENT_LLM_API_KEY: 'agent-test',
    AGENT_LLM_MODEL: 'local-ft', LLM_API_URL: 'https://shared.example/v1', LLM_API_KEY: 'shared-test',
    AGENT_LLM_AUTH_MODE: 'bearer' });
  const p = createProvider();
  assert.equal(p.chatUrl, 'http://127.0.0.1:9000/v1/chat/completions');
  assert.equal(p.apiKey, 'agent-test');
  assert.equal(p.model, 'local-ft');
});

test('existing recorded LLM_BASE_URL and LLM_MODEL_NAME can be reused', (t) => {
  env(t, { AGENT_LLM_API_URL: undefined, AGENT_LLM_API_KEY: undefined, AGENT_LLM_MODEL: undefined,
    LLM_API_URL: undefined, LLM_BASE_URL: 'https://recorded.example/v1', LLM_MODEL_NAME: 'recorded-model',
    LLM_API_KEY: 'fixture', AGENT_LLM_AUTH_MODE: 'bearer' });
  const p = createProvider();
  assert.equal(p.available, true);
  assert.equal(p.model, 'recorded-model');
  assert.equal(p.chatUrl, 'https://recorded.example/v1/chat/completions');
});

test('explicit local no-auth mode omits Authorization and preserves tool calling', async () => {
  let request;
  const p = new OpenAICompatibleProvider({ apiUrl: 'http://127.0.0.1:9000/v1', apiKey: '',
    authMode: 'none', model: 'local-ft', maxTokens: 1024, fetchImpl: async (_url, options) => {
      request = options;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
    } });
  assert.equal(p.available, true);
  await p.chat({ messages: [{ role: 'user', content: 'test' }], tools: [{ type: 'function', function: { name: 'fixture' } }] });
  assert.equal(request.headers.authorization, undefined);
  const body = JSON.parse(request.body);
  assert.equal(body.max_tokens, 1024);
  assert.equal(body.tools[0].function.name, 'fixture');
});

test('missing address and bearer credentials are unavailable without a constructor crash', () => {
  assert.equal(new OpenAICompatibleProvider({ apiUrl: '', apiKey: '' }).available, false);
  assert.equal(new OpenAICompatibleProvider({ apiUrl: 'https://llm.example/v1', apiKey: '', authMode: 'bearer' }).available, false);
  assert.throws(() => new OpenAICompatibleProvider({ apiUrl: 'https://llm.example', authMode: 'invalid' }), /bearer or none/);
});

test('output token budget is bounded for streaming and ordinary requests', () => {
  const p = new OpenAICompatibleProvider({ apiUrl: 'https://llm.example', apiKey: 'fixture', maxTokens: 900000 });
  assert.equal(p.buildBody({ messages: [], stream: true }).max_tokens, 8192);
  assert.equal(p.buildBody({ messages: [], stream: false }).max_tokens, 8192);
});

test('local integration server exposes safe health and actual Agent routes', async (t) => {
  const provider = { available: false, model: 'fixture', authMode: 'bearer', maxTokens: 1024 };
  const server = await new Promise((resolve) => {
    const instance = createAgentApp({ provider }).listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/agent`;
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.model_configured, false);
  assert.equal('apiKey' in health, false);
  const tools = await (await fetch(base + '/tools')).json();
  assert.equal(tools.tools.length, 9);
  const response = await fetch(base + '/stream', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }) });
  const stream = await response.text();
  assert.match(stream, /model_not_configured/);
  assert.match(stream, /"type":"done"/);
});
