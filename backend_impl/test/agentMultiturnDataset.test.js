'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'datasets/asc-multiturn-v1.json'), 'utf8'));

test('multiturn dataset counts and identifiers are consistent', () => {
  assert.equal(data.cases.length, 12);
  assert.equal(new Set(data.cases.map(c => c.id)).size, data.cases.length);
  assert.equal(data.total_conversations, data.cases.length);
  assert.equal(data.total_user_turns, data.cases.reduce((n, c) => n + c.turns.length, 0));
  assert.equal(data.total_user_turns, 52);
});
test('every user turn has state, semantic checks and a tool expectation', () => {
  for (const c of data.cases) for (const [i, t] of c.turns.entries()) {
    assert.equal(t.turn, i + 1);
    assert.ok(t.user.trim());
    assert.ok(t.expected.state && typeof t.expected.state === 'object');
    assert.ok(t.expected.checks.length);
    assert.ok(['optional', 'required', 'forbidden'].includes(t.expected.tools.policy));
  }
});
test('scores total 100 and infrastructure cases have declared harness boundaries', () => {
  assert.equal(Object.values(data.scoring.per_turn).reduce((n, v) => n + v, 0), 100);
  for (const c of data.cases.filter(c => c.fixture_profile || c.harness_setup)) {
    assert.ok(c.scoring_boundary);
  }
  assert.equal(data.status, 'designed_not_executed');
});
test('explicit tool-chain checks use same-turn IDs instead of hardcoded live evidence', () => {
  const c = data.cases.find(c => c.id === 'MT08');
  for (const t of [c.turns[0], c.turns[2]]) {
    assert.equal(t.expected.tools.sequence[1].tool, 'read_evidence');
    assert.match(t.expected.tools.sequence[1].argument_rule, /同轮/);
  }
});

const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'datasets/asc-multiturn-v2.json'), 'utf8'));
const allTurns = v2.cases.flatMap(c => c.turns);
const v2case = id => v2.cases.find(c => c.id === id);
test('v2 coverage and grading roles account for every turn', () => {
  assert.equal(v2.cases.length, 18);
  assert.equal(new Set(v2.cases.map(c => c.id)).size, 18);
  assert.equal(v2.total_user_turns, allTurns.length);
  assert.equal(allTurns.length, 96);
  for (const role of ['evaluation', 'setup', 'infrastructure_only']) {
    assert.equal(v2.counts[`${role}_turns`], allTurns.filter(t => t.score_role === role).length);
  }
  const checkIds = allTurns.flatMap(t => t.expected.checks.map(check => check.id));
  assert.equal(new Set(checkIds).size, checkIds.length);
  const knownDimensions = new Set(Object.values(v2.scoring.primary_reports).flat());
  for (const c of v2.cases) for (const [i, t] of c.turns.entries()) {
    assert.equal(t.turn, i + 1);
    assert.ok(t.user.trim());
    assert.ok(t.expected.checks.length);
    for (const check of t.expected.checks) {
      assert.ok(['model', 'system'].includes(check.owner));
      assert.ok(knownDimensions.has(check.dimension));
      assert.equal(check.owner === 'system', check.dimension === 'system_behavior');
      assert.ok(check.text && check.evidence);
    }
  }
  assert.equal(v2.scoring.overall_score, null);
  assert.ok(v2case('MT11').turns[1].expected.checks.every(c => c.owner === 'system'));
});

test('tool contracts match explicit instructions and the actual registry', () => {
  const { registeredNames } = require('../src/agent/tools');
  const known = new Set([...registeredNames(), '*']);
  for (const t of allTurns) {
    const rule = t.expected.tools;
    const names = [...(rule.names || []), ...(rule.any_of || []), ...(rule.allowed || []),
      ...(rule.forbidden || []), ...(rule.after_failure_forbidden || []),
      ...(rule.sequence || []).flatMap(s => s.tool ? [s.tool] : s.any_of)];
    for (const name of names) assert.ok(known.has(name), name);
    if (rule.policy === 'optional') assert.ok(rule.allowed.length);
    if (rule.policy === 'required') assert.ok(rule.names?.length || rule.any_of?.length || rule.sequence?.length);
  }
  for (const id of ['MT08', 'MT13', 'MT17']) {
    for (const t of v2case(id).turns.filter(t => t.expected.tools.sequence)) {
      assert.deepEqual(t.expected.tools.sequence.map(s => s.tool), ['kg_search', 'read_evidence']);
    }
  }
  for (const t of v2case('MT15').turns.slice(1, 3)) {
    assert.deepEqual(t.expected.tools.sequence.map(s => s.tool), ['rag_search', 'read_evidence']);
  }
});

test('evidence fixture permits identical IDs after same content is re-registered', () => {
  const { EvidenceStore } = require('../src/agent/evidence');
  const read = require('../src/agent/tools/readEvidence');
  const scope = { project_id: 'fixture-project', graph_id: 'fixture-graph' };
  const create = () => new EvidenceStore({ projectId: scope.project_id, graphId: scope.graph_id });
  const quote = [{ document_title: '测试夹具非科学证据', original_quote: '固定测试片段' }];
  const first = create();
  const id = first.register(quote, scope)[0].evidence_id;
  const second = create();
  assert.equal(second.read(id), null);
  assert.equal(second.register(quote, scope)[0].evidence_id, id);
  assert.ok(second.read(id));
  assert.throws(() => read.validate({ evidence_id: 'invalid' }), /invalid evidence_id/);
  assert.match(v2case('MT08').fixture_requirements.join(' '), /ID可相同/);
});

test('long-history fixture crosses actual application window without injecting canned assistant answers', () => {
  const { prepareConversation } = require('../src/agent/conversation');
  const c = v2case('MT18');
  const early = c.turns[1].user;
  // Synthetic messages here verify real window/state propagation, not model performance.
  const record = { messages: [] };
  for (const t of c.turns.slice(0, 21)) {
    const user = { role: 'user', content: t.user };
    record.researchState = prepareConversation(record, [user]).context.researchState;
    record.messages.push(user, { role: 'assistant', content: '收到' });
  }
  const prepared = prepareConversation(record, [{ role: 'user', content: c.turns[21].user }]);
  assert.equal(prepared.messages.length, 40);
  assert.ok(!prepared.messages.some(m => m.content === early));
  assert.ok(prepared.context.history.some(m => m.content === early));
  assert.ok(!JSON.stringify(prepared.context.researchState).includes('LONG-X73'));
  const modelInput = JSON.stringify({ messages: prepared.messages, state: prepared.context.researchState });
  assert.doesNotMatch(modelInput, /LONG-X73|13 wt%|保温2小时/);
  assert.equal(c.turns[21].expected.tools.names[0], 'search_history');
  assert.equal(c.turns.filter(t => t.score_role === 'setup').length, 21);
});

test('temperature fields and empty-result expectations are unambiguous', () => {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    assert.ok(!Object.hasOwn(value, 'temperature'), 'semantic state uses temperature_c');
    for (const child of Object.values(value)) visit(child);
  };
  allTurns.forEach(t => visit(t.expected.state));
  assert.deepEqual(v2case('MT02').turns[3].expected.state.temperatures_c, []);
  assert.equal(v2case('MT17').turns[3].expected.state.hold_hours, null);
  assert.match(v2case('MT17').fixture_requirements.join(' '), /不是超时或503/);
  assert.equal(v2.status, 'designed_not_executed');
});
