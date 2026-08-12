import { normalizeReportStatus } from '../reports/reportReaderModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function projectIdOf(project = {}) {
  return text(project?.projectId || project?.project_id)
}

function graphIdOf(item = {}) {
  return text(item?.graphId || item?.graph_id)
}

function simulationIdOf(item = {}) {
  return text(item?.simulationId || item?.simulation_id)
}

function reportIdOf(report = {}) {
  return text(report?.reportId || report?.report_id)
}

function projectNameOf(project = {}) {
  return text(project?.name || project?.projectName || project?.project_name)
}

function reportTimestamp(report = {}) {
  return Math.max(
    Date.parse(report?.updated_at || '') || 0,
    Date.parse(report?.completed_at || '') || 0,
    Date.parse(report?.created_at || '') || 0
  )
}

function preferReport(candidate, current) {
  if (!current) return true
  const candidateTime = reportTimestamp(candidate.report)
  const currentTime = reportTimestamp(current.report)
  if (candidateTime !== currentTime) return candidateTime > currentTime
  return candidate.reportId.localeCompare(current.reportId) > 0
}

function reportArray(input = []) {
  if (Array.isArray(input)) return input
  return Array.isArray(input?.data) ? input.data : []
}

function indexProjects(projects = []) {
  const usable = (Array.isArray(projects) ? projects : [])
    .filter(project => (
      projectIdOf(project)
      && graphIdOf(project)
    ))
    .slice()
    .sort((left, right) => projectIdOf(left).localeCompare(projectIdOf(right)))
  const graphOwners = new Map()
  const simulationOwners = new Map()
  const scopesByProjectId = new Map()
  const conflictingProjectIds = new Set()

  usable.forEach(project => {
    const projectId = projectIdOf(project)
    const graphId = graphIdOf(project)
    const simulationId = simulationIdOf(project)
    const scope = [graphId, simulationId].join('\u0000')
    const previousScope = scopesByProjectId.get(projectId)
    if (previousScope && previousScope !== scope) {
      conflictingProjectIds.add(projectId)
    } else if (!previousScope) {
      scopesByProjectId.set(projectId, scope)
    }

    const graphGroup = graphOwners.get(graphId) || new Map()
    if (!graphGroup.has(projectId)) graphGroup.set(projectId, project)
    graphOwners.set(graphId, graphGroup)

    if (simulationId) {
      const simulationGroup = simulationOwners.get(simulationId) || new Map()
      if (!simulationGroup.has(projectId)) simulationGroup.set(projectId, project)
      simulationOwners.set(simulationId, simulationGroup)
    }
  })

  function uniqueOwner(groups, id) {
    const group = groups.get(id)
    if (group?.size !== 1) return null
    const [projectId, project] = [...group.entries()][0]
    return conflictingProjectIds.has(projectId) ? null : project
  }

  return {
    projectForReport(report = {}) {
      const graphId = graphIdOf(report)
      if (graphOwners.has(graphId)) return uniqueOwner(graphOwners, graphId)

      const simulationId = simulationIdOf(report)
      if (simulationOwners.has(simulationId)) {
        return uniqueOwner(simulationOwners, simulationId)
      }
      return null
    }
  }
}

export function buildQualifiedQaProjects(projects = [], reports = []) {
  const { projectForReport } = indexProjects(projects)
  const candidates = []
  const scopesByReportId = new Map()
  const conflictingReportIds = new Set()
  const reportsByProject = new Map()

  reportArray(reports).forEach(report => {
    if (!reportIdOf(report) || normalizeReportStatus(report?.status) !== 'completed') return

    const project = projectForReport(report)
    if (!project) return

    const candidate = {
      report,
      project,
      projectId: projectIdOf(project),
      graphId: graphIdOf(project),
      simulationId: simulationIdOf(project) || simulationIdOf(report),
      reportId: reportIdOf(report)
    }
    if (!candidate.simulationId) return

    const scope = [
      candidate.projectId,
      candidate.graphId,
      candidate.simulationId,
      candidate.reportId
    ].join('\u0000')
    const previousScope = scopesByReportId.get(candidate.reportId)
    if (previousScope && previousScope !== scope) {
      conflictingReportIds.add(candidate.reportId)
    } else if (!previousScope) {
      scopesByReportId.set(candidate.reportId, scope)
    }
    candidates.push(candidate)
  })

  candidates.forEach(candidate => {
    if (conflictingReportIds.has(candidate.reportId)) return
    const { projectId } = candidate
    const current = reportsByProject.get(projectId)
    if (preferReport(candidate, current)) reportsByProject.set(projectId, candidate)
  })

  return [...reportsByProject.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([projectId, candidate]) => ({
      projectId,
      graphId: candidate.graphId,
      simulationId: candidate.simulationId,
      reportId: candidate.reportId,
      projectName: projectNameOf(candidate.project) || projectId,
      reportStatus: 'completed',
      project: candidate.project
    }))
}

export function resolveQualifiedQaSelection(records = [], request = {}) {
  const qualified = Array.isArray(records) ? records : []
  const routeProjectId = text(request?.routeProjectId)
  const routeReportId = text(request?.routeReportId)

  if (routeProjectId || routeReportId) {
    if (!routeProjectId || !routeReportId) return null
    return qualified.find(record => (
      text(record?.projectId) === routeProjectId
      && text(record?.reportId) === routeReportId
    )) || null
  }

  const storedProjectId = text(request?.storedProjectId)
  if (!storedProjectId) return null
  return qualified.find(record => text(record?.projectId) === storedProjectId) || null
}
