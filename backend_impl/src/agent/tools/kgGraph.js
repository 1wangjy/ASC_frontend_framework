'use strict';

/**
 * kg_graph — read the CONTENT (nodes + relations) of one specific knowledge graph.
 *
 * ENDPOINT (HTTP GET only, never mutating):
 *   GET {AGENT_KG_BASE_URL}/api/graph/data/<graph_id>
 *     → {success:true, data:{graph_id, project_id, nodes:[…], edges:[…],
 *                            node_count, edge_count, build_stage, …}}
 *     → {success:true, data:{…, graph_building_empty:true,
 *                            graph_building_empty_message:"…"}}  while building
 *     → {success:false, error:"…"} (or a non-2xx) when the graph is missing
 *
 * NO PAGINATION: the endpoint always returns the WHOLE graph. This tool is
 * therefore responsible for bounding everything before the payload can reach
 * the model:
 *   - the response body is read with a hard byte cap (AGENT_KG_GRAPH_MAX_BYTES,
 *     default 32MB) — an oversized graph is reported as an error, not streamed;
 *   - nodes/edges are filtered (node_type / keyword) and sliced to
 *     node_limit/edge_limit (defaults 20/40, caps 100/200);
 *   - every node/edge is projected to four small fields, dropping summaries,
 *     attributes, evidence and episodes.
 *
 * SCOPE IS MANDATORY: graph_id must come from the arguments or ctx.graphId.
 * Without one this tool refuses locally (no HTTP request at all) and points at
 * kg_list for discovery.
 */

const kgList = require('./kgList');

const TIMEOUT_MS = Number(process.env.AGENT_KG_TIMEOUT_MS || 180000);
const MAX_BYTES = Number(process.env.AGENT_KG_GRAPH_MAX_BYTES || 32 * 1024 * 1024);

const parameters = {
  type: 'object',
  properties: {
    graph_id: { type: 'string', description: '要读取的图谱 ID（必填；可先用 kg_list 查看可用图谱）。' },
    node_limit: { type: 'number', description: '最多返回多少个节点，默认 20，最大 100。', minimum: 1, maximum: 100 },
    edge_limit: { type: 'number', description: '最多返回多少条关系，默认 40，最大 200。', minimum: 1, maximum: 200 },
    node_type: { type: 'string', description: '只返回该实体类型（不区分大小写，如 Material/Process）。' },
    keyword: { type: 'string', description: '按实体名称/ID 做不区分大小写的子串过滤（如“刚玉”）。' },
  },
  additionalProperties: false,
};

function validate(rawArgs) {
  const args = rawArgs || {};
  const graphId = typeof args.graph_id === 'string' && args.graph_id.trim() ? args.graph_id.trim() : undefined;
  const clamp = (value, fallback, max) => Math.min(max, Math.max(1, Math.round(Number(value) || fallback)));
  const pick = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  return {
    graphId,
    nodeLimit: clamp(args.node_limit, 20, 100),
    edgeLimit: clamp(args.edge_limit, 40, 200),
    nodeType: pick(args.node_type),
    keyword: pick(args.keyword),
  };
}

function graphDataUrl(graphId) {
  return `${kgList.kgBaseUrl()}/api/graph/data/${encodeURIComponent(graphId)}`;
}

/** Read at most MAX_BYTES from a fetch Response body (the graph can be huge). */
async function readCapped(response) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { text: buffer.subarray(0, MAX_BYTES).toString('utf8'), truncated: buffer.length > MAX_BYTES };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    const remaining = MAX_BYTES - size;
    if (chunk.length >= remaining) {
      chunks.push(chunk.subarray(0, remaining));
      size = MAX_BYTES;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(chunk);
    size += chunk.length;
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}

// --- field-tolerant projections (the service mixes Zep-style and normalized
// --- payloads: uuid/name/labels vs id/entity_name/entity_type) -------------

function nodeId(node) {
  return node.uuid || node.id || node.node_id || node.element_id || undefined;
}

function nodeName(node) {
  const attrs = node.attributes && typeof node.attributes === 'object' ? node.attributes : {};
  return node.entity_name || node.name || attrs.entity_name || attrs.name || node.label || undefined;
}

function nodeType(node) {
  const attrs = node.attributes && typeof node.attributes === 'object' ? node.attributes : {};
  const labels = Array.isArray(node.labels) ? node.labels.filter((l) => typeof l === 'string' && l !== 'Entity') : [];
  return node.entity_type || node.type || attrs.entity_type || attrs.type || labels[0] || undefined;
}

function weightOf(item) {
  const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
  const raw = [item.weight, item.score, item.fact_strength, attrs.weight, attrs.score, attrs.pagerank]
    .find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof raw === 'number' ? Math.round(raw * 10000) / 10000 : undefined;
}

function projectNode(node) {
  const out = { id: nodeId(node), name: nodeName(node), type: nodeType(node) };
  const weight = weightOf(node);
  if (weight !== undefined) out.weight = weight;
  return out;
}

function projectEdge(edge) {
  const out = {
    source: edge.source || edge.source_node_uuid || edge.source_id || edge.from,
    target: edge.target || edge.target_node_uuid || edge.target_id || edge.to,
    relation: edge.relation || edge.name || edge.type || (edge.fact ? String(edge.fact).slice(0, 120) : undefined),
  };
  const weight = weightOf(edge);
  if (weight !== undefined) out.weight = weight;
  return out;
}

/** Filter + slice + project, and report what was dropped. */
function projectGraph(graph, { nodeLimit, edgeLimit, nodeType: typeFilter, keyword }) {
  const allNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const allEdges = Array.isArray(graph.edges) ? graph.edges : [];

  const needle = keyword ? keyword.toLowerCase() : null;
  const typeNeedle = typeFilter ? typeFilter.toLowerCase() : null;
  const filtered = allNodes.filter((node) => {
    if (typeNeedle) {
      const labels = Array.isArray(node.labels) ? node.labels.map((l) => String(l).toLowerCase()) : [];
      const types = [nodeType(node), ...labels].filter(Boolean).map((value) => String(value).toLowerCase());
      if (!types.includes(typeNeedle)) return false;
    }
    if (needle) {
      const haystack = `${nodeName(node) || ''} ${nodeId(node) || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const keeping = filtered.slice(0, nodeLimit);
  const keptIds = new Set(keeping.map(nodeId).filter(Boolean));

  const edges = (needle || typeNeedle)
    // With a filter active, keep only relations whose endpoints were selected —
    // otherwise the result would mix filtered nodes with unrelated edges.
    ? allEdges.filter((edge) => keptIds.has(edge.source || edge.source_node_uuid || edge.source_id || edge.from)
      || keptIds.has(edge.target || edge.target_node_uuid || edge.target_id || edge.to))
    : allEdges;

  const returnedEdges = edges.slice(0, edgeLimit).map(projectEdge);
  const returnedNodes = keeping.map(projectNode);

  return {
    nodes: returnedNodes,
    edges: returnedEdges,
    counts: {
      node_count: Number.isFinite(graph.node_count) ? graph.node_count : allNodes.length,
      edge_count: Number.isFinite(graph.edge_count) ? graph.edge_count : allEdges.length,
      matched_nodes: filtered.length,
      returned_nodes: returnedNodes.length,
      returned_edges: returnedEdges.length,
      nodes_truncated: filtered.length > returnedNodes.length,
      edges_truncated: edges.length > returnedEdges.length,
    },
  };
}

const STOP = 'kg_graph 需要指定 graph_id（或请求上下文 context.graphId）。请先用 kg_list 查看可用图谱，再用其中的 graph_id 读取节点与关系。';

async function execute(rawArgs, ctx) {
  const params = validate(rawArgs);
  const graphId = params.graphId || (ctx && typeof ctx.graphId === 'string' ? ctx.graphId.trim() : undefined);
  if (!graphId) {
    // Local refusal: no HTTP request is made without a graph_id.
    return { ok: false, summary: STOP, data: { count: 0, hint: 'call kg_list first' } };
  }

  const url = graphDataUrl(graphId);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = ctx && ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    return { ok: false, summary: `knowledge-graph service unreachable at ${url} (${reason})`, data: { url, graph_id: graphId } };
  }

  const { text, truncated } = await readCapped(response);
  if (truncated) {
    return {
      ok: false,
      summary: `图谱 ${graphId} 数据超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限，无法整体读取；`
        + '请改用 kg_search/rag_search 做有界检索，或先用 node_type/keyword 缩小范围（本端点不支持分页）。',
      data: { url, graph_id: graphId, max_bytes: MAX_BYTES },
    };
  }

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    return {
      ok: false,
      summary: `读取图谱 ${graphId} 失败：服务返回非 JSON（HTTP ${response.status}）`,
      data: { url, graph_id: graphId, status: response.status, body: text.slice(0, 300) },
    };
  }

  if (!response.ok || envelope.success !== true) {
    const message = String(envelope.error || envelope.message || `HTTP ${response.status}`)
      .replace(/\s+/g, ' ')
      .slice(0, 300);
    return {
      ok: false,
      summary: `读取图谱 ${graphId} 失败：${message}`,
      data: { url, graph_id: graphId, status: response.status },
    };
  }

  const graph = envelope.data || {};
  const base = {
    graph_id: graph.graph_id || graphId,
    project_id: graph.project_id,
    build_stage: graph.graph_build_stage || graph.build_stage,
  };

  if (graph.graph_building_empty === true) {
    const message = graph.graph_building_empty_message || '图谱尚在构建中，暂无节点数据。';
    return {
      ok: true,
      summary: `图谱 ${base.graph_id} 尚无内容：${message}`,
      data: { ...base, graph_building_empty: true, graph_building_empty_message: message, node_count: 0, edge_count: 0, matched_nodes: 0, returned_nodes: 0, returned_edges: 0, nodes: [], edges: [] },
    };
  }

  const projected = projectGraph(graph, params);
  const filters = [params.nodeType ? `node_type=${params.nodeType}` : null, params.keyword ? `keyword=${params.keyword}` : null]
    .filter(Boolean).join(', ');
  const summary = [
    `图谱 ${base.graph_id}：${projected.counts.node_count} 节点 / ${projected.counts.edge_count} 关系`,
    filters ? `过滤(${filters})后命中 ${projected.counts.matched_nodes} 个节点` : null,
    `返回 ${projected.counts.returned_nodes} 节点 / ${projected.counts.returned_edges} 关系`,
    projected.counts.nodes_truncated || projected.counts.edges_truncated ? '(已截断，可用 node_type/keyword 缩小范围)' : null,
  ].filter(Boolean).join('，');

  return {
    ok: true,
    summary,
    data: {
      ...base,
      ...projected.counts,
      nodes: projected.nodes,
      edges: projected.edges,
      filters: { node_type: params.nodeType, keyword: params.keyword },
    },
  };
}

module.exports = {
  name: 'kg_graph',
  description:
    '读取指定图谱的内容（节点与关系），只读 GET /api/graph/data/<graph_id>。'
    + '必须先给出 graph_id（可用 kg_list 查询）；返回按 node_limit/edge_limit 截断的节点与关系列表，'
    + '可用 node_type / keyword 过滤。该端点不支持分页，本工具会限制体量；'
    + '若只想问问题，请改用 kg_search / rag_search。',
  parameters,
  validate,
  execute,
};
