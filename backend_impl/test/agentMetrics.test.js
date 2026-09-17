/**
 * T9 — metrics aggregation.
 *
 * Unit coverage of metrics.js, the loop's token-usage plumbing and the
 * provider's `usage` normalisation. Offline: scripted providers, stubbed fetch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const metrics = require('../src/agent/metrics');
const { runAgent, resolveTurnTimeout } = require('../src/agent/loop');
const { normalizeUsage, OpenAICompatibleProvider } = require('../src/agent/provider');

function collector() {
  const frames = [];
  const emit = (frame) => frames.push(frame);
  emit.frames = frames;
  return emit;
}

function toolCalls(...names) {
  return names.map((name, i) => ({
    id: `c${i}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(name === 'kg_list' ? { limit: 1 } : { graph_id: 'g1' }) },
  }));
}

function scriptedProvider(script, options = {}) {
  const prompts = [];
  let turn = 0;
  return {
    available: true,
    prompts,
    async streamChat({ messages, onDelta }) {
      prompts.push(messages);
      const message = script[Math.min(turn, script.length - 1)];
      turn += 1;
      if (message.content) onDelta(message.content);
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls || [],
        usage: options.usage,
      };
    },
  };
}

function stubKgFetch(t) {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ success: true, data: [], count: 0 }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  ));
}

test('recordTurn aggregates turns, tools, errors and latencies', () => {
  metrics.reset();
  metrics.recordTurn({
    ms: 1000,
    tools: [
      { name: 'kg_list', ok: true, ms: 40 },
      { name: 'kg_list', ok: true, ms: 60 },
      { name: 'web_browse', ok: false, ms: 500 },
    ],
  });
  metrics.recordTurn({ ms: 2000, tools: [] });

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.turns, 2);
  assert.equal(snapshot.toolCalls, 3);
  assert.equal(snapshot.toolErrors, 1);
  assert.equal(snapshot.avgTurnMs, 1500);
  assert.deepEqual(snapshot.tools, {
    kg_list: { calls: 2, errors: 0, avgMs: 50 },
    web_browse: { calls: 1, errors: 1, avgMs: 500 },
  });
  assert.deepEqual(snapshot.tokens, { prompt: 0, completion: 0, total: 0, reported: false });

  metrics.reset();
  const empty = metrics.snapshot();
  assert.equal(empty.turns, 0);
  assert.equal(empty.avgTurnMs, 0);
  assert.deepEqual(empty.tools, {});
});

test('tokens are summed from provider usage and flagged when the upstream stays silent', () => {
  metrics.reset();
  metrics.recordTurn({ ms: 10, usage: { prompt: 100, completion: 20, total: 120, reported: true } });
  metrics.recordTurn({ ms: 10, usage: { reported: false } });

  const withUsage = metrics.snapshot();
  assert.deepEqual(withUsage.tokens, { prompt: 100, completion: 20, total: 120, reported: true });

  metrics.reset();
  metrics.recordTurn({ ms: 10, usage: undefined });
  const withoutUsage = metrics.snapshot();
  assert.deepEqual(
    withoutUsage.tokens,
    { prompt: 0, completion: 0, total: 0, reported: false },
    'no upstream usage → 0 tokens, explicitly marked as unreported'
  );
});

test('the loop sums token usage over every LLM call of a turn', async (t) => {
  stubKgFetch(t);
  logToTempAudit(t);
  const provider = scriptedProvider(
    [
      { content: '', tool_calls: toolCalls('kg_list') },
      { content: '好了', tool_calls: [] },
    ],
    { usage: { prompt: 10, completion: 5, total: 15, reported: true } }
  );
  const result = await runAgent({
    messages: [{ role: 'user', content: 'hi' }],
    options: { sessionId: 'sess-tokens' },
    emit: collector(),
    provider,
  });

  assert.equal(provider.prompts.length, 2, 'two LLM calls in this turn');
  assert.deepEqual(result.usage, { prompt: 20, completion: 10, total: 30, reported: true });
  assert.equal(result.steps, 2);
  assert.equal(result.timedOut, false);
});

test('resolveTurnTimeout resolves option > env > default and clamps', () => {
  assert.equal(resolveTurnTimeout({}, {}), 300000, 'default turn timeout is 5 minutes');
  assert.equal(resolveTurnTimeout({}, { AGENT_TURN_TIMEOUT_MS: '2500' }), 2500);
  assert.equal(resolveTurnTimeout({ timeoutMs: 400 }, { AGENT_TURN_TIMEOUT_MS: '2500' }), 400);
  assert.equal(resolveTurnTimeout({}, { AGENT_TURN_TIMEOUT_MS: '1' }), 50, 'clamped to the floor');
  assert.equal(resolveTurnTimeout({}, { AGENT_TURN_TIMEOUT_MS: '99999999' }), 3600000, 'clamped to the ceiling');
  assert.equal(resolveTurnTimeout({}, { AGENT_TURN_TIMEOUT_MS: 'not-a-number' }), 300000);
});

test('providers without a usage block leave tokens unreported', async (t) => {
  stubKgFetch(t);
  logToTempAudit(t);
  const provider = scriptedProvider([{ content: '没有用量', tool_calls: [] }]);
  const result = await runAgent({
    messages: [{ role: 'user', content: 'hi' }],
    emit: collector(),
    provider,
  });
  assert.deepEqual(result.usage, { prompt: 0, completion: 0, total: 0, reported: false });
});

test('normalizeUsage maps OpenAI usage shapes and rejects empty ones', () => {
  assert.equal(normalizeUsage(undefined), null);
  assert.equal(normalizeUsage({}), null);
  assert.deepEqual(normalizeUsage({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 }), {
    prompt: 7,
    completion: 3,
    total: 10,
    reported: true,
  });
  assert.deepEqual(normalizeUsage({ prompt: 2, completion: 1 }), { prompt: 2, completion: 1, total: 3, reported: true });

  // Streaming requests ask for the usage block explicitly.
  const provider = new OpenAICompatibleProvider({ apiUrl: 'https://llm.example/v1', apiKey: 'k' });
  assert.deepEqual(provider.buildBody({ messages: [], stream: true }).stream_options, { include_usage: true });
  assert.equal('stream_options' in provider.buildBody({ messages: [], stream: false }), false);
});

/** Point AGENT_AUDIT_DIR at a temp dir so audit writes stay out of the repo. */
function logToTempAudit(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-metrics-'));
  const previous = process.env.AGENT_AUDIT_DIR;
  process.env.AGENT_AUDIT_DIR = dir;
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.AGENT_AUDIT_DIR;
    else process.env.AGENT_AUDIT_DIR = previous;
  });
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  return dir;
}
