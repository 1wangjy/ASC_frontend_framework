'use strict';

/**
 * kgSearch — read-only knowledge-graph query against the external GraphRAG
 * service (AGENT_KG_BASE_URL, default http://127.0.0.1:5001).
 *
 * Surface mirrors the existing frontend call in `src/api/graph.js`
 * (`codGraphRAGQuery` → POST /api/graphrag/cod-query).
 *
 * SCOPE IS MANDATORY. The service rejects a scope-less query with
 *   400 {"error":"请选择目标知识图谱后再查询；系统不会自动切换到最新 Graph。"}
 * and `allow_latest_fallback: true` does NOT bypass that check (verified
 * against the running 5001 service). Therefore this tool:
 *   1. uses project_id/graph_id/simulation_id from the args or ctx.projectId;
 *   2. otherwise resolves a scope via kg_list discovery (catalog → graphs,
 *      project list → projects that already carry a graph_id/simulation);
 *   3. if nothing is queryable, returns ok:false WITHOUT calling cod-query, with
 *      the "no graph available" message and data {count: 0}.
 *
 * READ-ONLY: graph-mutation proposals, KG growth application, skill reuse /
 * evolution, the self-evolving agent AND answer-cognition memory are all
 * disabled — the route never mutates the graph and the tool never writes
 * cognition memory.
 *
 * `ragSearch.js` reuses `codQuery`/`resolveScope` with a retrieval-only option
 * profile (answer refinement off); the service has no separate RAG endpoint.
 */

const kgList = require('./kgList');

const TIMEOUT_MS = Number(process.env.AGENT_KG_TIMEOUT_MS || 180000);

function codQueryUrl() {
  return `${kgList.kgBaseUrl()}/api/graphrag/cod-query`;
}

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索问题（自然语言，中文或英文）。' },
    topK: { type: 'number', description: '返回的子图/路径数量上限，默认 5，最大 20。', minimum: 1, maximum: 20 },
    project_id: { type: 'string', description: '本次检索使用的项目 ID（可选；不确定时先调用 kg_list）。' },
    graph_id: { type: 'string', description: '本次检索使用的图谱 ID（可选，与 project_id 二选一即可）。' },
    simulation_id: { type: 'string', description: '本次检索使用的仿真 ID（可选，替代 project_id/graph_id）。' },
  },
  required: ['query'],
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) throw new Error('kg_search: query must be a non-empty string');
  const topK = Math.min(20, Math.max(1, Math.round(Number(args.topK) || 5)));
  const pick = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  return {
    query,
    topK,
    projectId: pick(args.project_id),
    graphId: pick(args.graph_id),
    simulationId: pick(args.simulation_id),
  };
}

/**
 * Resolve an explicit cod-query scope.
 *
 * @returns {Promise<{ok:true, scope:object, discovery?:object}
 *                  | {ok:false, summary:string, data:object}>}
 */
async function resolveScope({ projectId, graphId, simulationId, signal } = {}) {
  if (projectId || graphId || simulationId) {
    return { ok: true, scope: { project_id: projectId, graph_id: graphId, simulation_id: simulationId } };
  }

  const found = await kgList.discover({ signal });
  if (!found.ok) return { ok: false, summary: found.summary, data: found.data };

  const graph = found.graphs[0];
  if (graph && (graph.project_id || graph.graph_id)) {
    return {
      ok: true,
      scope: { project_id: graph.project_id, graph_id: graph.graph_id },
      discovery: { resolved_from: 'catalog', count: found.graphs.length, selected: graph },
    };
  }

  // Projects without a completed graph catalog entry can still be scoped by
  // project_id when they carry a graph_id or a simulation.
  const project = found.projects.find((p) => p.graph_id) || found.projects.find((p) => p.status === 'graph_completed');
  if (project && project.project_id) {
    return {
      ok: true,
      scope: { project_id: project.project_id, graph_id: project.graph_id || undefined },
      discovery: { resolved_from: 'project_list', count: found.graphs.length, selected: project },
    };
  }

  return {
    ok: false,
    summary:
      `当前无可用的知识图谱（0 个项目/图谱），请先在“数据平台/图谱项目”构建或选择图谱后再检索`
      + (found.projects.length ? `（已有 ${found.projects.length} 个项目但均未完成图谱构建）` : ''),
    data: { count: 0, graphs: [], projects_count: found.projects.length, sources: found.sources },
  };
}

/**
 * Build the cod-query payload. `retrievalOnly` turns off the LLM answer
 * refinement stage (used by rag_search to return evidence, not a written answer).
 * The scope MUST already be explicit (see resolveScope).
 */
function buildPayload({ query, topK, retrievalOnly }, scope) {
  const payload = {
    question: query,
    top_k_subgraphs: topK,
    top_k_paths: Math.max(topK, 8),
    // Scope (mandatory) + non-mutating read-only profile.
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
    enable_answer_cognition_memory: false,
    show_audit_appendix: false,
    debug: false,
    audit: false,
  };
  if (scope && scope.project_id) payload.project_id = String(scope.project_id);
  if (scope && scope.graph_id) payload.graph_id = String(scope.graph_id);
  if (scope && scope.simulation_id) payload.simulation_id = String(scope.simulation_id);
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
    return {
      ok: false,
      summary: `knowledge-graph query failed: ${String(errorText).slice(0, 300)}`,
      data: { url, status: response.status },
    };
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

/** Shared execution path for kg_search (answer) and rag_search (evidence only).
 *  `params` is the output of the tool's own `validate()` — never re-validated here. */
async function runQuery({ params, ctx, retrievalOnly }) {
  const { query, topK, projectId, graphId, simulationId } = params;
  const contextProjectId = ctx && typeof ctx.projectId === 'string' ? ctx.projectId.trim() : undefined;
  const contextGraphId = ctx && typeof ctx.graphId === 'string' ? ctx.graphId.trim() : undefined;

  const resolved = await resolveScope({
    projectId: projectId || contextProjectId,
    graphId: graphId || contextGraphId,
    simulationId,
    signal: ctx && ctx.signal,
  });
  if (!resolved.ok) return { ok: false, summary: resolved.summary, data: resolved.data };

  const payload = buildPayload({ query, topK, retrievalOnly }, resolved.scope);
  const outcome = await codQuery({ payload, signal: ctx && ctx.signal });
  if (!outcome.ok) {
    return {
      ok: false,
      summary: outcome.summary,
      data: { ...outcome.data, scope: resolved.scope },
    };
  }

  const projected = projectResult(outcome.data, { topK, includeAnswer: !retrievalOnly });
  // Separate publication payload from the compact model projection. Never
  // truncate the service's answer or alter its reference bindings silently.
  if (!retrievalOnly && ctx && ctx.answerMode === 'knowledge_service') {
    const text = outcome.data.final_answer;
    const references = Array.isArray(outcome.data.references) ? outcome.data.references : [];
    const bindings = Array.isArray(outcome.data.citation_bindings) ? outcome.data.citation_bindings : [];
    if (typeof text === 'string' && text.trim()) {
      const publication = { text, references, citation_bindings: bindings,
        qa_run_id: outcome.data.qa_run_id, scope: resolved.scope };
      if (text.length > 64000 || JSON.stringify(publication).length > 256000) {
        return { ok: false, summary: '知识服务回答超过传输上限，未截断或改写答案。',
          data: { code: 'service_answer_too_large', scope: resolved.scope } };
      }
      projected.data.service_answer = publication;
    }
  }
  if (ctx && ctx.evidenceStore) {
    const records = ctx.evidenceStore.register(top(outcome.data.references, topK), resolved.scope,
      { url: outcome.url, qa_run_id: outcome.data.qa_run_id });
    projected.data.evidence = records.slice(0, 5).map((item) => ({
      evidence_id: item.evidence_id, title: item.title && item.title.slice(0, 150), source_id: item.source_id,
      quote: item.text.slice(0, 150), locator: item.locator,
      citation_eligible: item.citation_eligible, exclusion_reason: item.exclusion_reason,
      support_status: item.support_status, limitations: item.limitations,
    }));
    projected.data.evidence_contract = {
      status: 'api_reported', semantic_support_verified: false,
      omitted_references: Math.max(0, top(outcome.data.references, topK).length - records.length),
      registered_count: records.length, preview_count: Math.min(5, records.length),
      note: 'final_answer 是服务生成文字，不是原文证据；原文仅取 references 的 API 返回片段。',
    };
    // Preserve source snippets in the task ledger; keep the model's directory
    // compact enough that evidence IDs survive both transport/context limits.
    projected.data.paths = projected.data.paths.slice(0, 3).map((item) => ({ ...item,
      path: item.path.slice(0, 300), reason: item.reason.slice(0, 150) }));
    projected.data.subgraphs = projected.data.subgraphs.slice(0, 3).map((item) => ({ ...item,
      seeds: item.seeds.map((name) => String(name || '').slice(0, 100)) }));
    projected.data.references = projected.data.references.slice(0, 3).map((item) => ({ ...item,
      title: String(item.title || '').slice(0, 150), quote: item.quote.slice(0, 200) }));
    if (projected.data.final_answer) projected.data.final_answer = projected.data.final_answer.slice(0, 1500);
    if (projected.data.citation_bindings) projected.data.citation_bindings = projected.data.citation_bindings.slice(0, 3)
      .map((item) => ({ reference_id: item.reference_id, target_type: item.target_type,
        answer_excerpt: String(item.answer_excerpt || '').slice(0, 200) }));
  }
  projected.data.scope = resolved.scope;
  if (resolved.discovery) projected.data.scope_resolution = resolved.discovery;
  return { ok: true, projected, counts: projected.counts };
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
  const outcome = await runQuery({ params: validate(args), ctx, retrievalOnly: false });
  if (!outcome.ok) return { ok: false, summary: outcome.summary, data: outcome.data };
  return { ok: true, summary: summarize(outcome.projected, true), data: outcome.projected.data };
}

module.exports = {
  name: 'kg_search',
  description:
    '在知识图谱（GraphRAG）中做只读检索并返回有路径/引用支撑的答案，用于材料配方、工艺、机理等事实性问题。'
    + '需要指定图谱范围（project_id/graph_id/simulation_id）；未指定时会自动解析，若无可用图谱则返回提示。'
    + '返回子图、验证路径与文献引用；不会修改图谱。',
  parameters,
  validate,
  execute,
  // shared with rag_search
  resolveScope,
  buildPayload,
  projectResult,
  codQuery,
  runQuery,
};
