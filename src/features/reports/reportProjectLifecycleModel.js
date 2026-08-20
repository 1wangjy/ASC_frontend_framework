import { normalizeReportStatus } from './reportReaderModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function projectId(project = {}) {
  project = project || {}
  return text(project.projectId || project.project_id)
}

function graphId(item = {}) {
  item = item || {}
  return text(item.graphId || item.graph_id)
}

function simulationId(item = {}) {
  item = item || {}
  return text(item.simulationId || item.simulation_id)
}

function projectName(project = {}) {
  project = project || {}
  return text(project.name || project.project_name)
}

function reportId(report = {}) {
  report = report || {}
  return text(report.reportId || report.report_id)
}

function reportTaskId(report = {}) {
  report = report || {}
  return text(report.reportTaskId || report.report_task_id || report.taskId || report.task_id)
}

function timestampOf(report = {}) {
  return Math.max(
    Date.parse(report.updated_at || '') || 0,
    Date.parse(report.completed_at || '') || 0,
    Date.parse(report.created_at || '') || 0
  )
}

function newestFirst(left, right) {
  const timestampDifference = timestampOf(right) - timestampOf(left)
  return timestampDifference || reportId(right).localeCompare(reportId(left))
}

function reportRecord(project, report) {
  const status = report ? normalizeReportStatus(report.status) : ''
  const hasReport = Boolean(reportId(report))
  const completed = status === 'completed'

  return {
    projectId: projectId(project),
    graphId: graphId(project) || graphId(report),
    simulationId: simulationId(project) || simulationId(report),
    projectName: project ? projectName(project) : '未关联图谱',
    evolutionStatus: text(project?.evolutionStatus || project?.evolution_status),
    reportId: reportId(report),
    reportStatus: status,
    reportTaskId: reportTaskId(report),
    report: report || null,
    canGenerate: Boolean(project) && isEvolutionComplete(project) && !hasReport,
    canRegenerate: Boolean(project) && isEvolutionComplete(project) && hasReport,
    canPreview: completed,
    canDownload: completed,
    canDelete: hasReport && ['completed', 'failed'].includes(status),
    canOpenQa: Boolean(project) && completed
  }
}

export function isEvolutionComplete(project = {}) {
  return text(project.evolutionStatus || project.evolution_status) === 'evolution_completed'
}

export function buildReportProjectRecords(projects = [], reports = []) {
  const normalizedProjects = Array.isArray(projects) ? projects : []
  const projectsByGraph = new Map()
  const projectsBySimulation = new Map()

  normalizedProjects.forEach(project => {
    const graph = graphId(project)
    const simulation = simulationId(project)
    if (graph) projectsByGraph.set(graph, project)
    if (simulation) projectsBySimulation.set(simulation, project)
  })

  const reportsByProject = new Map()
  const unmatchedReports = []

  ;(Array.isArray(reports) ? reports : []).forEach(report => {
    if (!reportId(report)) return
    const project = projectsByGraph.get(graphId(report)) || projectsBySimulation.get(simulationId(report))
    if (!project) {
      unmatchedReports.push(report)
      return
    }

    const key = projectId(project) || `project:${normalizedProjects.indexOf(project)}`
    const projectReports = reportsByProject.get(key) || []
    projectReports.push(report)
    reportsByProject.set(key, projectReports)
  })

  return [
    ...normalizedProjects.flatMap((project, index) => {
      const key = projectId(project) || `project:${index}`
      const projectReports = (reportsByProject.get(key) || []).slice().sort(newestFirst)
      return projectReports.length
        ? projectReports.map(report => reportRecord(project, report))
        : [reportRecord(project, null)]
    }),
    ...unmatchedReports.slice().sort(newestFirst).map(report => reportRecord(null, report))
  ]
}
