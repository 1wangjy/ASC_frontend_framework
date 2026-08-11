function text(value) {
  return String(value ?? '').trim()
}

function normalizedIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))]
}

function intersects(left = [], right = new Set()) {
  return left.some(value => right.has(value))
}

export function createGraphWorkflowSessionRegistry() {
  const routeByProjectId = new Map()
  const projectIdsBySimulationId = new Map()
  const projectIdsByReportId = new Map()

  function remember({ projectIds = [], simulationId = '', reportId = '', route = '' } = {}) {
    const nextRoute = text(route)
    const simulationKey = text(simulationId)
    const reportKey = text(reportId)
    const linkedIds = new Set(normalizedIds(projectIds))

    projectIdsBySimulationId.get(simulationKey)?.forEach(id => linkedIds.add(id))
    projectIdsByReportId.get(reportKey)?.forEach(id => linkedIds.add(id))
    if (!nextRoute || linkedIds.size === 0) return false

    linkedIds.forEach(id => routeByProjectId.set(id, nextRoute))
    if (simulationKey) projectIdsBySimulationId.set(simulationKey, new Set(linkedIds))
    if (reportKey) projectIdsByReportId.set(reportKey, new Set(linkedIds))
    return true
  }

  function advance(lookup, key, route) {
    const linkedIds = lookup.get(text(key))
    if (!linkedIds?.size) return false
    return remember({ projectIds: [...linkedIds], route })
  }

  return {
    remember,
    resolve(projectIds = []) {
      for (const id of normalizedIds(projectIds)) {
        const route = routeByProjectId.get(id)
        if (route) return route
      }
      return ''
    },
    advanceSimulation(simulationId, route) {
      return advance(projectIdsBySimulationId, simulationId, route)
    },
    advanceReport(reportId, route) {
      return advance(projectIdsByReportId, reportId, route)
    },
    clear(projectIds = []) {
      const removed = new Set(normalizedIds(projectIds))
      removed.forEach(id => routeByProjectId.delete(id))
      for (const [key, linkedIds] of projectIdsBySimulationId) {
        if (intersects([...linkedIds], removed)) projectIdsBySimulationId.delete(key)
      }
      for (const [key, linkedIds] of projectIdsByReportId) {
        if (intersects([...linkedIds], removed)) projectIdsByReportId.delete(key)
      }
    }
  }
}

const graphWorkflowSession = createGraphWorkflowSessionRegistry()

export function useGraphWorkflowSession() {
  return graphWorkflowSession
}
