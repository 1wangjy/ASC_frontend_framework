'use strict';

/** Archive checks are mechanics, NOT semantic verification or scientific accuracy. */
function inspectTurn(turn, scope) {
  const frames = Array.isArray(turn.frames) ? turn.frames : [];
  const final = frames.findLast(f => f.type === 'final');
  const results = frames.filter(f => f.type === 'tool_result');
  const cited = [...new Set([...String(final?.text || '').matchAll(/\[(ev_[a-f0-9]{24})\]/g)].map(m => m[1]))];
  const records = new Map();
  for (const f of results) {
    for (const e of f.data?.evidence || []) if (e.evidence_id) records.set(e.evidence_id, e);
    if (f.name === 'read_evidence' && f.ok && f.data?.evidence_id) records.set(f.data.evidence_id, f.data);
  }
  const invalid = cited.filter(id => !records.has(id) || records.get(id).citation_eligible !== true);
  const mismatched = cited.filter(id => {
    const e = records.get(id);
    return e && (e.scope?.project_id !== scope.projectId || e.scope?.graph_id !== scope.graphId);
  });
  const denials = results.filter(f => !f.ok && (f.data?.quota_exceeded || f.data?.retrieval_budget_exhausted));
  return {
    question: turn.question, mode: 'archived_real_model_and_API', elapsed_ms: turn.ms,
    final_state: final?.answer_check?.status || 'missing_final',
    mechanics: { has_final: Boolean(final?.text), has_done: frames.some(f => f.type === 'done'),
      citation_ids_exist_and_eligible: cited.length > 0 && invalid.length === 0,
      cited_scope_matches: cited.length > 0 && mismatched.length === 0,
      invalid_ids: invalid, mismatched_ids: mismatched },
    tools: results.map(f => ({ name: f.name, ok: f.ok, ms: f.ms,
      status: f.ok ? 'completed' : denials.includes(f) ? 'budget_denied' : 'error' })),
    tool_calls: results.length, budget_denials: denials.length,
    tool_errors: results.filter(f => !f.ok && !denials.includes(f)).length,
    cited_ids: cited, semantic_support_verified: false,
    effective_answer: 'not_scored_without_full_claim_review',
  };
}

/** Only local scripted fixtures. Never label these as live service measurements. */
async function runFixedCase(kind) {
  if (!['empty', 'unavailable'].includes(kind)) throw new Error('unknown_fixture');
  const registry = require('./tools');
  const { runAgent } = require('./loop');
  const original = registry.runTool;
  const frames = [];
  let step = 0;
  try {
    registry.runTool = async () => kind === 'empty'
      ? { ok: true, summary: '固定夹具：检索无结果', data: { evidence: [], references: [], scope: {} } }
      : { ok: false, summary: '固定夹具：知识服务不可用', data: { code: 'service_unavailable', request_sent: false } };
    await runAgent({ messages: [{ role: 'user', content: '固定问题：请给出当前图谱中的材料结论。' }],
      context: { projectId: 'fixture_project', graphId: 'fixture_graph' },
      options: { maxTools: 2, maxSteps: 2 }, emit: f => frames.push(f),
      provider: { available: true, async streamChat() {
        return ++step === 1 ? { tool_calls: [{ id: 'fixed-1', function: {
          name: 'kg_search', arguments: JSON.stringify({ query: '固定问题', project_id: 'fixture_project', graph_id: 'fixture_graph' }) } }] }
          : { content: kind === 'empty' ? '未找到证据，不能确定材料结论。' : '知识服务调用失败，不能判断材料结论。' };
      } } });
  } finally { registry.runTool = original; }
  const final = frames.findLast(f => f.type === 'final');
  return { kind, mode: 'offline_scripted_model_and_tool_fixture', frames,
    checks: { final_is_blocked: final?.answer_check?.status === 'blocked',
      published_citations_empty: final?.citations?.length === 0,
      done_emitted: frames.some(f => f.type === 'done'),
      tool_status_preserves_error: frames.some(f => f.type === 'tool_result' && f.ok === (kind === 'empty')) },
    limitation: 'Scripted model text; verifies controller safety only, not actual model response quality.' };
}

module.exports = { inspectTurn, runFixedCase };
