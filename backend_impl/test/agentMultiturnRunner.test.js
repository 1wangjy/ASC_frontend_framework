'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFixtureExecutor, windowPrecondition } = require('../scripts/multiturn-fixtures.cjs');
const { checkToolRule } = require('../scripts/agent-multiturn-run.cjs');
const { EvidenceStore } = require('../src/agent/evidence');
const { checkLongQuery } = require('../scripts/agent-multiturn-report.cjs');
const context = () => ({ projectId: 'fixture-project', graphId: 'fixture-graph', hasSession: true,
  history: [], evidenceStore: new EvidenceStore({ projectId: 'fixture-project', graphId: 'fixture-graph' }) });

test('long-history report checks actual query inheritance, not a correct-looking final answer', () => {
  const call = query => ({ name: 'kg_search', args: { query } });
  const query = 'SiC 13 wt%，1500℃空气，保温2小时';
  assert.equal(checkLongQuery([call(query)]).passed, true);
  assert.equal(checkLongQuery([call('SiC 13 wt% 1500℃空气')]).passed, false);
  assert.equal(checkLongQuery([call(query + ' ASC铝硅碳')]).passed, false);
  assert.equal(checkLongQuery([call(query + '，1450℃氮气')]).passed, false);
  assert.equal(checkLongQuery([call(query), call('SiC')]).passed, false);
  assert.equal(checkLongQuery([]).passed, false);
});
test('same evidence is re-registered per turn and read uses actual generated IDs', async () => {
  const current = { case_id: 'MT08', turn: 1, fixture_profile: 'evidence_catalog', fixture_events: [] };
  const run = createFixtureExecutor(() => current);
  const first = context();
  const one = await run('kg_search', { query: 'SiC' }, first);
  const id = one.data.evidence[0].evidence_id;
  assert.equal((await run('read_evidence', { evidence_id: id }, first)).ok, true);
  const next = context();
  assert.equal((await run('read_evidence', { evidence_id: id }, next)).ok, false);
  current.turn = 3;
  const two = await run('kg_search', { query: 'SiC 1500℃' }, next);
  assert.equal(two.data.evidence[0].evidence_id, id);
  assert.equal((await run('read_evidence', { evidence_id: id }, next)).ok, true);
});
test('timeout, empty result and recovery are distinct fixture outcomes', async () => {
  const current = { case_id: 'MT10', turn: 2, fixture_profile: 'retrieval_timeout', fixture_events: [] };
  const run = createFixtureExecutor(() => current);
  const ctx = context();
  assert.equal((await run('rag_search', { query: 'SiC' }, ctx)).data.code, 'knowledge_tool_timeout');
  current.turn = 4;
  assert.ok((await run('kg_search', { query: 'SiC' }, ctx)).data.service_answer);
  current.fixture_profile = 'empty_then_recover'; current.turn = 1;
  const empty = await run('kg_search', { query: 'SiC' }, context());
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.data.evidence, []);
  assert.equal(empty.data.service_answer, undefined);
});
test('ordered and distinct-answer fixtures preserve separate sources without inventing rag answers', async () => {
  const current = { case_id: 'MT13', turn: 1, fixture_profile: 'ordered_service_answer', fixture_events: [] };
  const run = createFixtureExecutor(() => current);
  const one = await run('kg_search', { query: 'SiC' }, context());
  assert.equal(one.data.references.length, 2);
  assert.notEqual(one.data.references[0].source_file_id, one.data.references[1].source_file_id);
  assert.match(one.data.service_answer.text, /2\. 主题条目二/);
  assert.equal((await run('rag_search', { query: 'SiC' }, context())).data.service_answer, undefined);
  current.fixture_profile = 'distinct_service_answers'; current.case_id = 'MT14';
  const a = await run('kg_search', { query: 'SiC' }, context()); current.turn = 2;
  const b = await run('kg_search', { query: 'SiC' }, context());
  assert.notEqual(a.data.service_answer.text, b.data.service_answer.text);
  assert.notEqual(a.data.evidence[0].evidence_id, b.data.evidence[0].evidence_id);
});
test('window precondition rejects information leaked through topicRequest or repeated assistant text', () => {
  const history = [{ role: 'user', content: 'LONG-X73 SiC13 wt% 保温2小时' }];
  assert.equal(windowPrecondition([{ role: 'user', content: '请找回试样' }], {}, history).passed, true);
  assert.equal(windowPrecondition([], { topicRequest: 'LONG-X73' }, history).passed, false);
  assert.equal(windowPrecondition([{ role: 'assistant', content: '保温 2 小时' }], {}, history).passed, false);
});
test('tool checker detects reversed chains and requests for forbidden retrieval after timeout', () => {
  const rule = { policy: 'required', sequence: [{ tool: 'rag_search' }, { tool: 'read_evidence' }] };
  assert.equal(checkToolRule(rule, [{ name: 'read_evidence' }, { name: 'rag_search' }]), false);
  assert.equal(checkToolRule(rule, [{ name: 'rag_search' }, { name: 'read_evidence' }]), true);
  const retryRule = { policy: 'required', names: ['rag_search'], after_failure_forbidden: ['kg_search', 'rag_search'] };
  assert.equal(checkToolRule(retryRule, [{ id: 'a', name: 'rag_search' }, { id: 'b', name: 'kg_search' }], [{ id: 'a', ok: false }]), false);
  assert.equal(checkToolRule(retryRule, [{ id: 'a', name: 'rag_search' }], [{ id: 'a', ok: false }]), true);
});
