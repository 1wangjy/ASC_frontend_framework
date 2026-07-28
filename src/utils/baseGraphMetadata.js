const clampNodeWeight = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0.7
  return Math.max(0, Math.min(1, parsed))
}

export const buildBaseGraphExport = (graph = {}, project = {}) => {
  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes.map((rawNode) => {
        const node = rawNode || {}
        const summary = String(
          node.summary ?? node.description ?? node.attributes?.description ?? ''
        )
        const nodeWeight = clampNodeWeight(
          node.node_weight ?? node.weight ?? node.attributes?.node_weight
        )
        return {
          entity_name: String(node.name_zh ?? node.display_name ?? node.name ?? ''),
          entity_type: String(node.entity_type ?? node.attributes?.entity_type ?? ''),
          entity_summary: summary,
          weight: nodeWeight
        }
      })
    : []

  return {
    metadata_schema: 'nexus4material.base_node_metadata.v1',
    source_project_id: graph.project_id || project.project_id || null,
    source_graph_id: graph.graph_id || project.graph_id || null,
    exported_at: new Date().toISOString(),
    node_count: nodes.length,
    nodes,
  }
}

export const baseGraphExportFilename = (projectId = '') => {
  const safeProjectId = String(projectId || 'snapshot').replace(/[^a-zA-Z0-9_-]+/g, '_')
  return `base_node_metadata_${safeProjectId}.json`
}
