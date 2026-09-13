'use strict';

/**
 * ragSearch — retrieval-oriented companion to kg_search.
 *
 * DOCUMENTED ALIAS: the external knowledge service (AGENT_KG_BASE_URL,
 * default http://127.0.0.1:5001) exposes exactly one read-only retrieval
 * surface, POST /api/graphrag/cod-query. There is no separate vector/RAG
 * endpoint, so this tool calls the same endpoint through `codQuery` from
 * kgSearch.js with a **retrieval-only** option profile:
 *   - enable_llm_answer_refinement: false  → returns raw retrieved evidence
 *     (subgraphs, verified paths, references) instead of a written answer.
 * Same transport, same policy, same read-only guarantees; behaviour differs
 * only in that no answer-generation stage runs.
 */

const kgSearch = require('./kgSearch');

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索查询（自然语言），用于召回相关图谱证据/文档片段。' },
    topK: { type: 'number', description: '返回的证据条目数量上限，默认 5，最大 20。', minimum: 1, maximum: 20 },
  },
  required: ['query'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('rag_search: query must be a non-empty string');
  const topK = Math.min(20, Math.max(1, Math.round(Number(args.topK) || 5)));
  return { query, topK };
}

async function execute(args, ctx) {
  const { query, topK } = validate(args);
  const payload = kgSearch.buildPayload({ query, topK, retrievalOnly: true }, ctx);
  const outcome = await kgSearch.codQuery({ payload, signal: ctx && ctx.signal });
  if (!outcome.ok) return { ok: false, summary: outcome.summary, data: outcome.data };

  const projected = kgSearch.projectResult(outcome.data, { topK, includeAnswer: false });
  const topQuote = projected.data.references[0] && projected.data.references[0].quote;
  const summary = [
    `retrieved ${projected.counts.subgraphs} subgraph(s), ${projected.counts.verified_paths} path(s), ${projected.counts.references} reference(s)`,
    topQuote ? `top evidence: ${topQuote.slice(0, 300)}` : 'no reference quote available',
  ].join(' — ');
  return { ok: true, summary, data: projected.data };
}

module.exports = {
  name: 'rag_search',
  description:
    '检索式 RAG 召回：从知识图谱/文献证据中返回相关子图、路径片段与原文引用（不生成成文答案）。'
    + '适合先收集证据再自行归纳；实现上复用知识服务的 cod-query 检索接口（只读）。',
  parameters,
  validate,
  execute,
};
