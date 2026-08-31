import service, { requestWithRetry } from './index.js'
import {
  buildReportDeleteRequest,
  buildReportDownloadRequest,
  buildReportSectionsRequest,
  buildReportStatusRequest
} from './requestContracts.js'
import { buildReportGenerationPayload } from '../features/reports/singleReportModel.js'

/**
 * 开始报告生成
 * @param {Object} data - { simulation_id, force_regenerate?, report_name? }
 */
export const generateReport = (data) => {
  const payload = buildReportGenerationPayload({
    simulationId: data?.simulation_id,
    forceRegenerate: data?.force_regenerate,
    reportName: data?.report_name
  })
  return service.post('/api/report/generate', payload)
}

/** 查询当前模拟的已有报告状态；兼容后端仍返回单个关联报告的检查接口。 */
export const checkReportForSimulation = (simulationId) => {
  const id = String(simulationId ?? '').trim()
  if (!id) return Promise.reject(new Error('simulation_id is required'))
  return service.get(`/api/report/check/${encodeURIComponent(id)}`)
}

/**
 * 获取报告生成状态
 * @param {Object} identifiers - { taskId?, simulationId? }
 */
export const getReportStatus = (identifiers = {}) => {
  return service(buildReportStatusRequest(identifiers))
}

/**
 * 获取 Agent 日志（增量）
 * @param {string} reportId
 * @param {number} fromLine - 从第几行开始获取
 */
export const getAgentLog = (reportId, fromLine = 0) => {
  return service.get(`/api/report/${reportId}/agent-log`, { params: { from_line: fromLine } })
}

/**
 * 获取控制台日志（增量）
 * @param {string} reportId
 * @param {number} fromLine - 从第几行开始获取
 */
export const getConsoleLog = (reportId, fromLine = 0) => {
  return service.get(`/api/report/${reportId}/console-log`, { params: { from_line: fromLine } })
}

/**
 * 获取报告详情
 * @param {string} reportId
 */
export const getReport = (reportId) => {
  return service.get(`/api/report/${reportId}`)
}

/** 列出后端已经保存的报告；该接口只读，不触发报告生成。 */
export const listReports = (params = {}) => {
  return service.get('/api/report/list', { params })
}

/** 获取后端已生成的报告章节。 */
export const getReportSections = (reportId) => {
  return service(buildReportSectionsRequest(reportId))
}

/** 下载后端生成的 Markdown 报告。 */
export const downloadReport = (reportId) => {
  return service(buildReportDownloadRequest(reportId))
}

/** 删除后端保存的单份报告，不影响图谱项目和模拟数据。 */
export const deleteReport = (reportId) => {
  return service(buildReportDeleteRequest(reportId))
}

/**
 * 与 Report Agent 对话
 * @param {Object} data - { simulation_id, message, chat_history? }
 */
export const chatWithReport = (data) => {
  return requestWithRetry(() => service.post('/api/report/chat', data), 3, 1000)
}
