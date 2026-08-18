import { normalizeReportStatus } from './reportReaderModel.js'

function text(value) {
  return String(value ?? '').trim()
}

export function deriveSimulationReportHandoff(response = {}) {
  const data = response?.data || {}
  const reportId = text(data.report_id || data.reportId)
  const status = normalizeReportStatus(data.report_status || data.reportStatus || data.status)

  if (response?.success !== true) {
    return { state: 'unknown', label: '查看报告状态', reportId: '', shouldPoll: false }
  }
  if (status === 'completed' && reportId) {
    return { state: 'completed', label: '查看已生成报告', reportId, shouldPoll: false }
  }
  if (status === 'generating' && reportId) {
    return { state: 'generating', label: '报告生成中', reportId, shouldPoll: true }
  }
  if (status === 'failed') {
    return { state: 'failed', label: '报告生成失败', reportId, shouldPoll: false }
  }
  if (data.has_report === false && !reportId) {
    return { state: 'ready', label: '前往报告生成', reportId: '', shouldPoll: false }
  }
  return { state: 'unknown', label: '查看报告状态', reportId, shouldPoll: false }
}

export function buildSimulationReportDestination({ handoff = {}, projectId, simulationId } = {}) {
  const normalizedProjectId = text(projectId)
  const normalizedSimulationId = text(simulationId)
  const reportId = text(handoff.reportId)
  const query = {
    projectId: normalizedProjectId,
    simulationId: normalizedSimulationId
  }

  if (handoff.state === 'completed' && reportId) {
    return {
      name: 'Report',
      params: { reportId },
      query
    }
  }
  return { name: 'Reports', query }
}
