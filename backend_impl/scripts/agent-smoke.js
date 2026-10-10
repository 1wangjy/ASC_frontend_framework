'use strict';

// One scoped question + follow-up through the real HTTP/SSE Agent route.
// Check-only probes the KG catalog without making an LLM request.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('../src/agent/env').loadAgentEnv();
const { createProvider } = require('../src/agent/provider');

function safeError(error) {
  // Provider errors can contain service response text. Do not archive secrets.
  return { name: error && error.name || 'Error', code: error && error.code || null };
}
async function main() {
  const checkOnly = process.argv.includes('--check-only');
  const kgBase = String(process.env.AGENT_KG_BASE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
  const base = `http://127.0.0.1:${Number(process.env.AGENT_PORT || 3001)}/api/agent`;
  const report = { schema: 'agent.real_smoke.v1', started_at: new Date().toISOString(),
    mode: checkOnly ? 'preflight' : 'real_two_turn_smoke', status: 'blocked', blockers: [], turns: [] };
  const codeFiles = ['loop.js', 'provider.js', 'route.js', 'serviceAnswer.js', 'evidence.js', 'tools/kgSearch.js', 'tools/index.js'];
  report.code_fingerprint = crypto.createHash('sha256').update(codeFiles.map((file) =>
    fs.readFileSync(path.resolve(__dirname, '../src/agent', file), 'utf8')).join('\n')).digest('hex');
  try {
    const provider = createProvider();
    report.model = provider.model;
    report.model_configured = provider.available;
    report.model_settings = { auth_mode: provider.authMode, max_output_tokens: provider.maxTokens,
      retrieval_cap: Number(process.env.AGENT_MAX_RETRIEVAL_CALLS || 2) };
    if (!provider.available) report.blockers.push('model_not_configured');
  } catch { report.blockers.push('model_configuration_invalid'); }
  let catalog = [];
  try {
    const response = await fetch(`${kgBase}/api/graph/catalog?limit=50`, { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    if (!response.ok || payload.success === false || !Array.isArray(payload.data)) {
      report.blockers.push('knowledge_catalog_invalid');
    } else { catalog = payload.data; report.catalog_count = catalog.length; }
  } catch (error) { report.blockers.push('knowledge_api_unreachable'); report.knowledge_error = safeError(error); }
  const projectId = process.env.AGENT_SMOKE_PROJECT_ID;
  const graphId = process.env.AGENT_SMOKE_GRAPH_ID;
  report.scope = { project_id: projectId || null, graph_id: graphId || null };
  if (!projectId && !graphId) report.blockers.push('test_scope_not_configured');
  if (catalog.length && (projectId || graphId) && !catalog.some((item) =>
    (!projectId || item.project_id === projectId) && (!graphId || item.graph_id === graphId))) {
    report.blockers.push('test_scope_not_in_catalog');
  }
  if (!report.blockers.length && !checkOnly) {
    const post = (endpoint, body) => fetch(base + endpoint, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(330000) });
    try {
      const response = await post('/sessions', { title: 'Agent真实链路联调' });
      if (!response.ok) throw new Error('session_creation_failed');
      const { sessionId } = await response.json();
      if (!sessionId) throw new Error('session_id_missing');
      report.session_id = sessionId;
      const questions = [process.env.AGENT_SMOKE_QUESTION || '请检索当前图谱及文献，说明SiC与抗氧化性能有哪些关联，并给出本轮证据引用。',
        process.env.AGENT_SMOKE_FOLLOWUP || '那在1500℃空气气氛下呢？请核对原文条件，不足时说明缺口。'];
      for (const question of questions) {
        const started = Date.now();
        console.log(JSON.stringify({ event: 'turn_started', turn: report.turns.length + 1, session_id: sessionId }));
        const stream = await post('/stream', { sessionId, messages: [{ role: 'user', content: question }],
          context: { projectId, graphId }, options: { allowTools: ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'search_history', 'read_evidence'],
            maxSteps: 6, maxTools: 8, timeoutMs: 300000 } });
        if (!stream.ok) throw new Error('agent_http_error');
        const text = await stream.text();
        const frames = text.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => JSON.parse(line.slice(5)));
        const final = frames.findLast((frame) => frame.type === 'final');
        const failures = frames.filter((frame) => frame.type === 'error');
        const checked = final && final.answer_check && final.answer_check.status;
        const supportedCitationDraft = checked === 'citations_valid_support_unverified';
        const publication = frames.findLast(frame => frame.type === 'tool_result'
          && frame.name === 'kg_search' && frame.ok && frame.data?.service_answer)?.data.service_answer;
        const serviceAnswerCompleted = checked === 'knowledge_service_answer' && !!publication
          && final.text === publication.text
          && JSON.stringify(final.service_references) === JSON.stringify(publication.references)
          && JSON.stringify(final.citation_bindings) === JSON.stringify(publication.citation_bindings);
        report.turns.push({ question, ms: Date.now() - started, answer: final && final.text || '',
          answer_check: final && final.answer_check || null,
          tools: frames.filter((frame) => frame.type === 'tool_result').map((frame) => ({ name: frame.name, ok: frame.ok, ms: frame.ms })),
          error_codes: failures.map((frame) => frame.code || 'agent_error'),
          received_done: frames.some((frame) => frame.type === 'done'),
          citation_draft_completed: supportedCitationDraft && !failures.length });
        Object.assign(report.turns.at(-1), {
          service_answer_completed: serviceAnswerCompleted && !failures.length,
          original_answer_unchanged: publication ? final?.text === publication.text : null,
          frames,
        });
        console.log(JSON.stringify({ event: 'turn_finished', turn: report.turns.length,
          ms: Date.now() - started, answer_check: checked || null, error_codes: failures.map((frame) => frame.code || 'agent_error') }));
        if (!report.turns.at(-1).citation_draft_completed && !report.turns.at(-1).service_answer_completed) {
          if (report.turns.length === 1) report.followup_skipped = 'first_turn_incomplete';
          break;
        }
      }
      const detailResponse = await fetch(`${base}/sessions/${sessionId}`, { signal: AbortSignal.timeout(8000) });
      const detail = await detailResponse.json();
      report.persisted_turns = Array.isArray(detail.messages) ? detail.messages.filter((m) => m.role === 'user').length : 0;
      report.conditions = detail.researchState && detail.researchState.conditions;
      report.persisted_answers_unchanged = report.turns.every((turn, index) => {
        const saved = (detail.messages || []).filter(m => m.role === 'assistant')[index];
        const final = turn.frames.findLast(f => f.type === 'final');
        return saved?.content === turn.answer
          && JSON.stringify(saved?.service_references) === JSON.stringify(final?.service_references);
      });
      try {
        report.process_metrics = await (await fetch(base + '/metrics', { signal: AbortSignal.timeout(8000) })).json();
        report.usage_scope = 'server_process_aggregate; knowledge-service usage and invoice not included';
      } catch { report.usage_scope = 'not_reported'; }
      report.status = report.turns.length === 2 && report.turns.every(turn => turn.service_answer_completed && turn.received_done)
        && report.persisted_turns === 2 && report.persisted_answers_unchanged ? 'service_answer_chain_completed'
        : report.turns.every((turn) => turn.citation_draft_completed && turn.received_done)
        && report.persisted_turns === 2 ? 'draft_chain_completed_support_unverified' : 'partial_or_failed';
    } catch (error) { report.blockers.push('real_chain_failed'); report.chain_error = safeError(error); }
  } else if (!report.blockers.length) report.status = 'preflight_ready';
  report.ended_at = new Date().toISOString();
  const dir = path.resolve(__dirname, '../data/agent/integration');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${checkOnly ? 'preflight' : 'smoke'}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, blockers: report.blockers, report: file }, null, 2));
  if (report.status === 'blocked' || report.status === 'partial_or_failed') process.exitCode = 1;
}

main().catch((error) => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
