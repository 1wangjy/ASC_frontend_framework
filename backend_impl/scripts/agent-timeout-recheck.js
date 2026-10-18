'use strict';
// One fixed retrieval followed by real model decisions. Artifacts are local.
const fs = require('node:fs');
const path = require('node:path');
require('../src/agent/env').loadAgentEnv();
const { runAgent } = require('../src/agent/loop');
const { createProvider } = require('../src/agent/provider');
const registry = require('../src/agent/tools');
const directory = path.resolve(__dirname, '../data/agent/integration/timeout-recheck-20261012');
const base = 'http://127.0.0.1:3001/api/agent';
const sourceSession = '1f7cdece-812c-4686-aa22-3c3df92e0199';
async function main() {
  fs.mkdirSync(directory, { recursive: true });
  if (!process.argv.includes('--model-replay')) {
  const saved = await fetch(`${base}/sessions/${sourceSession}`);
  if (!saved.ok) throw new Error(`archive HTTP ${saved.status}`);
  const session = await saved.json();
  if (session.activeTurn) throw new Error('Source turn still active');
  fs.writeFileSync(path.join(directory, 'failure-session.json'), JSON.stringify(session, null, 2));
  const replay = await fetch(`${base}/stream`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: sourceSession, resumeFromEventId: 0 }), signal: AbortSignal.timeout(10000) });
  if (!replay.ok) throw new Error(`replay HTTP ${replay.status}`);
  fs.writeFileSync(path.join(directory, 'failure.sse'), await replay.text());
  const auditFile = path.resolve(__dirname, '../data/agent/audit-2026-10-12.jsonl');
  fs.writeFileSync(path.join(directory, 'failure-audit.jsonl'), fs.readFileSync(auditFile, 'utf8').split('\n')
    .filter(line => line.includes(sourceSession)).join('\n'));
  console.log('Failure session, events and audit archived');
  }
  if (!process.argv.includes('--live') && !process.argv.includes('--model-replay')) return;
  const provider = createProvider();
  if (!provider.available) throw new Error('Model not configured');
  const query = 'SiC 在 ASC（铝硅碳）耐火材料中的主要作用与机理';
  const context = { projectId: 'proj_65ac6094e268', graphId: 'nexus_2bdcb8bbccb04ea5', answerMode: 'knowledge_service' };
  const frames = []; let first = true;
  const modelReplay = process.argv.includes('--model-replay');
  const prefix = modelReplay ? 'model-replay' : 'recheck';
  if (modelReplay) {
    const prior = fs.readFileSync(path.join(directory, 'recheck.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const recorded = prior.find(f => f.type === 'tool_result' && f.name === 'kg_search');
    if (!recorded) throw new Error('Missing fixed retrieval result');
    registry.runTool = async () => ({ ok: recorded.ok, summary: recorded.summary, data: recorded.data });
  }
  const report = { started_at: new Date().toISOString(), model: provider.model, context, query, topK: 8,
    note: '首次工具选择固定为失败样本的查询和topK；后续为真实模型决策。单样本功能复测，不代表稳定完成率或提速。' };
  report.model_replay = modelReplay;
  await runAgent({ messages: [{ role: 'user', content: 'SiC 在 ASC 耐火材料中主要有哪些作用？请通过知识检索回答。' }],
    context, options: { timeoutMs: 300000 }, provider: { available: true, model: provider.model, async streamChat(args) {
      if (first) { first = false; return { reasoning: '', tool_calls: [{ id: 'fixed', function: { name: 'kg_search',
        arguments: JSON.stringify({ query, topK: 8, graph_id: context.graphId }) } }] }; }
      return provider.streamChat(args);
    } }, emit(frame) {
      frames.push(frame);
      fs.appendFileSync(path.join(directory, `${prefix}.jsonl`), JSON.stringify(frame) + '\n');
      if (['tool_call', 'tool_result', 'done', 'error'].includes(frame.type)) console.log(JSON.stringify({
        type: frame.type, name: frame.name, ok: frame.ok, ms: frame.ms, code: frame.code || frame.data?.code,
        request_timing: frame.data?.request_timing, timing: frame.timing }));
    } });
  const final = frames.findLast(f => f.type === 'final');
  const results = frames.filter(f => f.type === 'tool_result');
  report.completed = final?.answer_check?.status === 'knowledge_service_answer';
  report.tool_results = results.map(f => ({ name: f.name, ok: f.ok, ms: f.ms, code: f.data?.code, request_timing: f.data?.request_timing }));
  report.timing = frames.findLast(f => f.type === 'done')?.timing;
  report.usage = frames.findLast(f => f.type === 'done')?.usage;
  report.errors = frames.filter(f => f.type === 'error');
  const publication = results.findLast(f => f.ok && f.data?.service_answer)?.data.service_answer;
  report.answer_unchanged = publication ? final?.text === publication.text : null;
  fs.writeFileSync(path.join(directory, `${prefix}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ completed: report.completed, answer_unchanged: report.answer_unchanged }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
