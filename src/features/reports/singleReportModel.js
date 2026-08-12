function text(value) {
  return String(value ?? '').trim()
}

function requireSimulationId(value) {
  const simulationId = text(value)
  if (!simulationId) throw new Error('simulation_id is required')
  return simulationId
}

export function buildSingleReportGenerationPayload(simulationId) {
  return {
    simulation_id: requireSimulationId(simulationId),
    force_regenerate: false
  }
}

export function completedReportFromStatus(response = {}) {
  const data = response?.data || {}
  if (
    response?.success !== true
    || data?.has_report !== true
    || text(data?.report_status).toLowerCase() !== 'completed'
  ) {
    return ''
  }
  return text(data?.report_id)
}

export function existingReportFromStatus(response = {}) {
  const data = response?.data || {}
  const reportId = text(data.report_id)
  if (response?.success !== true || !reportId) return null
  return {
    reportId,
    reportStatus: text(data.report_status).toLowerCase() || 'unknown',
    taskId: text(data.task_id)
  }
}

export function createSingleReportFlow({
  checkExistingReport,
  requestReport,
  openReport,
  onStateChange = () => {}
} = {}) {
  if (typeof checkExistingReport !== 'function') throw new TypeError('checkExistingReport is required')
  if (typeof requestReport !== 'function') throw new TypeError('requestReport is required')
  if (typeof openReport !== 'function') throw new TypeError('openReport is required')

  let simulationId = ''
  let reportId = ''
  let reportStatus = ''
  let taskId = ''
  let generationAllowed = false
  let checking = false
  let generating = false
  let inspected = false
  let contextVersion = 0
  let checkPromise = null
  let generationPromise = null

  function snapshot() {
    return { simulationId, reportId, reportStatus, taskId, checking, generating, inspected }
  }

  function publish() {
    onStateChange(snapshot())
  }

  function activate(value) {
    const nextSimulationId = requireSimulationId(value)
    if (simulationId === nextSimulationId) return nextSimulationId
    simulationId = nextSimulationId
    reportId = ''
    reportStatus = ''
    taskId = ''
    generationAllowed = false
    checking = false
    generating = false
    inspected = false
    checkPromise = null
    generationPromise = null
    contextVersion += 1
    publish()
    return nextSimulationId
  }

  async function inspect(value) {
    const activeSimulationId = activate(value)
    if (inspected) return snapshot()
    if (checkPromise) return checkPromise

    const version = contextVersion
    checking = true
    publish()
    const pending = (async () => {
      const response = await checkExistingReport(activeSimulationId)
      if (response?.success !== true) {
        throw new Error(response?.error || '无法确认当前模拟的报告状态')
      }
      if (version !== contextVersion || simulationId !== activeSimulationId) return snapshot()
      const existingReport = existingReportFromStatus(response)
      if (existingReport) {
        reportId = existingReport.reportId
        reportStatus = existingReport.reportStatus
        taskId = existingReport.taskId
      } else if (response?.data?.has_report === false) {
        generationAllowed = true
      } else {
        throw new Error('Unable to confirm the current simulation report status')
      }
      inspected = true
      return snapshot()
    })()
    checkPromise = pending

    try {
      return await pending
    } finally {
      if (checkPromise === pending) {
        checkPromise = null
        checking = false
        publish()
      }
    }
  }

  async function proceed(value) {
    const activeSimulationId = activate(value)
    await inspect(activeSimulationId)

    if (simulationId !== activeSimulationId) return { ...snapshot(), stale: true }

    if (reportId) {
      const destination = { reportId, taskId }
      await openReport(destination)
      return { ...destination, reused: true }
    }
    if (!generationAllowed) throw new Error('Unable to confirm the current simulation report status')
    if (generationPromise) return generationPromise

    const version = contextVersion
    generating = true
    publish()
    const pending = (async () => {
      const response = await requestReport(buildSingleReportGenerationPayload(activeSimulationId))
      if (response?.success !== true || !text(response?.data?.report_id)) {
        throw new Error(response?.error || '启动报告生成失败')
      }
      const destination = {
        reportId: text(response.data.report_id),
        taskId: text(response.data.task_id)
      }
      if (version !== contextVersion || simulationId !== activeSimulationId) {
        return { ...destination, reused: Boolean(response.data.already_generated), stale: true }
      }
      reportId = destination.reportId
      reportStatus = text(response.data.report_status || response.data.status).toLowerCase() || 'unknown'
      taskId = destination.taskId
      await openReport(destination)
      return { ...destination, reused: Boolean(response.data.already_generated) }
    })()
    generationPromise = pending

    try {
      return await pending
    } finally {
      if (generationPromise === pending) {
        generationPromise = null
        generating = false
        publish()
      }
    }
  }

  return { inspect, proceed, snapshot }
}
