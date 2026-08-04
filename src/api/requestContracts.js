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
