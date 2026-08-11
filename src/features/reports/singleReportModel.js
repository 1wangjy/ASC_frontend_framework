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
  let checking = false
  let generating = false
  let inspected = false
  let contextVersion = 0
  let checkPromise = null
  let generationPromise = null

  function snapshot() {
    return { simulationId, reportId, checking, generating, inspected }
  }

  function publish() {
    onStateChange(snapshot())
  }

  function activate(value) {
    const nextSimulationId = requireSimulationId(value)
    if (simulationId === nextSimulationId) return nextSimulationId
    simulationId = nextSimulationId
    reportId = ''
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
      reportId = completedReportFromStatus(response)
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

    if (reportId) {
      const destination = { reportId, taskId: '' }
      await openReport(destination)
      return { ...destination, reused: true }
    }
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
