export function buildListProjectsRequest(params = {}) {
  return {
    url: '/api/graph/project/list',
    method: 'get',
    params
  }
}

export function buildReportStatusRequest({ taskId, simulationId } = {}) {
  const data = {}

  if (taskId) data.task_id = taskId
  if (simulationId) data.simulation_id = simulationId

  return {
    url: '/api/report/generate/status',
    method: 'post',
    data
  }
}

function encodePathId(value) {
  return encodeURIComponent(String(value ?? '').trim())
}

export function buildUpdateGraphEdgeRequest(projectId, edgeId, data = {}) {
  return {
    url: `/api/graph/project/${encodePathId(projectId)}/metadata/edge/${encodePathId(edgeId)}`,
    method: 'patch',
    data
  }
}

export function buildResetGraphProjectRequest(projectId) {
  return {
    url: `/api/graph/project/${encodePathId(projectId)}/reset`,
    method: 'post'
  }
}

export function buildDeleteGraphProjectRequest(projectId) {
  return {
    url: `/api/graph/project/${encodePathId(projectId)}`,
    method: 'delete'
  }
}

export function buildDeleteGraphRequest(graphId) {
  return {
    url: `/api/graph/delete/${encodePathId(graphId)}`,
    method: 'delete'
  }
}

export function buildReportSectionsRequest(reportId) {
  return {
    url: `/api/report/${encodePathId(reportId)}/sections`,
    method: 'get'
  }
}

export function buildReportDownloadRequest(reportId) {
  return {
    url: `/api/report/${encodePathId(reportId)}/download`,
    method: 'get',
    responseType: 'blob'
  }
}

const interviewPaths = Object.freeze({
  single: '/api/simulation/interview',
  batch: '/api/simulation/interview/batch',
  all: '/api/simulation/interview/all'
})

export function buildSimulationInterviewRequest(scope, data = {}) {
  const url = interviewPaths[scope]
  if (!url) throw new Error(`Unsupported interview scope: ${scope}`)

  return {
    url,
    method: 'post',
    data
  }
}
