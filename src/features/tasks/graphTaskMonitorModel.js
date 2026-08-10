import { isFinalGraphProject } from '../projects/logicalGraphProjectModel.js'

const ACTIVE_STATUSES = new Set(['ontology_generating', 'graph_building'])

export function unwrapGraphProjects(response = []) {
  if (Array.isArray(response)) return response
  return Array.isArray(response?.data) ? response.data : []
}

function numericProgress(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0
}

export function normalizeGraphTaskItems(projects = [], taskById = new Map()) {
  return unwrapGraphProjects(projects)
    .filter(project => String(project?.project_id || '').trim())
    .map(project => {
      const projectId = String(project.project_id).trim()
      const graphId = String(project.graph_id || '').trim()
      const baseProjectId = String(project.base_project_id || '').trim()
      const taskId = String(project.graph_build_task_id || '').trim()
      const task = taskId ? taskById.get(taskId) : null
      const projectStatus = String(project.status || 'created')
      const status = projectStatus === 'graph_building' && task?.status === 'failed'
        ? 'failed'
        : projectStatus
      const ontology = project.ontology_progress || {}
      const progress = status === 'graph_completed'
        ? 100
        : numericProgress(status === 'graph_building' ? task?.progress : ontology.progress)

      const item = {
        id: taskId || `project:${project.project_id}`,
        projectId,
        graphId,
        baseProjectId,
        taskId,
        name: project.project_name || project.name || project.project_id,
        status,
        stage: project.graph_build_stage || (status.startsWith('ontology_') ? 'ontology' : 'base'),
        progress,
        message: task?.error || task?.message || ontology.message || project.error || '',
        updatedAt: Date.parse(project.updated_at || project.created_at || '') || 0,
        active: ACTIVE_STATUSES.has(status),
        canOpenQa: false
      }
      item.canOpenQa = isFinalGraphProject(item)
      return item
    })
    .sort((left, right) => Number(right.active) - Number(left.active) || right.updatedAt - left.updatedAt)
}

export function selectVisibleGraphTasks(items = [], maxRecent = 3) {
  const active = items.filter(item => item.active)
  const terminal = items.filter(item => !item.active).slice(0, maxRecent)
  return [...active, ...terminal]
}

export function getGraphMonitorDelay(items = [], { activeMs = 1500, idleMs = 12000 } = {}) {
  return items.some(item => item.active) ? activeMs : idleMs
}
