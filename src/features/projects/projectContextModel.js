export const ACTIVE_PROJECT_STORAGE_KEY = 'nexus_active_project_id'

function projectTimestamp(project) {
  const value = project?.updated_at || project?.created_at
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function listGraphProjects(projects = []) {
  if (!Array.isArray(projects)) return []

  return projects
    .filter((project) => String(project?.project_id ?? '').trim() && String(project?.graph_id ?? '').trim())
    .slice()
    .sort((left, right) => projectTimestamp(right) - projectTimestamp(left))
}

export function resolveActiveProject(projects = [], preferredProjectId = null) {
  const usableProjects = listGraphProjects(projects)
  if (!usableProjects.length) return null

  const preferredId = String(preferredProjectId ?? '').trim()
  return usableProjects.find((project) => String(project.project_id) === preferredId) || usableProjects[0]
}

export function readActiveProjectId(storage) {
  if (!storage?.getItem) return null

  const projectId = String(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY) ?? '').trim()
  return projectId || null
}

export function rememberActiveProjectId(storage, projectId) {
  if (!storage) return

  const normalizedId = String(projectId ?? '').trim()
  if (normalizedId && storage.setItem) {
    storage.setItem(ACTIVE_PROJECT_STORAGE_KEY, normalizedId)
  } else if (storage.removeItem) {
    storage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
  }
}
