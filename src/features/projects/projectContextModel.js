export { getBrowserStorage } from '../../utils/browserStorage.js'

export const ACTIVE_PROJECT_STORAGE_KEY = 'nexus_active_project_id'

function projectTimestamp(project) {
  const value = project?.updated_at || project?.created_at
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function projectArray(input) {
  if (Array.isArray(input)) return input
  return Array.isArray(input?.data) ? input.data : []
}

export function listGraphProjects(input = []) {
  return projectArray(input)
    .map((project) => ({
      ...project,
      project_id: String(project?.project_id ?? '').trim(),
      graph_id: String(project?.graph_id ?? '').trim()
    }))
    .filter((project) => project.project_id && project.graph_id)
    .sort((left, right) => projectTimestamp(right) - projectTimestamp(left))
}

export function resolveActiveProject(projects = [], ...preferredProjectIds) {
  const usableProjects = listGraphProjects(projects)
  if (!usableProjects.length) return null

  for (const candidate of preferredProjectIds) {
    const projectId = String(candidate ?? '').trim()
    const match = usableProjects.find((project) => project.project_id === projectId)
    if (match) return match
  }

  return usableProjects[0]
}

export function resolveProjectAfterRefresh(projects = [], options = {}) {
  if (options.requireManualSelection === true) return null
  return resolveActiveProject(
    projects,
    options.routeProjectId,
    options.storedProjectId
  )
}

export function readActiveProjectId(storage) {
  if (!storage?.getItem) return null

  try {
    const projectId = String(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY) ?? '').trim()
    return projectId || null
  } catch {
    return null
  }
}

export function rememberActiveProjectId(storage, projectId) {
  if (!storage) return

  const normalizedId = String(projectId ?? '').trim()
  try {
    if (normalizedId && storage.setItem) {
      storage.setItem(ACTIVE_PROJECT_STORAGE_KEY, normalizedId)
    } else if (storage.removeItem) {
      storage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
    }
  } catch {
    // Project selection memory is optional and must never block the main flow.
  }
}
