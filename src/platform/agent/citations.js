/**
 * 工具结果的证据/引用提取（纯逻辑：无网络、无 UI、无 Vue 依赖）。
 *
 * 只读取后端工具已经投影好的有界字段，字段名按 `backend_impl/src/agent/tools` 的实际契约：
 *   - kg_search / rag_search → data.references[{title,paper_id,doi,quote}]
 *                             data.counts{subgraphs,candidate_paths,verified_paths,references}
 *                             data.subgraphs[{nodes,edges,evidence_chunks,score,seeds}]
 *                             data.paths[{path_id,path,path_type,validity,decision}]
 *                             data.scope{project_id,graph_id}
 *   - kg_graph               → data{graph_id,project_id,node_count,edge_count,matched_nodes,
 *                                  returned_nodes,returned_edges,nodes:[{id,name,type,weight}],
 *                                  edges:[{source,target,relation,weight}]}
 *   - web_browse / predict   → data.url（失败时的服务地址）
 *
 * 防御式：数据缺失、类型不符、超大数组都只会让结果更小，不会抛错。
 * 所有输出都是有界的（引用 ≤ 12 条、引文 ≤ 400 字、节点 ≤ 24、关系 ≤ 30），
 * 因为面板是聊天流里的紧凑卡片，不是数据浏览器。
 */

export const MAX_REFERENCES = 12
export const MAX_QUOTE_CHARS = 400
export const MAX_NODES = 24
export const MAX_EDGES = 30

/** 可能的引用集合字段名（按优先级），后端目前只用 `references`，其余为容错。 */
const REFERENCE_KEYS = ['references', 'citations', 'sources', 'evidence']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value, maxLength = MAX_QUOTE_CHARS) {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean
}

function firstText(...values) {
  for (const value of values) {
    const result = text(value)
    if (result) return result
  }
  return ''
}

/** doi → dx.doi.org 链接；只接受看起来像 DOI 的字符串。 */
export function doiToUrl(doi) {
  const value = typeof doi === 'string' ? doi.trim() : ''
  if (!value) return ''
  const normalized = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '')
  return /^10\.\d{4,9}\/\S+$/.test(normalized) ? `https://doi.org/${normalized}` : ''
}

/** 只接受 http(s) 链接，避免把任意字符串塞进 href。 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (!/^https?:\/\//i.test(raw)) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch (_error) {
    return ''
  }
}

function referenceHref(item) {
  return safeHttpUrl(item.url || item.href || item.link || item.source_url) || doiToUrl(item.doi)
}

/** 单条引用 → 面板需要的紧凑结构。无标题且无引文的条目直接丢弃。 */
export function normalizeReference(item, index = 0) {
  if (!item || typeof item !== 'object') {
    const quote = text(item)
    if (!quote) return null
    return { id: `ref-${index}`, title: '', source: '', quote, href: '' }
  }
  const title = firstText(item.title, item.document_title, item.source_filename, item.paper_id, item.reference_id)
  const source = firstText(item.source, item.document_title, item.source_filename, item.paper_id, item.doi)
  const quote = firstText(item.quote, item.original_quote, item.text, item.snippet, item.content)
  if (!title && !quote) return null
  return {
    id: `ref-${index}`,
    title: title || source || `引用 ${index + 1}`,
    source,
    quote,
    href: referenceHref(item)
  }
}

/** 从工具结果 data 里抽取引用列表（去重 + 截断）。 */
export function extractReferences(data) {
  if (!data || typeof data !== 'object') return []
  const seen = new Set()
  const references = []
  for (const key of REFERENCE_KEYS) {
    for (const item of asArray(data[key])) {
      const reference = normalizeReference(item, references.length)
      if (!reference) continue
      const fingerprint = `${reference.title}::${reference.quote.slice(0, 80)}`
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      references.push({ ...reference, id: `ref-${references.length}` })
      if (references.length >= MAX_REFERENCES) return references
    }
  }
  return references
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pickNumber(source, keys) {
  for (const key of keys) {
    const value = numberOrNull(source?.[key])
    if (value !== null) return value
  }
  return null
}

/** 计数既可能在 data.counts 里，也可能平铺在 data 上；`data.counts` 优先。 */
function pickCount(nested, data, keys) {
  return pickNumber(nested, keys) ?? pickNumber(data, keys)
}

function has(value) {
  return value !== null && value !== undefined
}

function normalizeCounts(data) {
  const nested = data.counts && typeof data.counts === 'object' ? data.counts : {}
  return {
    // 注意 `data.references` 是引用数组，计数只在 data.counts 里，因此 counts 必须先查。
    subgraphs: pickCount(nested, data, ['subgraphs', 'subgraph_count']),
    paths: pickCount(nested, data, ['verified_paths', 'path_count']),
    references: pickCount(nested, data, ['references', 'reference_count']),
    nodes: pickCount(nested, data, ['node_count']),
    edges: pickCount(nested, data, ['edge_count']),
    matchedNodes: pickCount(nested, data, ['matched_nodes']),
    returnedNodes: pickCount(nested, data, ['returned_nodes']),
    returnedEdges: pickCount(nested, data, ['returned_edges'])
  }
}

/** 图谱摘要：graph_id 必须有；节点/关系是有界投影。 */
export function extractGraph(data) {
  if (!data || typeof data !== 'object') return null
  const graphId = firstText(data.graph_id, data.scope?.graph_id, data.scope_resolution?.selected?.graph_id, 120)
  const nodes = asArray(data.nodes).slice(0, MAX_NODES).map((node, index) => ({
    index,
    id: firstText(node?.id, node?.uuid, node?.node_id, 80),
    name: firstText(node?.name, node?.label, node?.id, 120) || `节点 ${index + 1}`,
    type: firstText(node?.type, node?.entity_type, 60)
  }))
  const edges = asArray(data.edges).slice(0, MAX_EDGES).map((edge, index) => ({
    index,
    source: firstText(edge?.source, edge?.from, edge?.source_id, 80),
    target: firstText(edge?.target, edge?.to, edge?.target_id, 80),
    relation: firstText(edge?.relation, edge?.type, edge?.name, 60)
  }))
  const counts = normalizeCounts(data)
  const hasGraphPayload = Boolean(graphId) || nodes.length > 0 || edges.length > 0
    || has(counts.nodes) || has(counts.edges)
  if (!hasGraphPayload) return null
  return {
    graphId,
    projectId: firstText(data.project_id, data.scope?.project_id, 120),
    url: safeHttpUrl(data.url || data.graph_url),
    counts,
    nodes,
    edges,
    // 后端自己截断过（nodes_truncated）或客户端为了紧凑又丢弃了一些条目。
    nodesTruncated: data.nodes_truncated === true || (has(counts.returnedNodes) && counts.returnedNodes > nodes.length),
    edgesTruncated: data.edges_truncated === true || (has(counts.returnedEdges) && counts.returnedEdges > edges.length)
  }
}

/** 工具结果 data 里的“来源地址”（web_browse 的抓取地址、失败时的服务地址）。 */
export function extractSourceUrl(data) {
  if (!data || typeof data !== 'object') return ''
  return safeHttpUrl(data.url || data.source_url || data.request_url)
}

function countPart(label, value, suffix = '') {
  return has(value) ? `${label} ${value}${suffix}` : ''
}

/** 一行紧凑的计数摘要，例如 `子图 3 · 路径 5 · 引用 4`。 */
export function evidenceCountsLabel(counts) {
  if (!counts) return ''
  const parts = [
    countPart('子图', counts.subgraphs),
    countPart('路径', counts.paths),
    countPart('引用', counts.references)
  ].filter(Boolean)
  const graphParts = [
    countPart('节点', counts.nodes),
    countPart('关系', counts.edges)
  ].filter(Boolean)
  const returned = has(counts.returnedNodes) || has(counts.returnedEdges)
    ? `返回 ${counts.returnedNodes ?? 0} 节点 / ${counts.returnedEdges ?? 0} 关系`
    : ''
  const head = parts.length ? parts.join(' · ') : graphParts.join(' / ')
  return [head, returned].filter(Boolean).join(' · ')
}

/**
 * 工具结果 → 证据视图模型。没有任何证据时返回 null（面板据此不渲染空卡片）。
 * @param {{data?:Object, ok?:boolean, name?:string}} tool
 */
export function extractEvidence(tool) {
  const data = tool?.data
  if (!data || typeof data !== 'object') return null
  const references = extractReferences(data)
  const graph = extractGraph(data)
  const counts = normalizeCounts(data)
  const countsLabel = evidenceCountsLabel(counts)
  const sourceUrl = extractSourceUrl(data)
  if (!references.length && !graph && !countsLabel && !sourceUrl) return null
  return {
    references,
    graph,
    counts,
    countsLabel,
    sourceUrl
  }
}
