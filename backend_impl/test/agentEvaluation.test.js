'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectTurn, runFixedCase } = require('../src/agent/evaluation');
const id = 'ev_' + 'a'.repeat(24);
const scope = { projectId: 'p', graphId: 'g' };
function turn(record) {
  return { question: '固定问题', ms: 7, frames: [
    { type: 'tool_result', name: 'read_evidence', ok: true, data: record },
    { type: 'final', text: `结论 [${id}]`, answer_check: { status: 'citations_valid_support_unverified' } },
    { type: 'done' }] };
}
test('valid citation IDs never become a scientific accuracy score', () => {
  const result = inspectTurn(turn({ evidence_id: id, citation_eligible: true,
    scope: { project_id: 'p', graph_id: 'g' } }), scope);
  assert.equal(result.mechanics.citation_ids_exist_and_eligible, true);
  assert.equal(result.semantic_support_verified, false);
  assert.equal(result.effective_answer, 'not_scored_without_full_claim_review');
});
test('archive inspection detects missing or wrong-scope citations', () => {
  assert.deepEqual(inspectTurn(turn({}), scope).mechanics.invalid_ids, [id]);
  assert.deepEqual(inspectTurn(turn({ evidence_id: id, citation_eligible: true,
    scope: { project_id: 'other', graph_id: 'g' } }), scope).mechanics.mismatched_ids, [id]);
});
test('empty and unavailable fixed results safely finish without fabricated citations', async () => {
  for (const kind of ['empty', 'unavailable']) {
    const result = await runFixedCase(kind);
    assert.ok(Object.values(result.checks).every(Boolean), JSON.stringify(result.checks));
    assert.equal(result.mode, 'offline_scripted_model_and_tool_fixture');
  }
});
