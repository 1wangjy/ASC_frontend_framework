function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function rounded(value) {
  return Number(value.toFixed(3))
}

export function searchGraphNodes(nodes, query) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  return nodes
    .map(node => {
      const label = normalize(node.label)
      const nodeId = normalize(node.nodeId)
      const aliases = node.aliases.map(normalize)
      const matches = label.includes(normalizedQuery)
        || nodeId.includes(normalizedQuery)
        || aliases.some(alias => alias.includes(normalizedQuery))

      if (!matches) return null
      const rank = label === normalizedQuery
        ? 0
        : aliases.includes(normalizedQuery)
          ? 1
          : nodeId === normalizedQuery
            ? 2
            : 3
      return { node, rank }
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.node.label.localeCompare(right.node.label))
    .slice(0, 8)
    .map(result => result.node)
}

export function createGraphExplorerState() {
  return {
    focusedNodeId: null,
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    viewport: { x: 0, y: 0, scale: 1 },
    focusNotice: ''
  }
}

export function focusGraphNode(
  state,
  nodes,
  edges,
  nodeId,
  viewport = { width: 760, height: 520, scale: 1.2 }
) {
  const target = nodes.find(node => node.nodeId === nodeId)
  if (!target) return state

  const scale = Number(viewport.scale) || 1.2
  const width = Number(viewport.width) || 760
  const height = Number(viewport.height) || 520
  const connectedEdges = edges.filter(edge => edge.source === nodeId || edge.target === nodeId)
  const highlightedNodeIds = new Set([nodeId])

  connectedEdges.forEach(edge => {
    highlightedNodeIds.add(edge.source)
    highlightedNodeIds.add(edge.target)
  })

  return {
    ...state,
    focusedNodeId: nodeId,
    highlightedNodeIds: [...highlightedNodeIds],
    highlightedEdgeIds: connectedEdges.map(edge => edge.edgeId),
    viewport: {
      x: rounded(width / 2 - target.x * scale),
      y: rounded(height / 2 - target.y * scale),
      scale
    },
    focusNotice: `已定位：${target.label}`
  }
}
