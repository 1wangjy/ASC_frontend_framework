'use strict';

/**
 * ragSearch — retrieval-oriented companion to kg_search.
 *
 * DOCUMENTED ALIAS: the external knowledge service (AGENT_KG_BASE_URL,
 * default http://127.0.0.1:5001) exposes exactly one read-only retrieval
 * surface, POST /api/graphrag/cod-query. There is no separate vector/RAG
 * endpoint, so this tool calls the same endpoint through `runQuery` from
 * kgSearch.js with a **retrieval-only** option profile:
 *   - enable_llm_answer_refinement: false  → returns raw retrieved evidence
 *     (subgraphs, verified paths, references) instead of a written answer.
 * Same transport, same mandatory-scope handling (shared `resolveScope`), same
 * read-only guarantees; behaviour differs only in that no answer-generation
 * stage runs.
 */

const kgSearch = require('./kgSearch');

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索查询（自然语言），用于召回相关图谱证据/文档片段。' },
    topK: { type: 'number', description: '返回的证据条目数量上限，默认 5，最大 20。', minimum: 1, maximum: 20 },
    project_id: { type: 'string', description: '本次检索使用的项目 ID（可选；不确定时先调用 kg_list）。' },
    graph_id: { type: 'string', description: '本次检索使用的图谱 ID（可选）。' },
    simulation_id: { type: 'string', description: '本次检索使用的仿真 ID（可选）。' },
  },
  required: ['query'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('rag_search: query must be a non-empty string');
  const topK = Math.min(20, Math.max(1, Math.round(Number(args.topK) || 5)));
  const pick = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  // Same key shape as kgSearch.validate so runQuery() can consume either.
  return {
    query,
    topK,
    projectId: pick(args.project_id),
    graphId: pick(args.graph_id),
    simulationId: pick(args.simulation_id),
  };
}

async function execute(args, ctx) {
  const outcome = await kgSearch.runQuery({ params: validate(args), ctx, retrievalOnly: true });
  if (!outcome.ok) return { ok: false, summary: outcome.summary, data: outcome.data };

  const { data, counts } = outcome.projected;
  const topQuote = data.references[0] && data.references[0].quote;
  const summary = [
    `retrieved ${counts.subgraphs} subgraph(s), ${counts.verified_paths} path(s), ${counts.references} reference(s)`,
    topQuote ? `top evidence: ${topQuote.slice(0, 300)}` : 'no reference quote available',
  ].join(' — ');
  return { ok: true, summary, data };
}

module.exports = {
  name: 'rag_search',
  description:
    '检索式 RAG 召回：从知识图谱/文献证据中返回相关子图、路径片段与原文引用（不生成成文答案）。'
    + '适合先收集证据再自行归纳；需要指定图谱范围（未指定时自动解析，无可用图谱则返回提示）。'
    + '实现上复用知识服务的 cod-query 检索接口（只读）。',
  parameters,
  validate,
  execute,
};
