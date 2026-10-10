'use strict';

// Small, charged cloud connectivity test. No KG/tool or scientific quality claims.
const fs = require('node:fs');
const path = require('node:path');
require('../src/agent/env').loadAgentEnv();

async function main() {
  const base = process.env.AGENT_MODEL_SMOKE_BASE || 'http://127.0.0.1:3005/api/agent';
  const report = { schema: 'agent.model_switch_smoke.v1', started_at: new Date().toISOString(),
    scope: 'real_cloud_model_selection_only; no tool or scientific quality evaluation',
    status: 'failed', turns: [] };
  const request = (endpoint, body) => fetch(base + endpoint, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(65000) });
  try {
    const models = await (await request('/models')).json();
    report.catalog = models.models;
    const sessionResponse = await request('/sessions', { title: '模型切换连通性联调' });
    if (!sessionResponse.ok) throw new Error('session_creation_failed');
    report.session_id = (await sessionResponse.json()).sessionId;
    for (const modelId of ['default', 'deepseek-pro']) {
      const started = Date.now();
      const response = await request('/stream', { sessionId: report.session_id, modelId,
        messages: [{ role: 'user', content: '这是模型连接测试，无需检索或科研判断。请仅回复：连接成功。' }],
        options: { allowTools: [], maxSteps: 1, maxTools: 1, timeoutMs: 60000 } });
      const frames = response.ok ? (await response.text()).split(/\r?\n/)
        .filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))) : [];
      const selected = frames.find(frame => frame.type === 'model_selected');
      const final = frames.findLast(frame => frame.type === 'final');
      const errorCodes = frames.filter(frame => frame.type === 'error').map(frame => frame.code || 'agent_error');
      const turn = { requested_id: modelId, actual: selected ? { id: selected.modelId, model: selected.model } : null,
        http_status: response.status, ms: Date.now() - started, answer: final?.text || '', error_codes: errorCodes,
        done: frames.some(frame => frame.type === 'done'), tool_calls: frames.filter(frame => frame.type === 'tool_call').length };
      turn.passed = response.ok && selected?.modelId === modelId && !!turn.answer && turn.done && !errorCodes.length;
      report.turns.push(turn);
      console.log(JSON.stringify({ model_id: modelId, passed: turn.passed, ms: turn.ms }));
    }
    const detail = await (await request('/sessions/' + report.session_id)).json();
    report.saved_models = detail.messages?.filter(message => message.role === 'assistant').map(message => message.model);
    const rejected = await request('/stream', { modelId: 'local-finetuned',
      messages: [{ role: 'user', content: '未部署模型检查' }] });
    report.undeployed_rejected = rejected.status === 400;
    report.status = report.turns.length === 2 && report.turns.every(turn => turn.passed)
      && report.saved_models?.length === 2 && report.saved_models.every((model, i) => model?.id === report.turns[i].requested_id)
      && report.undeployed_rejected ? 'passed_model_selection_only' : 'failed';
  } catch (error) { report.error = { name: error.name }; }
  report.ended_at = new Date().toISOString();
  const dir = path.resolve(__dirname, '../data/agent/integration');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `model-switch-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, report: file }));
  if (report.status === 'failed') process.exitCode = 1;
}
main().catch(() => { console.error('model_smoke_failed'); process.exitCode = 1; });
