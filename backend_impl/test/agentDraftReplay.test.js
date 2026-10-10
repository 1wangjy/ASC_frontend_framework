'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessages, checkDraft, freezeCases, hash } = require('../src/agent/draftReplay');
const { DRAFT_BOUNDARIES } = require('../src/agent/draftBoundaries');
const fixed = { question: '固定问题', scope: { projectId: 'p', graphId: 'g' }, context: {},
  evidence: [{ evidence_id: 'ev_' + 'a'.repeat(24), text: '固定原文', citation_eligible: true,
    scope: { project_id: 'p', graph_id: 'g' }, title: '文献' }] };
test('A/B changes only the system constraint, not the fixed question/evidence', () => {
  const a = buildMessages(fixed, 'BASE', 'baseline');
  const b = buildMessages(fixed, 'BASE', 'bounded');
  assert.deepEqual(a[1], b[1]);
  assert.equal(b[0].content, a[0].content + '\n\n' + DRAFT_BOUNDARIES);
  assert.equal(hash(a[1]), hash(b[1]));
  assert.throws(() => buildMessages(fixed, 'BASE', 'other'));
});
test('fixed replay checks citations but cannot certify scientific support', () => {
  assert.equal(checkDraft(`片段表述 [${fixed.evidence[0].evidence_id}]`, fixed).answer_check.semantic_support_verified, false);
  assert.equal(checkDraft('[ev_' + 'b'.repeat(24) + ']', fixed).answer_check.status, 'blocked');
});
test('fixed evidence extraction rejects wrong scope and excludes generated KG text', () => {
  const frames = [{ type: 'tool_result', name: 'kg_search', ok: true, data: { final_answer: '生成内容' } },
    { type: 'tool_result', name: 'read_evidence', ok: true, data: fixed.evidence[0] }];
  const archive = { scope: fixed.scope, turns: [{ question: 'q1', frames }, { question: 'q2', frames }] };
  assert.equal(freezeCases(archive)[0].evidence.length, 1);
  assert.ok(!buildMessages(freezeCases(archive)[0], 'BASE', 'baseline')[1].content.includes('生成内容'));
  assert.throws(() => freezeCases({ ...archive, scope: { projectId: 'x', graphId: 'g' } }));
});
