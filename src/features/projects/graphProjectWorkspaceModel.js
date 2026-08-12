export function normalizeProjectName(value) {
  return String(value ?? '').trim()
}

function projectLabel(project = {}) {
  return normalizeProjectName(project.project_name || project.name)
}

export function suggestNextProjectName(projects = []) {
  const highestIndex = projects.reduce((highest, project) => {
    const match = /^project_(\d+)$/i.exec(projectLabel(project))
    if (!match) return highest
    return Math.max(highest, Number(match[1]))
  }, 0)

  return `project_${highestIndex + 1}`
}

export function projectDeletionMessage(project = {}) {
  const name = projectLabel(project) || '该项目'
  if (project.active === true) {
    return `“${name}”正在构建。删除后将停止显示进度并清理项目数据，此操作无法撤销，是否继续？`
  }
  return `确定删除“${name}”吗？项目和关联图谱数据将被清理，此操作无法撤销。`
}

function assertSuccessfulDeletion(response, fallbackMessage) {
  if (response?.success === false) {
    throw new Error(response.error || response.message || fallbackMessage)
  }
}

export async function deleteGraphProjectResources(dependencies, project = {}) {
  const projectId = normalizeProjectName(project.projectId || project.project_id)
  const graphId = normalizeProjectName(project.graphId || project.graph_id)
  if (!projectId) throw new Error('缺少项目 ID，无法删除。')

  const projectResponse = await dependencies.deleteGraphProject(projectId)
  assertSuccessfulDeletion(projectResponse, '删除图谱项目失败。')

  const cleanupWarnings = []
  if (graphId) {
    try {
      const graphResponse = await dependencies.deleteGraph(graphId)
      if (graphResponse?.success === false) {
        cleanupWarnings.push(graphResponse.error || graphResponse.message || '删除远端图谱失败。')
      }
    } catch (error) {
      cleanupWarnings.push(error?.message || '删除远端图谱失败。')
    }
  }

  return { deletedProjectId: projectId, cleanupWarnings }
}

export async function deleteLogicalGraphProjectResources(dependencies, project = {}) {
  const resources = Array.isArray(project.resources) && project.resources.length
    ? project.resources
    : [project]
  const deletedProjectIds = new Set()
  const cleanupWarnings = []

  for (const resource of resources) {
    const projectId = normalizeProjectName(resource.projectId || resource.project_id)
    if (!projectId || deletedProjectIds.has(projectId)) continue
    const result = await deleteGraphProjectResources(dependencies, resource)
    cleanupWarnings.push(...result.cleanupWarnings)
    deletedProjectIds.add(projectId)
  }

  return { deletedProjectIds: [...deletedProjectIds], cleanupWarnings }
}
