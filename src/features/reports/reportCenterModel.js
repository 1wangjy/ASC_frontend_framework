import { buildProjectReportTitle } from './reportReaderModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function timestampOf(report = {}) {
  return Math.max(
    Date.parse(report.completed_at || '') || 0,
    Date.parse(report.created_at || '') || 0
  )
}

function normalizedStatus(value) {
  const status = text(value).toLowerCase()
  if (status === 'completed') return { status: 'completed', label: '已完成' }
  if (['generating', 'processing', 'running', 'pending'].includes(status)) {
    return { status: 'generating', label: '生成中' }
  }
  if (['failed', 'error'].includes(status)) return { status: 'failed', label: '生成失败' }
  return { status: 'unknown', label: '状态未知' }
}

function projectGraphId(project = {}) {
  return text(project.graphId || project.graph_id)
}

function projectSimulationId(project = {}) {
  return text(project.simulationId || project.simulation_id)
}

function projectName(project = {}) {
  return text(project.name || project.projectName || project.project_name) || '未关联项目'
}

export function unwrapReports(response = []) {
  if (Array.isArray(response)) return response
  return Array.isArray(response?.data) ? response.data : []
}

export function formatReportDate(value) {
  const raw = text(value)
  if (!raw) return '时间未知'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export function buildReportCenterItems(reports = [], projects = []) {
  const graphProjects = new Map()
  const simulationProjects = new Map()

  ;(Array.isArray(projects) ? projects : []).forEach(project => {
    const graphId = projectGraphId(project)
    const simulationId = projectSimulationId(project)
    if (graphId) graphProjects.set(graphId, project)
    if (simulationId) simulationProjects.set(simulationId, project)
  })

  const latestBySimulation = new Map()
  unwrapReports(reports).forEach(report => {
    const reportId = text(report?.report_id || report?.reportId)
    if (!reportId) return
    const simulationId = text(report?.simulation_id || report?.simulationId)
    const key = simulationId ? `simulation:${simulationId}` : `report:${reportId}`
    const previous = latestBySimulation.get(key)
    if (!previous || timestampOf(report) >= timestampOf(previous)) {
      latestBySimulation.set(key, report)
    }
  })

  return [...latestBySimulation.values()]
    .map(report => {
      const reportId = text(report.report_id || report.reportId)
      const simulationId = text(report.simulation_id || report.simulationId)
      const graphId = text(report.graph_id || report.graphId)
      const project = graphProjects.get(graphId) || simulationProjects.get(simulationId)
      const status = normalizedStatus(report.status)

      return {
        reportId,
        simulationId,
        graphId,
        title: text(report.title) || '未命名研究报告',
        subtitle: text(report.subtitle || report.simulation_requirement),
        projectName: projectName(project),
        displayTitle: buildProjectReportTitle(project ? projectName(project) : ''),
        status: status.status,
        statusLabel: status.label,
        createdAt: text(report.created_at),
        completedAt: text(report.completed_at),
        error: text(report.error),
        timestamp: timestampOf(report)
      }
    })
    .sort((left, right) => right.timestamp - left.timestamp)
}

export function buildReportCenterRecordItems(records = []) {
  return (Array.isArray(records) ? records : []).map(record => {
    const report = record?.report || {}
    const status = record?.canGenerate
      ? { status: 'ready', label: '可生成' }
      : normalizedStatus(record?.reportStatus || report.status)
    const name = projectName(record)

    return {
      ...record,
      title: text(report.title) || (record?.reportId ? '未命名研究报告' : '尚未生成报告'),
      subtitle: text(report.subtitle || report.simulation_requirement),
      projectName: name,
      displayTitle: buildProjectReportTitle(name),
      status: status.status,
      statusLabel: status.label,
      createdAt: text(report.created_at),
      completedAt: text(report.completed_at),
      error: text(report.error)
    }
  })
}
