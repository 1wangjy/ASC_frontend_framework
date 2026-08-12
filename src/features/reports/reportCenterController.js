import { buildReportProjectRecords } from './reportProjectLifecycleModel.js'
import { saveReportDownload } from './reportDownload.js'
import { createSingleReportFlow } from './singleReportModel.js'
import { unwrapReports } from './reportCenterModel.js'

function message(error, fallback) {
  return error instanceof Error ? error.message : String(error || fallback)
}

function text(value) {
  return String(value ?? '').trim()
}

export function createReportCenterController({
  listReports,
  checkExistingReport,
  generateReport,
  downloadReport,
  getProjects,
  openReport,
  browser,
  onChange = () => {}
} = {}) {
  if (typeof listReports !== 'function') throw new TypeError('listReports is required')
  if (typeof checkExistingReport !== 'function') throw new TypeError('checkExistingReport is required')
  if (typeof generateReport !== 'function') throw new TypeError('generateReport is required')
  if (typeof downloadReport !== 'function') throw new TypeError('downloadReport is required')
  if (typeof getProjects !== 'function') throw new TypeError('getProjects is required')
  if (typeof openReport !== 'function') throw new TypeError('openReport is required')

  const state = {
    loading: true,
    mutatingProjectId: '',
    downloadingReportId: '',
    reports: [],
    records: buildReportProjectRecords(getProjects(), []),
    error: '',
    actionError: ''
  }
  const generations = new Map()
  let activeDownloadPromise = null
  let lifecycleVersion = 0
  let refreshSequence = 0
  let stopped = false

  function active(version) {
    return !stopped && version === lifecycleVersion
  }

  function publish(version = lifecycleVersion) {
    if (active(version)) onChange({ ...state })
  }

  function refresh({ clearActionError = true } = {}) {
    if (stopped) return Promise.resolve(state)
    const version = lifecycleVersion
    const requestId = ++refreshSequence
    state.loading = true
    state.error = ''
    if (clearActionError) state.actionError = ''
    publish(version)

    return (async () => {
      try {
        const response = await listReports({ limit: 50 })
        if (!active(version) || requestId !== refreshSequence) return state
        state.reports = unwrapReports(response)
        state.records = buildReportProjectRecords(getProjects(), state.reports)
      } catch (error) {
        if (active(version) && requestId === refreshSequence) {
          state.error = message(error, '报告列表加载失败。')
        }
      } finally {
        if (active(version) && requestId === refreshSequence) {
          state.loading = false
          publish(version)
        }
      }
      return state
    })()
  }

  function syncProjects() {
    if (stopped) return state
    state.records = buildReportProjectRecords(getProjects(), state.reports)
    publish()
    return state
  }

  function generate(record = {}) {
    const projectId = text(record.projectId || record.project_id)
    const simulationId = text(record.simulationId || record.simulation_id)
    const key = projectId || simulationId
    if (!key || !simulationId) return Promise.reject(new Error('simulation_id is required'))
    if (generations.has(key)) return generations.get(key)
    if (stopped) return Promise.reject(new Error('report center is stopped'))

    const version = lifecycleVersion
    let requested = false
    state.actionError = ''
    state.mutatingProjectId = projectId
    publish(version)

    const flow = createSingleReportFlow({
      checkExistingReport,
      requestReport: payload => {
        requested = true
        return generateReport(payload)
      },
      openReport: destination => active(version) ? openReport(destination) : undefined
    })
    const pending = (async () => {
      try {
        const result = await flow.proceed(simulationId)
        return result
      } catch (error) {
        if (active(version)) {
          state.actionError = message(error, '报告操作失败。')
          publish(version)
        }
        throw error
      } finally {
        if (requested && active(version)) await refresh({ clearActionError: false })
        generations.delete(key)
        if (active(version) && state.mutatingProjectId === projectId) {
          state.mutatingProjectId = ''
          publish(version)
        }
      }
    })()
    generations.set(key, pending)
    return pending
  }

  function download(record = {}) {
    const reportId = text(record.reportId || record.report_id)
    if (!reportId) return Promise.reject(new Error('report_id is required'))
    if (stopped) return Promise.reject(new Error('report center is stopped'))
    if (activeDownloadPromise) return Promise.reject(new Error('report download already in progress'))

    const version = lifecycleVersion
    state.actionError = ''
    state.downloadingReportId = reportId
    publish(version)
    const pending = (async () => {
      try {
        return await saveReportDownload({
          reportId,
          projectName: record.projectName,
          downloadReport,
          browser,
          shouldSave: () => active(version)
        })
      } catch (error) {
        if (active(version)) {
          state.actionError = message(error, '报告下载失败。')
          publish(version)
        }
        throw error
      } finally {
        if (activeDownloadPromise === pending) activeDownloadPromise = null
        if (active(version) && state.downloadingReportId === reportId) {
          state.downloadingReportId = ''
          publish(version)
        }
      }
    })()
    activeDownloadPromise = pending
    return pending
  }

  function stop() {
    if (stopped) return
    stopped = true
    lifecycleVersion += 1
    refreshSequence += 1
  }

  return { state, refresh, syncProjects, generate, download, stop }
}
