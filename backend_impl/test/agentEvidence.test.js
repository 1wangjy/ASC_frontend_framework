'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { EvidenceStore, checkAnswer, SAFE_NOTICE } = require('../src/agent/evidence');
const registry = require('../src/agent/tools');
const { runAgent } = require('../src/agent/loop');
const { createRouter } = require('../src/agent/route');
const sessions = require('../src/agent/sessions');
const scope = { project_id: 'p1', graph_id: 'g1' };
const ref = (overrides = {}) => ({ reference_id: 'ref1', project_id: 'p1', source_file_id: 'file1',
  document_title: '测试文献', original_quote: '在1500℃空气中观察到氧化层。', page_number: 3,
  evidence_chunk: { chunk_id: 'chunk1', evidence_type: 'text' }, ...overrides });
const store = () => new EvidenceStore({ projectId: 'p1', graphId: 'g1' });

test('evidence IDs are stable and scope/content sensitive, with no invented document revision', () => {
  const a = store(); const b = store();
  const [one] = a.register([ref()], scope);
  const [two] = b.register([ref()], scope);
  assert.equal(one.evidence_id, two.evidence_id);
  assert.equal(one.source_revision, null);
  assert.equal(one.support_status, 'unverified');
  assert.ok(one.limitations.includes('document_revision_unknown'));
  const [changed] = b.register([ref({ original_quote: '不同文本' })], scope);
  assert.notEqual(one.evidence_id, changed.evidence_id);
});

test('original returned quote survives intact beyond the old 400-character preview', () => {
  const quote = '原文片段'.repeat(600);
  const [item] = store().register([ref({ original_quote: quote })], scope);
  assert.equal(item.text, quote);
  assert.equal(item.locator.page, 3);
});

test('oversized quotes are explicitly omitted, never silently truncated into evidence', () => {
  const ledger = store();
  assert.deepEqual(ledger.register([ref({ original_quote: '文'.repeat(8001) })], scope), []);
  assert.equal(ledger.records.size, 0);
});

test('missing text or source is not citable, and summary is never substituted for a quote', () => {
  const ledger = store();
  const [noQuote] = ledger.register([ref({ original_quote: '', final_answer: '模型生成答案' })], scope);
  assert.equal(noQuote.citation_eligible, false);
  assert.equal(noQuote.text, '');
  const [noSource] = ledger.register([{ original_quote: '原文' }], scope);
  assert.equal(noSource.citation_eligible, false);
});

test('wrong project or graph prevents citation eligibility', () => {
  assert.equal(store().register([ref()], { project_id: 'p2', graph_id: 'g1' })[0].exclusion_reason, 'scope_mismatch');
  assert.equal(store().register([ref()], { project_id: 'p1', graph_id: 'g2' })[0].citation_eligible, false);
  assert.equal(store().register([ref({ project_id: 'p2' })], scope)[0].citation_eligible, false);
});

for (const field of ['synthetic_bridge', 'not_source_fact', 'requires_human_calibration']) {
  test(`review flag ${field} prevents citation`, () => {
    const [item] = store().register([ref({ metadata: { [field]: true } })], scope);
    assert.equal(item.citation_eligible, false);
  });
}

test('unsupported review is exclusionary and a duplicate cannot clear it', () => {
  const ledger = store();
  const [initial] = ledger.register([ref()], scope);
  ledger.register([ref({ relation_status: 'reviewed_unsupported' })], scope);
  ledger.register([ref()], scope);
  assert.equal(ledger.read(initial.evidence_id).citation_eligible, false);
});

test('missing, fabricated and malformed citation IDs block the draft', () => {
  const ledger = store(); ledger.retrievalAttempted = true;
  for (const text of ['SiC一定提高抗氧化性能。', '[ev_000000000000000000000000]', '[ev_fake]']) {
    const result = checkAnswer(text, ledger);
    assert.equal(result.answer_check.status, 'blocked');
    assert.equal(result.text, SAFE_NOTICE);
  }
});

test('a false review flag cannot override a true flag in another API field', () => {
  const [item] = store().register([ref({ metadata: { synthetic_bridge: true },
    review_flags: { synthetic_bridge: false } })], scope);
  assert.equal(item.citation_eligible, false);
});

test('valid citation is still a pending draft, not a semantic support pass', () => {
  const ledger = store(); ledger.retrievalAttempted = true;
  const [item] = ledger.register([ref()], scope);
  const result = checkAnswer(`引文描述观察到氧化层。[${item.evidence_id}]`, ledger);
  assert.equal(result.answer_check.status, 'citations_valid_support_unverified');
  assert.equal(result.answer_check.semantic_support_verified, false);
  assert.match(result.text, /待核验草稿/);
  assert.equal(result.citations[0].evidence_id, item.evidence_id);
});

test('new turn cannot use an old evidence ID unless the API returned it again', () => {
  const first = store(); const second = store();
  const [item] = first.register([ref()], scope);
  assert.equal(checkAnswer(`结论[${item.evidence_id}]`, second).answer_check.status, 'blocked');
});

test('read_evidence exposes only current ledger items, with no arbitrary path or remote reads', async () => {
  const ledger = store();
  const [item] = ledger.register([ref()], scope);
  const read = await registry.runTool('read_evidence', { evidence_id: item.evidence_id }, { evidenceStore: ledger });
  assert.equal(read.ok, true);
  assert.equal(read.data.text, ref().original_quote);
  assert.equal(read.data.usableAsVerifiedFact, false);
  const missing = await registry.runTool('read_evidence', { evidence_id: item.evidence_id }, { evidenceStore: store() });
  assert.equal(missing.ok, false);
});

test('knowledge API adapter registers quotes but not generated final_answer', async (t) => {
  const previous = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ success: true, data: {
      qa_run_id: 'fixture_run', references: [ref()], final_answer: '不应成为原文的生成文字',
    } }), { status: 200 });
  };
  t.after(() => { global.fetch = previous; });
  for (const name of ['kg_search', 'rag_search']) {
    const ledger = store();
    const result = await registry.runTool(name, { query: 'SiC' }, { projectId: 'p1', graphId: 'g1', evidenceStore: ledger });
    assert.equal(result.ok, true);
    assert.equal(result.data.evidence.length, 1);
    assert.equal(ledger.snapshot()[0].text, ref().original_quote);
    assert.equal(ledger.snapshot()[0].acquisition.qa_run_id, 'fixture_run');
    assert.equal(result.data.evidence_contract.semantic_support_verified, false);
  }
  assert.equal(requests[0].enable_llm_answer_refinement, true);
  assert.equal(requests[1].enable_llm_answer_refinement, false);
});

test('failed retrieval never leaks a streamed unchecked draft as final or delta', async (t) => {
  const oldFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ success: false, error: 'fixture unavailable' }), { status: 503 });
  t.after(() => { global.fetch = oldFetch; });
  let step = 0;
  const frames = [];
  const provider = { available: true, async streamChat({ onDelta }) {
    onDelta('未经核验的机理断言');
    if (step++ === 0) return { content: '未经核验的机理断言', tool_calls: [{ id: 'kg1', function: {
      name: 'kg_search', arguments: JSON.stringify({ query: 'SiC' }),
    } }] };
    return { content: '未经核验的机理断言', tool_calls: [] };
  } };
  await runAgent({ messages: [{ role: 'user', content: 'SiC机理？' }], context: { projectId: 'p1', graphId: 'g1' },
    provider, emit: (frame) => frames.push(frame) });
  assert.equal(frames.find((f) => f.type === 'final').answer_check.status, 'blocked');
  assert.ok(!JSON.stringify(frames.filter((f) => ['final', 'message_delta'].includes(f.type))).includes('未经核验的机理断言'));
});

test('large retrieval keeps readable evidence IDs in the model budget and full quotes in the ledger', async (t) => {
  const previous = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ success: true, data: {
    final_answer: '生成答案'.repeat(5000),
    references: Array.from({ length: 20 }, (_, i) => ref({ source_file_id: `file${i}`, original_quote: '原文'.repeat(1500) })),
    verified_paths: Array.from({ length: 20 }, () => ({ candidate_path: { natural_language_path: '路径'.repeat(2000) }, reason: '说明'.repeat(2000) })),
    citation_bindings: Array.from({ length: 20 }, () => ({ reference_id: 'ref1', answer_excerpt: '摘要'.repeat(5000) })),
  } }), { status: 200 });
  t.after(() => { global.fetch = previous; });
  const ledger = store();
  const result = await registry.runTool('kg_search', { query: 'SiC', topK: 20 },
    { projectId: 'p1', graphId: 'g1', evidenceStore: ledger });
  assert.equal(result.ok, true);
  assert.equal(result.data.evidence.length, 5);
  assert.ok(JSON.stringify(result).length < 12000);
  assert.equal(ledger.snapshot().length, 20);
  assert.equal(ledger.snapshot()[0].text.length, 3000);
});

test('retrieval cap preserves time for evidence reading and does not call the service a third time', async (t) => {
  const previous = global.fetch;
  const oldCap = process.env.AGENT_MAX_RETRIEVAL_CALLS;
  process.env.AGENT_MAX_RETRIEVAL_CALLS = '2';
  let requests = 0;
  global.fetch = async () => { requests += 1;
    return new Response(JSON.stringify({ success: true, data: { references: [ref()] } }), { status: 200 }); };
  t.after(() => { global.fetch = previous;
    if (oldCap === undefined) delete process.env.AGENT_MAX_RETRIEVAL_CALLS;
    else process.env.AGENT_MAX_RETRIEVAL_CALLS = oldCap; });
  let step = 0;
  const provider = { available: true, async streamChat() {
    if (step++ === 0) return { content: '', tool_calls: Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`,
      function: { name: 'rag_search', arguments: JSON.stringify({ query: `问题${i}` }) } })) };
    return { content: '证据不足', tool_calls: [] };
  } };
  const frames = [];
  await runAgent({ messages: [{ role: 'user', content: '测试' }], context: { projectId: 'p1', graphId: 'g1' },
    provider, emit: (frame) => frames.push(frame) });
  assert.equal(requests, 2);
  const limited = frames.find((frame) => frame.type === 'tool_result' && frame.data.retrieval_budget_exhausted);
  assert.equal(limited.ok, false);
  assert.equal(limited.data.evidence[0].citation_eligible, true);
});

test('HTTP full cycle reads evidence, checks citations, and saves quote and check for review', async (t) => {
  const oldMode = process.env.AGENT_ANSWER_MODE;
  process.env.AGENT_ANSWER_MODE = 'evidence_draft';
  t.after(() => { if (oldMode === undefined) delete process.env.AGENT_ANSWER_MODE; else process.env.AGENT_ANSWER_MODE = oldMode; });
  const parent = path.resolve(__dirname, '../data/agent/test-runs');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'evidence-'));
  const oldDir = process.env.AGENT_SESSION_DIR;
  process.env.AGENT_SESSION_DIR = dir;
  let phase = 0;
  let evidenceId;
  const provider = { available: true, async streamChat({ messages, onDelta }) {
    if (phase++ === 0) return { content: '', tool_calls: [{ id: 'kg1', function: {
      name: 'rag_search', arguments: JSON.stringify({ query: '氧化层' }),
    } }] };
    if (phase === 2) {
      const result = JSON.parse(messages.find((m) => m.role === 'tool').content);
      evidenceId = result.data.evidence[0].evidence_id;
      return { content: '', tool_calls: [{ id: 'read1', function: {
        name: 'read_evidence', arguments: JSON.stringify({ evidence_id: evidenceId }),
      } }] };
    }
    const content = `观察到氧化层。[${evidenceId}]`;
    onDelta(content);
    return { content, tool_calls: [] };
  } };
  const app = express(); app.use(express.json()); app.use('/api/agent', createRouter({ provider }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/agent`;
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => String(url).startsWith(base) ? oldFetch(url, options)
    : new Response(JSON.stringify({ success: true, data: { references: [ref()], qa_run_id: 'fixture_run' } }), { status: 200 });
  t.after(async () => {
    global.fetch = oldFetch;
    if (oldDir === undefined) delete process.env.AGENT_SESSION_DIR; else process.env.AGENT_SESSION_DIR = oldDir;
    sessions.resetRuntime();
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const post = (endpoint, body) => fetch(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const { sessionId } = await (await post('/sessions', {})).json();
  const response = await post('/stream', { sessionId, messages: [{ role: 'user', content: '氧化层？' }],
    context: { projectId: 'p1', graphId: 'g1' }, options: { allowTools: ['rag_search', 'read_evidence'] } });
  const frames = await response.text();
  assert.match(frames, /citations_valid_support_unverified/);
  const detail = await (await fetch(`${base}/sessions/${sessionId}`)).json();
  const saved = detail.messages[1];
  assert.equal(saved.answer_check.semantic_support_verified, false);
  assert.equal(saved.evidence[0].text, ref().original_quote);
  assert.equal(saved.citations[0].evidence_id, evidenceId);
  assert.match(saved.content, /待核验草稿/);
});
