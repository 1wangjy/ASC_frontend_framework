export function buildGraphQaRoute(project = {}) {
  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()
  if (!projectId || !graphId) return null

  return {
    name: 'AscQa',
    query: { projectId }
  }
}
