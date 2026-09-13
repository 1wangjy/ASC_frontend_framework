'use strict';

/**
 * kg_list — read-only discovery of the knowledge graphs available to the agent.
 *
 * WHY THIS EXISTS: 5001 /api/graphrag/cod-query REQUIRES an explicit scope
 * (project_id OR graph_id OR simulation_id). `allow_latest_fallback: true` does
 * NOT bypass that check — the service answers 400
 *   {"error":"请选择目标知识图谱后再查询；系统不会自动切换到最新 Graph。"}
 * so a scope-less cod-query is a guaranteed failure. This tool therefore lists
 * what exists so the agent can (a) auto-resolve a scope or (b) tell the user
 * that no graph exists yet and ask them to build/select one.
 *
 * Endpoints (GET, never mutate):
 *   /api/graph/project/list  → {success, data:[project…], count}
 *   /api/graph/catalog       → {success, data:[graph…], count}   (queryable graphs)
 *
 * Exported helpers are shared with kgSearch.js / ragSearch.js.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:5001';
const TIMEOUT_MS = Number(process.env.AGENT_KG_TIMEOUT_MS || 180000);
const PROJECT_LIMIT = 50;
const GRAPH_LIMIT = 200;

function kgBaseUrl() {
  return String(process.env.AGENT_KG_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

async function getJson(pathAndQuery, signal) {
  const url = `${kgBaseUrl()}${pathAndQuery}`;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal: combined });
    const text = await response.text();
    if (!response.ok) return { ok: false, url, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    const payload = JSON.parse(text);
    if (payload && payload.success === false) {
      return { ok: false, url, error: String(payload.error || payload.message || 'service reported failure').slice(0, 300) };
    }
    return { ok: true, url, data: Array.isArray(payload && payload.data) ? payload.data : [] };
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, url, error: reason };
  }
}

/** GET /api/graph/project/list — every project record (may have no graph yet). */
function fetchProjectList({ signal } = {}) {
  return getJson(`/api/graph/project/list?limit=${PROJECT_LIMIT}`, signal);
}

/** GET /api/graph/catalog — projects whose graph reached GRAPH_COMPLETED (queryable). */
function fetchCatalog({ signal } = {}) {
  return getJson(`/api/graph/catalog?limit=${GRAPH_LIMIT}`, signal);
}

function compactGraph(entry) {
  return {
    project_id: entry.project_id,
    project_name: entry.project_name || entry.project_id,
    graph_id: entry.graph_id,
    graph_name: entry.graph_name || entry.graph_id,
    stage: entry.graph_build_stage,
    nodes: entry.node_count,
    edges: entry.edge_count,
    documents: entry.document_count,
    updated_at: entry.updated_at,
  };
}

function compactProject(entry) {
  return {
    project_id: entry.project_id,
    name: entry.name || entry.project_id,
    status: entry.status,
    graph_id: entry.graph_id || null,
    stage: entry.graph_build_stage,
    updated_at: entry.updated_at,
  };
}

/**
 * Discover queryable graphs + all projects.
 * @returns {Promise<{ok:true, graphs:Array, projects:Array, sources:object}
 *                  | {ok:false, summary:string, data:object}>}
 */
async function discover({ signal } = {}) {
  const [catalog, projectList] = await Promise.all([fetchCatalog({ signal }), fetchProjectList({ signal })]);

  if (!catalog.ok && !projectList.ok) {
    return {
      ok: false,
      summary: `knowledge-graph 服务不可用（${kgBaseUrl()}）：${catalog.error || projectList.error}`,
      data: { base: kgBaseUrl(), catalog_url: catalog.url, projects_url: projectList.url },
    };
  }

  const graphs = (catalog.ok ? catalog.data : []).map(compactGraph).filter((g) => g.project_id || g.graph_id);
  const projects = (projectList.ok ? projectList.data : []).map(compactProject).filter((p) => p.project_id);
  return {
    ok: true,
    graphs,
    projects,
    sources: {
      catalog: catalog.ok ? { url: catalog.url, count: graphs.length } : { url: catalog.url, error: catalog.error },
      projects: projectList.ok
        ? { url: projectList.url, count: projects.length }
        : { url: projectList.url, error: projectList.error },
    },
  };
}

const parameters = {
  type: 'object',
  properties: {
    limit: { type: 'number', description: '每类最多返回多少条，默认 10，最大 50。', minimum: 1, maximum: 50 },
  },
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const limit = Math.min(50, Math.max(1, Math.round(Number(args.limit) || 10)));
  return { limit };
}

async function execute(args, ctx) {
  const { limit } = validate(args);
  const found = await discover({ signal: ctx && ctx.signal });
  if (!found.ok) return { ok: false, summary: found.summary, data: found.data };

  const count = found.graphs.length;
  const data = {
    count,
    projects_count: found.projects.length,
    graphs: found.graphs.slice(0, limit),
    projects: found.projects.slice(0, limit),
    sources: found.sources,
  };

  if (count === 0) {
    return {
      ok: true,
      summary:
        `当前无可用的知识图谱（可用图谱 0 个 / 项目 ${found.projects.length} 个）。`
        + '请先在「数据平台 / 图谱项目」构建图谱并完成构建（GRAPH_COMPLETED），或指定 project_id/graph_id 后再检索。',
      data,
    };
  }
  const names = found.graphs.slice(0, limit).map((g) => `${g.graph_name}(${g.project_id})`);
  return { ok: true, summary: `可用知识图谱 ${count} 个：${names.join('、')}`, data };
}

module.exports = {
  name: 'kg_list',
  description:
    '列出当前可用的知识图谱/项目（只读，GET /api/graph/project/list 与 /api/graph/catalog），'
    + '返回数量与精简列表（project_id/graph_id/名称/更新时间）。'
    + '在检索知识图谱前若不确定有哪些图谱，先用本工具确认可检索范围。',
  parameters,
  validate,
  execute,
  // shared with kg_search / rag_search
  kgBaseUrl,
  discover,
  fetchProjectList,
  fetchCatalog,
};
