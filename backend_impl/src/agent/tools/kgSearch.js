'use strict';

/**
 * kgSearch — read-only knowledge-graph / RAG query against the external
 * GraphRAG service (AGENT_KG_BASE_URL, default http://127.0.0.1:5001).
 *
 * Surface mirrors the existing frontend call in `src/api/graph.js`
 * (`codGraphRAGQuery` → POST /api/graphrag/cod-query). This tool is READ-ONLY:
 * graph-mutation proposals, KG growth application, skill evolution and
 * self-evolving-agent bookkeeping are all disabled, and the route itself does
 * not mutate the graph.
 *
 * `ragSearch.js` reuses `codQuery` with a retrieval-only option profile
 * (answer refinement off) — the service exposes no separate RAG endpoint, see
 * that file for the documented aliasing.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:5001';
const TIMEOUT_MS = Number(process.env.AGENT_KG_TIMEOUT_MS || 180000);

function codQueryUrl() {
  const base = String(process.env.AGENT_KG_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return `${base}/api/graphrag/cod-query`;
}

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索问题（自然语言，中文或英文）。' },
    topK: { type: 'number', description: '返回的子图/路径数量上限，默认 5，最大 20。', minimum: 1, maximum: 20 },
  },
  required: ['query'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('kg_search: query must be a non-empty string');
  const topK = Math.min(20, Math.max(1, Math.round(Number(args.topK) || 5)));
  return { query, topK };
}

/**
 * Build the cod-query payload. `retrievalOnly` turns off the LLM answer
 * refinement stage (used by rag_search to return evidence, not a written answer).
 */
function buildPayload({ query, topK, retrievalOnly }, ctx) {
  const payload = {
    question: query,
    top_k_subgraphs: topK,
    top_k_paths: Math.max(topK, 8),
    // Non-mutating, cheapest-useful profile. Scope from the request context
    // when available; otherwise fall back to the latest graph explicitly.
    allow_latest_fallback: true,
    enable_verification: true,
    enable_llm_decomposition_fallback: false,
    enable_llm_path_verification: false,
    enable_llm_reasoning_judge: false,
    enable_llm_answer_refinement: !retrievalOnly,
    enable_graph_mutation_proposal: false,
    enable_kg_growth_direct_apply: false,
    enable_self_evolving_agent: false,
    enable_skill_reuse: false,
    enable_skill_evolution: false,
    show_audit_appendix: false,
    debug: false,
    audit: false,
  };
  const projectId = (ctx && ctx.projectId) || undefined;
  if (projectId) payload.project_id = String(projectId);
  return payload;
}

/** Perform the POST and normalise the service envelope. */
async function codQuery({ payload, signal }) {
  const url = codQueryUrl();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: combined,
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, summary: `knowledge-graph service unreachable at ${url} (${reason})`, data: { url } };
  }

  const text = await response.text();
  let envelope = null;
  try {
    envelope = JSON.parse(text);
  } catch {
    return {
      ok: false,
      summary: `knowledge-graph service returned non-JSON (HTTP ${response.status})`,
      data: { url, status: response.status, body: text.slice(0, 500) },
    };
  }

  if (!response.ok || envelope.success !== true) {
    const errorText = envelope.error || envelope.message || `HTTP ${response.status}`;
    return { ok: false, summary: `knowledge-graph query failed: ${String(errorText).slice(0, 300)}`, data: { url, status: response.status } };
  }
  return { ok: true, data: envelope.data || {}, url };
}

function top(items, n) {
  return Array.isArray(items) ? items.slice(0, n) : [];
}

/** Compact, bounded projection of the CoD result for the model + client. */
function projectResult(result, { topK, includeAnswer }) {
  const subgraphs = top(result.retrieved_subgraphs, topK).map((sg) => ({
    nodes: Array.isArray(sg.retrieved_nodes) ? sg.retrieved_nodes.length : 0,
    edges: Array.isArray(sg.retrieved_edges) ? sg.retrieved_edges.length : 0,
    evidence_chunks: Array.isArray(sg.evidence_chunks) ? sg.evidence_chunks.length : 0,
    score: sg.subgraph_score,
    seeds: top(sg.seed_nodes, 5).map((n) => n.name || n.uuid),
  }));
  const paths = top(result.verified_paths, topK).map((p) => {
    const candidate = p.candidate_path || {};
    return {
      path_id: p.path_id,
      path: String(candidate.natural_language_path || '').slice(0, 800),
      path_type: candidate.path_type,
      validity: p.path_validity,
      evidence_sufficiency: p.evidence_sufficiency,
      decision: p.decision,
      reason: String(p.reason || '').slice(0, 300),
    };
  });
  const references = top(result.references, topK).map((ref) => ({
    title: ref.document_title || ref.source_filename || ref.reference_id,
    paper_id: ref.paper_id,
    doi: ref.doi,
    quote: String(ref.original_quote || '').slice(0, 400),
  }));

  const counts = {
    subgraphs: Array.isArray(result.retrieved_subgraphs) ? result.retrieved_subgraphs.length : 0,
    candidate_paths: Array.isArray(result.candidate_paths) ? result.candidate_paths.length : 0,
    verified_paths: Array.isArray(result.verified_paths) ? result.verified_paths.length : 0,
    references: Array.isArray(result.references) ? result.references.length : 0,
    citation_bindings: Array.isArray(result.citation_bindings) ? result.citation_bindings.length : 0,
  };

  const data = {
    qa_run_id: result.qa_run_id,
    question: result.question,
    counts,
    subgraphs,
    paths,
    references,
  };
  if (includeAnswer) {
    data.final_answer = String(result.final_answer || '').slice(0, 4000);
    data.citation_bindings = top(result.citation_bindings, topK);
  }
  return { data, counts };
}

function summarize({ counts, data }, includeAnswer) {
  const parts = [
    `${counts.subgraphs} subgraph(s), ${counts.verified_paths} verified path(s), ${counts.references} reference(s)`,
  ];
  if (includeAnswer) {
    parts.push(data.final_answer ? `answer: ${data.final_answer.slice(0, 600)}` : 'no grounded answer produced');
  } else {
    parts.push('evidence-only (answer refinement disabled)');
  }
  return parts.join(' — ');
}

async function execute(args, ctx) {
  const { query, topK } = validate(args);
  const outcome = await codQuery({ payload: buildPayload({ query, topK, retrievalOnly: false }, ctx), signal: ctx && ctx.signal });
  if (!outcome.ok) return { ok: false, summary: outcome.summary, data: outcome.data };
  const projected = projectResult(outcome.data, { topK, includeAnswer: true });
  return { ok: true, summary: summarize(projected, true), data: projected.data };
}

module.exports = {
  name: 'kg_search',
  description:
    '在知识图谱（GraphRAG）中做只读检索并返回有路径/引用支撑的答案，用于材料配方、工艺、机理等事实性问题。'
    + '返回子图、验证路径与文献引用；不会修改图谱。',
  parameters,
  validate,
  execute,
  // shared with rag_search
  codQuery,
  buildPayload,
  projectResult,
};
