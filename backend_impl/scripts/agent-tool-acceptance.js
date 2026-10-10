'use strict';
// Fixed-tool functional acceptance. No main-Agent LLM call or semantic scoring.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
require('../src/agent/env').loadAgentEnv();
const registry = require('../src/agent/tools');
const { EvidenceStore } = require('../src/agent/evidence');
const { prepareConversation } = require('../src/agent/conversation');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'data/agent/integration', 'tool-acceptance-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out, { recursive: true });
const report = { schema: 'agent.tool_acceptance.v1', started_at: new Date().toISOString(),
  scope: { project_id: process.env.AGENT_SMOKE_PROJECT_ID, graph_id: process.env.AGENT_SMOKE_GRAPH_ID },
  inventory: registry.listTools(), cases: [], limitations: [
    'fixed tool calls, not main-Agent end-to-end completion rate',
    'no answer quality or scientific support scoring',
    'prediction fixture checks are not a real deployment benchmark',
    'knowledge-service tokens and billed cost are not exposed by these tools',
  ] };
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const safeFetch = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('HTTP_' + res.status);
  return res.json();
};
async function run(name, tool, args, ctx, check, mode = 'real_api') {
  const started = Date.now();
  console.log(JSON.stringify({ event: 'case_started', name, tool, mode }));
  let result;
  try {
    result = await registry.runTool(tool, args, { ...ctx, signal: AbortSignal.timeout(190000) });
    check(result);
    report.cases.push({ name, tool, mode, status: 'pass', ms: Date.now() - started, args, result });
  } catch (error) {
    report.cases.push({ name, tool, mode, status: 'fail', ms: Date.now() - started, args,
      result: result || null, error: { name: error.name, message: String(error.message).slice(0, 500) } });
  }
  write('report.json', report);
  console.log(JSON.stringify({ event: 'case_finished', ...Object.fromEntries(['name', 'tool', 'mode', 'status', 'ms'].map(k => [k, report.cases.at(-1)[k]])) }));
  return result;
}
const must = (condition, message) => { if (!condition) throw new Error(message); };
async function main() {
  const files = ['agentToolAcceptance', 'agentPolicy', 'agentScope', 'agentKgGraph', 'agentWebBrowse', 'agentConversation', 'agentServiceAnswer'];
  const args = ['--test', '--test-reporter=tap', ...files.map(file => 'test/' + file + '.test.js')];
  const offline = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(out, 'offline-tests.tap'), (offline.stdout || '') + (offline.stderr || ''));
  const match = key => Number((offline.stdout || '').match(new RegExp('^# ' + key + ' (\\d+)', 'm'))?.[1] || 0);
  report.offline = { command: [process.execPath, ...args], exit_code: offline.status,
    tests: match('tests'), pass: match('pass'), fail: match('fail'), skipped: match('skipped'), mode: 'offline_fixture' };
  const scope = report.scope;
  const ctx = { projectId: scope.project_id, graphId: scope.graph_id, answerMode: 'knowledge_service' };
  const list = await run('catalog', 'kg_list', { limit: 10 }, {}, r => {
    must(r.ok, 'catalog unavailable');
    must(r.data.graphs.some(g => g.project_id === scope.project_id && g.graph_id === scope.graph_id), 'configured scope absent from catalog');
  });
  if (!report.cases.at(-1) || report.cases.at(-1).status !== 'pass') {
    report.blocker = 'knowledge_catalog_or_scope_unavailable';
  } else {
    await run('graph_read', 'kg_graph', { graph_id: scope.graph_id, node_limit: 3, edge_limit: 3 }, ctx, r => must(r.ok, 'graph read failed'));
    await run('scope_mismatch_rejected', 'kg_search', { query: 'SiC', project_id: 'acceptance_other_project' }, ctx,
      r => must(!r.ok && r.data?.code === 'scope_mismatch' && r.data.request_sent === false, 'scope guard failed'), 'local_guard');
    for (const tool of ['kg_search', 'rag_search']) {
      const store = new EvidenceStore(ctx);
      let upstream;
      const originalFetch = globalThis.fetch;
      // Capture the same response for equality checking without a second request.
      globalThis.fetch = async (...params) => {
        const response = await originalFetch(...params);
        if (String(params[0]).endsWith('/api/graphrag/cod-query')) upstream = await response.clone().json();
        return response;
      };
      let result;
      try {
        result = await run(tool + '_fixed_query', tool, { query: 'SiC 与 ASC 耐火材料的抗氧化性能有哪些关联？请保留服务引用。', topK: 5 }, { ...ctx, evidenceStore: store }, r => {
          must(r.ok, tool + ' failed');
          must(r.data.scope.project_id === scope.project_id && r.data.scope.graph_id === scope.graph_id, 'returned scope mismatch');
          if (tool === 'kg_search') {
            const pub = r.data.service_answer;
            must(pub && pub.text === upstream?.data?.final_answer, 'service answer changed or missing');
            must(JSON.stringify(pub.references) === JSON.stringify(upstream.data.references || []), 'references changed');
            must(JSON.stringify(pub.citation_bindings) === JSON.stringify(upstream.data.citation_bindings || []), 'bindings changed');
          } else must(!r.data.service_answer && !r.data.final_answer, 'retrieval-only tool published an answer');
        });
      } finally { globalThis.fetch = originalFetch; }
      if (upstream) write(tool + '-upstream.json', upstream);
      write(tool + '-evidence.json', store.snapshot());
      const item = store.snapshot()[0];
      if (result?.ok && item) await run(tool + '_read_returned_snippet', 'read_evidence', { evidence_id: item.evidence_id }, { evidenceStore: store },
        r => must(r.ok && r.data.text === item.text, 'snippet altered'), 'real_api_snippet_local_read');
      else report.cases.push({ name: tool + '_read_returned_snippet', tool: 'read_evidence', mode: 'real_api_snippet_local_read', status: 'blocked', reason: 'no_registered_snippet' });
      await run(tool + '_unknown_evidence_rejected', 'read_evidence', { evidence_id: 'ev_' + '0'.repeat(24) }, { evidenceStore: store }, r => must(!r.ok, 'unknown ID accepted'), 'local_guard');
    }
  }
  try {
    const base = `http://127.0.0.1:${Number(process.env.AGENT_PORT || 3001)}/api/agent`;
    const id = '50730328-be78-4e9b-9ac1-546420ca8633';
    const detail = await safeFetch(base + '/sessions/' + id);
    const prepared = prepareConversation(detail, [{ role: 'user', content: '继续' }], {});
    report.history_source = { session_id: id, message_count: detail.messages?.length || 0 };
    await run('persisted_session_history', 'search_history', { query: 'SiC', limit: 5 }, prepared.context, r => {
      must(r.ok && r.data.results.length > 0, 'saved history not found');
      must(r.data.results.every(item => prepared.context.history.some(m => m.content.slice(0, 1000) === item.content)), 'history outside supplied active session');
    }, 'persisted_history_local_tool');
    const reset = prepareConversation(detail, [{ role: 'user', content: '换个话题' }], {});
    await run('reset_topic_history_empty', 'search_history', { query: 'SiC' }, reset.context,
      r => must(r.ok && r.data.results.length === 0, 'reset leaked history'), 'local_guard');
  } catch (e) { report.cases.push({ name: 'persisted_session_history', tool: 'search_history', mode: 'persisted_history_local_tool', status: 'blocked', reason: e.message }); }
  // Real predictor is optional. No deployment is inferred from a mock result.
  const predictor = String(process.env.PREDICT_BASE_URL || 'http://127.0.0.1:8100').replace(/\/+$/, '');
  try {
    const health = await safeFetch(predictor.replace(/\/api\/v1$/, '') + '/health');
    report.predictor_health = health;
    await run('real_prediction', 'predict', { X_comp: [[61, 70], [42, 30]], X_global: [3.6, 10, 0], conditions: ['110℃'], properties: ['bulk_density'] }, {},
      r => must(r.ok && Array.isArray(r.data.predictions) && r.data.predictions.length > 0, 'no prediction'));
  } catch { report.cases.push({ name: 'real_prediction', tool: 'predict', mode: 'real_api', status: 'blocked', reason: 'predictor_health_unavailable; fixture tests do not prove deployment' }); }
  report.ended_at = new Date().toISOString();
  report.code_sha256 = crypto.createHash('sha256').update(registry.registeredNames().map(n => n).join('\n')
    + fs.readFileSync(__filename, 'utf8')).digest('hex');
  report.counts = Object.fromEntries(['pass', 'fail', 'blocked'].map(status => [status, report.cases.filter(c => c.status === status).length]));
  write('report.json', report);
  console.log(JSON.stringify({ output: out, offline: report.offline, counts: report.counts }, null, 2));
  if (report.offline.exit_code !== 0 || report.counts.fail) process.exitCode = 1;
}
main().catch(e => { report.fatal = { name: e.name, message: e.message }; write('report.json', report); console.error(e.message); process.exitCode = 1; });
