function unwrapGraph(payload) {
  if (Array.isArray(payload?.nodes) || Array.isArray(payload?.edges)) return payload
  if (Array.isArray(payload?.data?.nodes) || Array.isArray(payload?.data?.edges)) return payload.data
  if (Array.isArray(payload?.data?.data?.nodes) || Array.isArray(payload?.data?.data?.edges)) {
    return payload.data.data
  }
  return {}
}

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function endpointId(endpoint) {
  if (endpoint && typeof endpoint === 'object') {
    return text(endpoint.node_id ?? endpoint.uuid ?? endpoint.id)
  }
  return text(endpoint)
}

function aliasesOf(node) {
  const value = node?.aliases ?? node?.attributes?.aliases ?? node?.alias ?? []
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[，,;；]/)
  return [...new Set(values.map((alias) => text(alias)).filter(Boolean))]
}

function evidenceCountOf(node) {
  const candidates = [
    node?.evidence_count,
    node?.source_count,
    node?.attributes?.evidence_count,
    Array.isArray(node?.sources) ? node.sources.length : undefined,
    Array.isArray(node?.evidence) ? node.evidence.length : undefined
  ]
  const count = candidates.map(Number).find(Number.isFinite)
  return Math.max(0, count ?? 0)
}

function generatedPosition(index, total) {
  const ringSize = 10
  const ring = Math.floor(index / ringSize)
  const position = index % ringSize
  const countOnRing = Math.min(ringSize, Math.max(1, total - ring * ringSize))
  const radiusX = Math.min(320, 220 + ring * 45)
  const radiusY = Math.min(210, 155 + ring * 30)
  const angle = -Math.PI / 2 + (position / countOnRing) * Math.PI * 2 + ring * 0.18

  return {
    x: Math.round(380 + Math.cos(angle) * radiusX),
    y: Math.round(260 + Math.sin(angle) * radiusY)
  }
}

export function adaptGraphForExplorer(payload = {}) {
  const graph = unwrapGraph(payload)
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : []
  const seenNodeIds = new Set()

  const nodes = rawNodes.flatMap((node, index) => {
    const nodeId = text(node?.node_id ?? node?.uuid ?? node?.id)
    if (!nodeId || seenNodeIds.has(nodeId)) return []
    seenNodeIds.add(nodeId)

    const backendX = Number(node?.x ?? node?.position?.x ?? node?.attributes?.x)
    const backendY = Number(node?.y ?? node?.position?.y ?? node?.attributes?.y)
    const position = Number.isFinite(backendX) && Number.isFinite(backendY)
      ? { x: backendX, y: backendY }
      : generatedPosition(index, rawNodes.length)

    return [{
      nodeId,
      label: text(node?.name_zh ?? node?.display_name ?? node?.name, nodeId),
      type: text(node?.entity_type ?? node?.attributes?.entity_type, '未分类'),
      aliases: aliasesOf(node),
      relationshipCount: 0,
      evidenceCount: evidenceCountOf(node),
      ...position
    }]
  })

  const counts = new Map(nodes.map((node) => [node.nodeId, 0]))
  const edges = rawEdges.flatMap((edge, index) => {
    const source = endpointId(edge?.source_node_uuid ?? edge?.source_uuid ?? edge?.source)
    const target = endpointId(edge?.target_node_uuid ?? edge?.target_uuid ?? edge?.target)
    if (!counts.has(source) || !counts.has(target)) return []

    counts.set(source, counts.get(source) + 1)
    counts.set(target, counts.get(target) + 1)
    const label = text(edge?.relation_type ?? edge?.name ?? edge?.fact, '关联')

    return [{
      edgeId: text(edge?.edge_id ?? edge?.uuid ?? edge?.id, `${source}:${label}:${target}:${index}`),
      source,
      target,
      label
    }]
  })

  return {
    nodes: nodes.map((node) => ({ ...node, relationshipCount: counts.get(node.nodeId) ?? 0 })),
    edges
  }
}
