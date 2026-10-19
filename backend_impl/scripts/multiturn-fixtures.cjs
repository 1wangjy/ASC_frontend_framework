'use strict';

const registry = require('../src/agent/tools');
const policy = require('../src/agent/policy');
const history = require('../src/agent/tools/searchHistory');
const read = require('../src/agent/tools/readEvidence');

// Only these deterministic adapters execute in the evaluation process.
// No network-backed production tool is invoked here.
function createFixtureExecutor(getCurrent) {
  return async function execute(name, rawArgs, ctx) {
    const current = getCurrent();
    const schema = registry.listTools().find(t => t.name === name);
    if (!schema) return { ok: false, summary: 'Unknown fixture tool', data: null };
    let args;
    try { args = policy.validateArgs(schema.parameters, rawArgs, name); }
    catch (e) { return { ok: false, summary: e.message, data: null }; }
    if (['search_history', 'read_evidence'].includes(name)) {
      return (name === 'search_history' ? history : read).execute(args, ctx);
    }
    if (!['kg_search', 'rag_search'].includes(name)) {
      return { ok: false, summary: '测试夹具未实现该外部工具，未发起服务请求', data: { fixture_unsupported: true } };
    }
    if ((args.project_id && args.project_id !== ctx.projectId)
      || (args.graph_id && args.graph_id !== ctx.graphId) || args.simulation_id) {
      return { ok: false, summary: '工具范围不一致', data: { code: 'scope_mismatch', request_sent: false } };
    }
    const scope = { project_id: ctx.projectId, graph_id: ctx.graphId };
    if (current.fixture_profile === 'retrieval_timeout' && current.turn === 2 && name === 'rag_search') {
      current.fixture_events.push({ kind: 'knowledge_tool_timeout', tool: name, injected: true });
      return { ok: false, summary: '知识检索单次超时（测试注入），本轮不再自动重试知识服务。',
        data: { fixture: true, code: 'knowledge_tool_timeout', scope } };
    }
    if (current.fixture_profile === 'empty_then_recover' && current.turn === 1) {
      current.fixture_events.push({ kind: 'empty_result', tool: name, injected: true });
      return { ok: true, summary: '测试夹具：检索完成，未找到对应答案或原文片段。',
        data: { fixture: true, scope, references: [], evidence: [], counts: { references: 0 } } };
    }
    const ordered = current.fixture_profile === 'ordered_service_answer';
    const distinct = current.fixture_profile === 'distinct_service_answers';
    const marker = distinct ? `${current.case_id}-round-${current.turn}` : 'fixture-only';
    const references = (ordered ? ['材料组成', '孔结构'] : ['资料片段']).map((label, i) => ({
      reference_id: `R${i + 1}`, source_file_id: `${marker}-${i + 1}`,
      document_title: `虚构测试资料：${label}，不用于科学判断`,
      original_quote: `【测试夹具${marker}】${label}片段，SiC/ASC相关。资料假设条件：1200℃、氩气、保温4小时，均不是用户设定。`,
      evidence_chunk: { chunk_id: `${marker}-chunk-${i + 1}` }
    }));
    const evidence = ctx.evidenceStore.register(references, scope);
    const focus = ordered && current.turn > 1 && /孔|por/i.test(args.query) ? '孔结构' : null;
    const text = ordered
      ? `【固定测试返回，非科学结论，轮次${current.turn}】\n${focus ? '本次聚焦SiC与ASC的孔结构。' : '1. 主题条目一：SiC与ASC的材料组成。\n2. 主题条目二：SiC与ASC的孔结构。'}\n引用：R1、R2。`
      : `【固定测试返回，非科学结论，标记${marker}】\n1. 主题条目一：SiC与ASC的材料组成。\n2. 主题条目二：SiC与ASC的孔结构。\n引用：R1。资料条件为1200℃氩气、保温4小时，不代表用户设定。`;
    return { ok: true, summary: '测试夹具返回原文片段与来源，不是实际知识服务',
      data: { fixture: true, scope, evidence, references,
        ...(name === 'kg_search' ? { service_answer: { text, references, scope,
          qa_run_id: `fixture-${current.case_id}-${current.turn}` } } : {}) } };
  };
}

function windowPrecondition(messages, researchState, fullHistory) {
  const modelInput = JSON.stringify({ messages, researchState });
  return { passed: !/LONG-X73|13\s*wt\s*%|保温\s*2\s*小时/i.test(modelInput)
      && fullHistory.some(m => /LONG-X73/.test(m.content)),
    recent_message_count: messages.length, full_history_message_count: fullHistory.length,
    reason: 'Early sample fields must be absent from the real model input and present in active stored history.' };
}
module.exports = { createFixtureExecutor, windowPrecondition };
