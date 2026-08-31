import { buildReportProjectRecords } from './reportProjectLifecycleModel.js'
import { saveReportDownload } from './reportDownload.js'
import { buildReportGenerationPayload, createSingleReportFlow } from './singleReportModel.js'
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
  deleteReport,
  getProjects,
  openReport,
  browser,
  onChange = () => {}
} = {}) {
  if (typeof listReports !== 'function') throw new TypeError('listReports is required')
  if (typeof checkExistingReport !== 'function') throw new TypeError('checkExistingReport is required')
  if (typeof generateReport !== 'function') throw new TypeError('generateReport is required')
  if (typeof downloadReport !== 'function') throw new TypeError('downloadReport is required')
  if (typeof deleteReport !== 'function') throw new TypeError('deleteReport is required')
  if (typeof getProjects !== 'function') throw new TypeError('getProjects is required')
  if (typeof openReport !== 'function') throw new TypeError('openReport is required')

  const state = {
    loading: true,
    mutatingProjectId: '',
    downloadingReportId: '',
    deletingReportId: '',
    reports: [],
    records: buildReportProjectRecords(getProjects(), []),
    error: '',
    actionError: ''
  }
  const generations = new Map()
  let activeDownloadPromise = null
  const deletions = new Map()
  let lifecycleVersion = 0
  let refreshSequence = 0
  let stopped = false

  function active(version) {
    return !stopped && version === lifecycleVersion
  }

  function publish(version = lifecycleVersion) {
    if (active(version)) onChange({ ...state })
  }

  function refresh({ background = false, clearActionError = !background } = {}) {
    if (stopped) return Promise.resolve(state)
    const version = lifecycleVersion
    const requestId = ++refreshSequence
    const showLoading = !background || state.loading || !state.records.length
    if (showLoading) {
      state.loading = true
      state.error = ''
    }
    if (clearActionError) state.actionError = ''
    if (showLoading) publish(version)

    return (async () => {
      try {
        const response = await listReports({ limit: 50 })
        if (!active(version) || requestId !== refreshSequence) return state
        state.error = ''
        state.reports = unwrapReports(response)
        state.records = buildReportProjectRecords(getProjects(), state.reports)
      } catch (error) {
        if (showLoading && active(version) && requestId === refreshSequence) {
          state.error = message(error, '报告列表加载失败。')
        }
      } finally {
        if (active(version) && requestId === refreshSequence) {
          if (showLoading) state.loading = false
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

  function generate(record = {}, options = {}) {
    const projectId = text(record.projectId || record.project_id)
    const simulationId = text(record.simulationId || record.simulation_id)
    const key = projectId || simulationId
    if (!key || !simulationId) return Promise.reject(new Error('simulation_id is required'))
    if (generations.has(key)) return generations.get(key)
    if (stopped) return Promise.reject(new Error('report center is stopped'))

    const version = lifecycleVersion
    const forceRegenerate = options?.forceRegenerate === true
    const reportName = text(options?.reportName)
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
        let result
        if (forceRegenerate) {
          requested = true
          const response = await generateReport(buildReportGenerationPayload({
            simulationId,
            forceRegenerate: true,
            reportName
          }))
          const reportId = text(response?.data?.report_id)
          if (response?.success !== true || !reportId) {
            throw new Error(response?.error || '启动报告生成失败')
          }
          result = { reportId, taskId: text(response?.data?.task_id), reused: false }
          if (active(version)) await openReport(result)
        } else {
          result = await flow.proceed(simulationId)
        }
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

  function deleteRecord(record = {}) {
    const reportId = text(record.reportId || record.report_id)
    if (!reportId) return Promise.reject(new Error('report_id is required'))
    if (stopped) return Promise.reject(new Error('report center is stopped'))
    if (deletions.has(reportId)) return deletions.get(reportId)

    const projectName = text(record.projectName || record.project_name) || '该项目'
    const confirmed = browser?.confirm?.(`确认删除“${projectName}”的研究报告吗？此操作不可恢复。`) === true
    if (!confirmed) return Promise.resolve(false)

    const version = lifecycleVersion
    state.actionError = ''
    state.deletingReportId = reportId
    publish(version)

    const pending = (async () => {
      try {
        const result = await deleteReport(reportId)
        if (active(version)) await refresh({ clearActionError: false })
        return result
      } catch (error) {
        if (active(version)) {
          state.actionError = message(error, '报告删除失败。')
          publish(version)
        }
        throw error
      } finally {
        deletions.delete(reportId)
        if (active(version) && state.deletingReportId === reportId) {
          state.deletingReportId = ''
          publish(version)
        }
      }
    })()
    deletions.set(reportId, pending)
    return pending
  }

  function stop() {
    if (stopped) return
    stopped = true
    lifecycleVersion += 1
    refreshSequence += 1
  }

  return { state, refresh, syncProjects, generate, download, delete: deleteRecord, stop }
}
