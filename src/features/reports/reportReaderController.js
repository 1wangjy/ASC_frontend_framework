import { normalizeReportStatus } from './reportReaderModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function initialState(reportId = '', taskId = '') {
  return {
    reportId,
    taskId,
    loading: Boolean(reportId),
    report: null,
    sectionsResponse: null,
    agentLogs: [],
    agentLogLine: 0,
    status: 'unknown',
    error: ''
  }
}

function responseData(response, fallbackMessage) {
  if (response?.success !== true || !response?.data) {
    throw new Error(response?.error || fallbackMessage)
  }
  return response.data
}

function mergeAgentSections(report, sectionsResponse, agentResponse, previousLogs = []) {
  const agentData = agentResponse?.success === true && agentResponse?.data
    ? agentResponse.data
    : { logs: [], from_line: 0 }
  const newLogs = Array.isArray(agentData.logs) ? agentData.logs : []
  const data = sectionsResponse?.success === true && sectionsResponse?.data
    ? sectionsResponse.data
    : { sections: [], total_sections: 0, is_complete: false }
  const sectionsByIndex = new Map(
    (Array.isArray(data.sections) ? data.sections : [])
      .map(section => [Number(section?.section_index), section])
      .filter(([index]) => Number.isFinite(index) && index > 0)
  )

  newLogs.forEach(log => {
    if (log?.action !== 'section_complete' || !log?.details?.content) return
    const index = Number(log.section_index)
    if (!Number.isFinite(index) || index <= 0) return
    sectionsByIndex.set(index, {
      ...(sectionsByIndex.get(index) || {}),
      section_index: index,
      section_title: log.section_title,
      content: log.details.content
    })
  })

  const outlineTotal = Array.isArray(report?.outline?.sections)
    ? report.outline.sections.length
    : 0
  const sections = [...sectionsByIndex.values()].sort(
    (left, right) => Number(left.section_index) - Number(right.section_index)
  )
  return {
    sectionsResponse: {
      success: true,
      data: {
        ...data,
        sections,
        total_sections: Math.max(Number(data.total_sections) || 0, outlineTotal, sections.length)
      }
    },
    agentLogs: [...previousLogs, ...newLogs],
    agentLogLine: Math.max(0, Number(agentData.from_line) || 0) + newLogs.length
  }
}

export function createReportReaderController({
  getReport,
  getSections,
  getAgentLog,
  getStatus,
  onChange = () => {},
  schedule = setInterval,
  cancel = clearInterval,
  intervalMs = 2000
} = {}) {
  if (typeof getReport !== 'function') throw new TypeError('getReport is required')
  if (typeof getSections !== 'function') throw new TypeError('getSections is required')
  if (typeof getAgentLog !== 'function') throw new TypeError('getAgentLog is required')
  if (typeof getStatus !== 'function') throw new TypeError('getStatus is required')

  let state = initialState()
  let generation = 0
  let timer = null
  let inFlight = null

  function snapshot() {
    return {
      ...state,
      agentLogs: [...state.agentLogs]
    }
  }

  function publish(patch = {}) {
    state = { ...state, ...patch }
    onChange(snapshot())
  }

  function stopTimer() {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  async function safeSections(reportId) {
    try {
      const response = await getSections(reportId)
      return response?.success === true ? response : null
    } catch {
      return null
    }
  }

  async function loadCurrent(reportId, taskId, agentLogLine, previousLogs) {
    let reportResponse = await getReport(reportId)
    let report = responseData(reportResponse, '报告读取失败')
    let sectionsResponse = await safeSections(reportId)
    let status = normalizeReportStatus(report.status)
    let error = status === 'failed' ? text(report.error) || '报告生成失败' : ''
    let agentLogs = previousLogs
    let nextAgentLogLine = agentLogLine

    if (status !== 'completed' && status !== 'failed') {
      const [agentResponse, statusResponse] = await Promise.all([
        getAgentLog(reportId, agentLogLine).catch(() => null),
        taskId ? getStatus({ taskId }).catch(requestError => ({
          success: false,
          error: requestError?.message || '报告状态读取失败'
        })) : null
      ])
      const merged = mergeAgentSections(report, sectionsResponse, agentResponse, previousLogs)
      sectionsResponse = merged.sectionsResponse
      agentLogs = merged.agentLogs
      nextAgentLogLine = merged.agentLogLine

      const taskStatus = normalizeReportStatus(statusResponse?.data?.status)
      if (taskStatus === 'failed') {
        status = 'failed'
        error = text(statusResponse?.data?.message || statusResponse?.error) || '报告生成失败'
      } else if (taskStatus === 'completed') {
        reportResponse = await getReport(reportId)
        report = responseData(reportResponse, '报告读取失败')
        sectionsResponse = await safeSections(reportId) || sectionsResponse
        status = normalizeReportStatus(report.status)
        if (status === 'unknown') status = 'generating'
      } else if (statusResponse?.success === false) {
        error = text(statusResponse.error) || '报告状态读取失败'
      }

      if (agentLogs.some(log => log?.action === 'report_complete')) {
        const finalResponse = await getReport(reportId)
        report = responseData(finalResponse, '报告读取失败')
        sectionsResponse = await safeSections(reportId) || sectionsResponse
        status = normalizeReportStatus(report.status)
        if (status === 'unknown') status = 'completed'
      }
    }

    return {
      report,
      sectionsResponse,
      agentLogs,
      agentLogLine: nextAgentLogLine,
      status,
      error,
      loading: false
    }
  }

  function refresh() {
    if (!state.reportId) return Promise.resolve(snapshot())
    if (inFlight?.generation === generation) return inFlight.promise

    const activeGeneration = generation
    const activeReportId = state.reportId
    const request = loadCurrent(
      activeReportId,
      state.taskId,
      state.agentLogLine,
      state.agentLogs
    )
    const pending = Promise.resolve(request)
      .then(next => {
        if (generation !== activeGeneration || state.reportId !== activeReportId) return snapshot()
        publish(next)
        if (next.status === 'completed' || next.status === 'failed') stopTimer()
        return snapshot()
      })
      .catch(error => {
        if (generation !== activeGeneration || state.reportId !== activeReportId) return snapshot()
        publish({ loading: false, error: error?.message || '报告读取失败' })
        return snapshot()
      })
      .finally(() => {
        if (inFlight?.promise === pending) inFlight = null
      })

    inFlight = { generation: activeGeneration, promise: pending }
    return pending
  }

  function startTimer() {
    if (timer !== null || !['generating', 'unknown'].includes(state.status)) return
    timer = schedule(refresh, intervalMs)
  }

  async function open({ reportId, taskId = '' } = {}) {
    const nextReportId = text(reportId)
    if (!nextReportId) throw new Error('report_id is required')
    stop()
    state = initialState(nextReportId, text(taskId))
    onChange(snapshot())
    const activeGeneration = generation
    const result = await refresh()
    if (generation === activeGeneration && state.reportId === nextReportId) startTimer()
    return result
  }

  function stop() {
    generation += 1
    stopTimer()
  }

  return { open, refresh, stop, snapshot }
}
