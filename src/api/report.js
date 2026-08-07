import service, { requestWithRetry } from './index'
import {
  buildReportDownloadRequest,
  buildReportSectionsRequest
} from './requestContracts'

/**
 * 开始报告生成
 * @param {Object} data - { simulation_id, force_regenerate? }
 */
export const generateReport = (data) => {
  return requestWithRetry(() => service.post('/api/report/generate', data), 3, 1000)
}

/**
 * 获取报告生成状态
 * 兼容两种调用方式：
 *   getReportStatus(reportId)              — 旧方式（初始提交 GET 接口）
 *   getReportStatus({ taskId, simulationId }) — 新方式（如果后端支持 POST）
 * @param {string|Object} identifiers
 */
export const getReportStatus = (identifiers) => {
  // 旧方式：getReportStatus(reportId)
  if (typeof identifiers === 'string') {
    return service.get(`/api/report/generate/status`, {
      params: { report_id: identifiers }
    })
  }
  // 新方式（降级）：尝试从对象中提取 reportId 字段
  const reportId = identifiers?.reportId || ''
  if (reportId) {
    return service.get(`/api/report/generate/status`, {
      params: { report_id: reportId }
    })
  }
  // 实在无法兼容时返回空结果
  return Promise.resolve({ success: false, data: null, message: '无法兼容的 getReportStatus 调用' })
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

/** 获取后端已生成的报告章节。 */
export const getReportSections = (reportId) => {
  return service(buildReportSectionsRequest(reportId))
}

/** 下载后端生成的 Markdown 报告。 */
export const downloadReport = (reportId) => {
  return service(buildReportDownloadRequest(reportId))
}

/**
 * 与 Report Agent 对话
 * @param {Object} data - { simulation_id, message, chat_history? }
 */
export const chatWithReport = (data) => {
  return requestWithRetry(() => service.post('/api/report/chat', data), 3, 1000)
}
