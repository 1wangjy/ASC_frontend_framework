'use strict';

// Operator-only diagnostic: never executes a real registered tool or exposes credentials.
async function checkProvider(provider, timeoutMs = 30000) {
  const report = { status: 'failed', requests: 0, sse: false, toolCall: false,
    toolResultReply: false, usage: [], scope: 'synthetic_tool_protocol_only' };
  const originalFetch = provider.fetchImpl;
  const responses = [];
  provider.fetchImpl = async (...args) => {
    report.requests++;
    const response = await originalFetch(...args);
    responses.push(response.headers.get('content-type') || '');
    return response;
  };
  const signal = AbortSignal.timeout(timeoutMs);
  const tools = [{ type: 'function', function: { name: 'protocol_echo',
    description: 'Protocol test only. Returns the supplied value.',
    parameters: { type: 'object', properties: { value: { type: 'string', enum: ['probe'] } },
      required: ['value'], additionalProperties: false } } }];
  const messages = [{ role: 'user', content: 'This is a protocol test. Call protocol_echo with value probe. Do not answer before calling it.' }];
  try {
    const first = await provider.streamChat({ messages, tools, signal, onDelta() {} });
    if (first.usage) report.usage.push(first.usage);
    const calls = first.tool_calls || [];
    let args;
    try { args = JSON.parse(calls[0]?.function?.arguments); } catch { /* invalid tool arguments */ }
    report.toolCall = calls.length === 1 && !!calls[0].id
      && calls[0].function.name === 'protocol_echo' && args?.value === 'probe'
      && Object.keys(args).length === 1;
    if (!report.toolCall) { report.code = 'tool_call_not_observed_or_invalid'; return report; }
    // A fresh marker exists only in the tool result, not the initial prompt.
    const marker = 'PROBE_' + require('node:crypto').randomBytes(8).toString('hex');
    const second = await provider.streamChat({ tools: [], signal, onDelta() {}, messages: [
      ...messages, { role: 'assistant', content: first.content || '', tool_calls: calls },
      { role: 'tool', tool_call_id: calls[0].id, content: marker },
      { role: 'user', content: 'Reply with exactly the tool result, without commentary.' },
    ] });
    if (second.usage) report.usage.push(second.usage);
    report.toolResultReply = second.content?.trim() === marker && !(second.tool_calls || []).length;
    report.sse = responses.length === 2 && responses.every(type => /^text\/event-stream\b/i.test(type));
    report.status = report.sse && report.toolResultReply ? 'passed_protocol_only' : 'failed';
    if (report.status === 'failed') report.code = !report.sse ? 'sse_not_observed' : 'tool_result_reply_mismatch';
  } catch {
    // Do not copy provider errors: upstream bodies may contain secrets or private URLs.
    report.code = signal.aborted ? 'probe_timeout' : 'provider_request_failed';
  } finally {
    provider.fetchImpl = originalFetch;
    report.sse = responses.length === 2 && responses.every(type => /^text\/event-stream\b/i.test(type));
  }
  return report;
}

async function runPreflight({ modelId, live = false, resolve, catalog }) {
  const item = catalog().models.find(model => model.id === modelId);
  const report = { schema: 'agent.model_preflight.v1', modelId,
    model: item?.model || null, checkedAt: new Date().toISOString(), live,
    status: 'blocked', code: 'unknown_model_id', networkRequests: 0 };
  if (!item) return report;
  if (!item.configured) { report.code = 'model_not_configured'; return report; }
  if (!live) { report.status = 'configuration_only'; report.code = 'capabilities_not_tested'; return report; }
  const provider = resolve(modelId);
  provider.maxTokens = Math.min(provider.maxTokens, 256);
  report.protocol = await checkProvider(provider);
  report.networkRequests = report.protocol.requests;
  report.status = report.protocol.status;
  report.code = report.protocol.code || null;
  return report;
}
module.exports = { checkProvider, runPreflight };
