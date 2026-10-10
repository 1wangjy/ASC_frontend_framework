'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkProvider, runPreflight } = require('../src/agent/modelPreflight');
const { OpenAICompatibleProvider } = require('../src/agent/provider');

function provider({ contentType = 'text/event-stream', noTool = false, fail = false } = {}) {
  const bodies = [];
  const p = new OpenAICompatibleProvider({ apiUrl: 'http://localhost/v1', authMode: 'none', model: 'fixture',
    fetchImpl: async (url, options) => {
      if (fail) throw new Error('private-secret-must-not-leak');
      const body = JSON.parse(options.body); bodies.push(body);
      const delta = body.tools && !noTool ? { tool_calls: [{ index: 0, id: 'call_probe', type: 'function',
        function: { name: 'protocol_echo', arguments: '{"value":"probe"}' } }] }
        : { content: body.messages.find(message => message.role === 'tool')?.content || 'hello' };
      return new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: body.tools ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': contentType } });
    } });
  return { p, bodies };
}
test('disabled model makes no network call even with live requested', async () => {
  const report = await runPreflight({ modelId: 'local', live: true,
    catalog: () => ({ models: [{ id: 'local', configured: false }] }), resolve: () => { throw Error('must not resolve'); } });
  assert.equal(report.code, 'model_not_configured'); assert.equal(report.networkRequests, 0);
});
test('default check is configuration-only, not capability acceptance', async () => {
  const report = await runPreflight({ modelId: 'local', catalog: () => ({ models: [{ id: 'local', configured: true }] }) });
  assert.equal(report.status, 'configuration_only'); assert.equal(report.networkRequests, 0);
});
test('SSE tool call and tool-result continuation pass with real adapter', async () => {
  const { p, bodies } = provider(); const original = p.fetchImpl;
  const report = await checkProvider(p);
  assert.equal(report.status, 'passed_protocol_only'); assert.equal(report.requests, 2);
  assert.equal(bodies[1].messages[2].role, 'tool'); assert.equal(p.fetchImpl, original);
});
test('chat-only response does not pass tool capability', async () => {
  const { p } = provider({ noTool: true }); const report = await checkProvider(p);
  assert.equal(report.status, 'failed'); assert.equal(report.code, 'tool_call_not_observed_or_invalid');
});
test('non-SSE wire content cannot pass just because parser found data', async () => {
  const { p } = provider({ contentType: 'application/json' }); const report = await checkProvider(p);
  assert.equal(report.status, 'failed'); assert.equal(report.code, 'sse_not_observed');
});
test('upstream errors are not copied into report', async () => {
  const { p } = provider({ fail: true }); const original = p.fetchImpl; const report = await checkProvider(p);
  assert.equal(report.code, 'provider_request_failed'); assert.equal(p.fetchImpl, original);
  assert.ok(!JSON.stringify(report).includes('private-secret'));
});
