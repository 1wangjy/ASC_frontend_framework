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
  const candidateTime = reportTimestamp(candidate)
  const currentTime = reportTimestamp(current)
  if (candidateTime !== currentTime) return candidateTime > currentTime
  return reportIdOf(candidate).localeCompare(reportIdOf(current)) > 0
}

function indexProjects(projects = []) {
  const usable = (Array.isArray(projects) ? projects : [])
    .filter(project => (
      projectIdOf(project)
      && graphIdOf(project)
    ))
    .slice()
    .sort((left, right) => projectIdOf(left).localeCompare(projectIdOf(right)))
  const byGraph = new Map()
  const bySimulation = new Map()

  usable.forEach(project => {
    if (!byGraph.has(graphIdOf(project))) byGraph.set(graphIdOf(project), project)
    if (!bySimulation.has(simulationIdOf(project))) {
      bySimulation.set(simulationIdOf(project), project)
    }
  })

  return { usable, byGraph, bySimulation }
}

export function buildQualifiedQaProjects(projects = [], reports = []) {
  const { byGraph, bySimulation } = indexProjects(projects)
  const reportsByProject = new Map()

  ;(Array.isArray(reports) ? reports : []).forEach(report => {
    if (!reportIdOf(report) || normalizeReportStatus(report?.status) !== 'completed') return

    const project = byGraph.get(graphIdOf(report))
      || bySimulation.get(simulationIdOf(report))
    if (!project) return

    const projectId = projectIdOf(project)
    const current = reportsByProject.get(projectId)
    if (preferReport(report, current)) reportsByProject.set(projectId, report)
  })

  return [...reportsByProject.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([projectId, report]) => {
      const project = byGraph.get(graphIdOf(report))
        || bySimulation.get(simulationIdOf(report))
      const simulationId = simulationIdOf(project) || simulationIdOf(report)
      if (!simulationId) return null
      return {
        projectId,
        graphId: graphIdOf(project),
        simulationId,
        reportId: reportIdOf(report),
        projectName: projectNameOf(project) || projectId,
        reportStatus: 'completed',
        project
      }
    })
    .filter(Boolean)
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
