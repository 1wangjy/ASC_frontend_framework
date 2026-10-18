'use strict';
const crypto = require('node:crypto');
const { EvidenceStore, checkAnswer } = require('./evidence');
const { DRAFT_BOUNDARIES } = require('./draftBoundaries');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function freezeCases(archive) {
  if (archive.turns?.length !== 2 || !archive.scope?.graphId) throw new Error('invalid_source_archive');
  return archive.turns.map((turn, index) => {
    const quotes = turn.frames.filter(f => f.type === 'tool_result' && f.name === 'read_evidence' && f.ok)
      .map(f => f.data);
    if (!quotes.length || quotes.some(e => !e.text || !e.citation_eligible
      || e.scope?.project_id !== archive.scope.projectId || e.scope?.graph_id !== archive.scope.graphId)) {
      throw new Error('invalid_fixed_evidence');
    }
    return { case_id: `C${index + 1}`, question: turn.question, scope: archive.scope,
      context: index ? { previous_question: archive.turns[0].question,
        object: 'ASC（Al2O3-SiC-C）浇注料中的SiC与抗氧化性能', temperature: '1500℃', atmosphere: '空气' } : {},
      evidence: quotes, evidence_sha256: hash(quotes), original_answer: turn.frames.findLast(f => f.type === 'final')?.text };
  });
}
function buildMessages(fixed, baseline, variant) {
  if (!['baseline', 'bounded'].includes(variant)) throw new Error('unknown_variant');
  return [{ role: 'system', content: baseline + (variant === 'bounded' ? '\n\n' + DRAFT_BOUNDARIES : '') },
    { role: 'user', content: '这是固定证据的草稿生成测试，不执行任何工具。只根据下列API原文片段回答问题；引用使用所给evidence_id。不能假称已读取全文或语义核验通过。\n'
      + JSON.stringify({ question: fixed.question, context: fixed.context, scope: fixed.scope,
        evidence: fixed.evidence.map(e => ({ evidence_id: e.evidence_id, title: e.title, text: e.text,
          locator: e.locator, limitations: e.limitations })) }) }];
}
function checkDraft(text, fixed) {
  const store = new EvidenceStore(fixed.scope); store.retrievalAttempted = true;
  for (const e of fixed.evidence) store.records.set(e.evidence_id, e);
  return checkAnswer(text, store);
}
module.exports = { hash, freezeCases, buildMessages, checkDraft };
