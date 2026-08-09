import {
  getBrowserStorage,
  rememberActiveProjectId
} from './projectContextModel.js'

export function buildGraphQaRoute(project = {}) {
  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()
  if (!projectId || !graphId) return null

  return {
    name: 'AscQa',
    query: { projectId }
  }
}

export async function navigateGraphProjectToQa({
  project,
  browser = globalThis,
  navigate
} = {}) {
  const route = buildGraphQaRoute(project)
  if (!route || typeof navigate !== 'function') return false

  rememberActiveProjectId(getBrowserStorage(browser), project.project_id)
  await navigate(route)
  return true
}

function completionError(message, project = null) {
  return { status: 'error', message, project }
}

async function completeGraphForQa({
  projectId,
  getProject,
  loadGraph,
  navigate,
  onCompletedProject,
  onReady,
  requireCompletedStatus = false
} = {}) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    return completionError('Final getProject requires a project_id')
  }

  let response
  try {
    response = await getProject(normalizedProjectId)
  } catch (error) {
    return completionError(`Final getProject failed: ${error?.message || 'unknown error'}`)
  }

  if (!response?.success || !response?.data) {
    return completionError(`Final getProject failed: ${response?.error || 'invalid response'}`)
  }

  const project = response.data
  if (requireCompletedStatus && project.status !== 'graph_completed') {
    return { status: 'pending', project }
  }

  const route = buildGraphQaRoute(project)
  if (!route) {
    return completionError('Final getProject response is missing project_id or graph_id', project)
  }

  if (typeof onCompletedProject === 'function') {
    try {
      await onCompletedProject(project)
    } catch (error) {
      return completionError(`Final completion handling failed: ${error?.message || 'unknown error'}`, project)
    }
  }

  let graphLoaded
  try {
    graphLoaded = await loadGraph(project.graph_id)
  } catch (error) {
    return completionError(`Final graph load failed: ${error?.message || 'unknown error'}`, project)
  }
  if (graphLoaded !== true) {
    return completionError('Final graph load failed', project)
  }

  if (typeof onReady === 'function') await onReady(project)
  if (typeof navigate !== 'function') {
    return completionError('Final QA navigation is unavailable', project)
  }

  try {
    const navigated = await navigate(project, route)
    if (navigated === false) return completionError('Final QA navigation failed', project)
  } catch (error) {
    return completionError(`Final QA navigation failed: ${error?.message || 'unknown error'}`, project)
  }

  return { status: 'success', project, route }
}

export function completeTaskGraphForQa(options = {}) {
  return completeGraphForQa(options)
}

export function completeMissingTaskGraphForQa(options = {}) {
  return completeGraphForQa({ ...options, requireCompletedStatus: true })
}
