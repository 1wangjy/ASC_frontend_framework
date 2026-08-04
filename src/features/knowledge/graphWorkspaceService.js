import { listGraphProjects, resolveActiveProject } from '../projects/projectContextModel.js'
import { adaptGraphForExplorer } from './graphApiAdapter.js'
import { focusGraphNode } from './graphExplorerModel.js'

const EMPTY_GRAPH = Object.freeze({ nodes: [], edges: [] })

function projectsFromResponse(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.data?.data)) return response.data.data
  return []
}

export async function loadGraphForProject(getGraphData, project) {
  if (!project?.graph_id) return { ...EMPTY_GRAPH }
  const response = await getGraphData(project.graph_id)
  return adaptGraphForExplorer(response)
}

export async function loadGraphWorkspace(api, preferredProjectId = null) {
  const response = await api.listProjects()
  const projects = listGraphProjects(projectsFromResponse(response))
  const activeProject = resolveActiveProject(projects, preferredProjectId)

  if (!activeProject) {
    return {
      projects: [],
      activeProject: null,
      graph: { ...EMPTY_GRAPH }
    }
  }

  return {
    projects,
    activeProject,
    graph: await loadGraphForProject(api.getGraphData, activeProject)
  }
}

export function focusWorkspaceNode(state, graph, nodeId, viewport) {
  return focusGraphNode(
    state,
    Array.isArray(graph?.nodes) ? graph.nodes : [],
    Array.isArray(graph?.edges) ? graph.edges : [],
    nodeId,
    viewport
  )
}
