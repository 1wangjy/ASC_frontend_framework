import { buildLogicalGraphProjects } from '../projects/logicalGraphProjectModel.js'
import {
  readActiveProjectId,
  rememberActiveProjectId
} from '../projects/projectContextModel.js'
import {
  buildQualifiedQaProjects,
  resolveQualifiedQaSelection
} from './qaProjectEligibilityModel.js'

function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error || 'Unable to load qualified QA projects')
}

function hasExplicitRouteSelection(request = {}) {
  return Boolean(
    String(request?.routeProjectId ?? '').trim()
    || String(request?.routeReportId ?? '').trim()
  )
}

function cloneValue(value) {
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)])
    )
  }
  return value
}

export function createQaProjectContextController({
  refreshProjects,
  getProjects,
  listReports,
  storage,
  onChange = () => {}
} = {}) {
  if (typeof refreshProjects !== 'function') throw new TypeError('refreshProjects is required')
  if (typeof getProjects !== 'function') throw new TypeError('getProjects is required')
  if (typeof listReports !== 'function') throw new TypeError('listReports is required')

  const state = {
    loading: false,
    records: [],
    selected: null,
    error: '',
    requestVersion: 0
  }
  let currentVersion = 0
  let selectionVersion = 0
  let stopped = false

  function snapshot() {
    return cloneValue({
      loading: state.loading,
      records: state.records,
      selected: state.selected,
      error: state.error,
      requestVersion: state.requestVersion
    })
  }

  function publish(version, changes) {
    if (stopped || version !== currentVersion) return false
    Object.assign(state, changes)
    onChange(snapshot())
    return true
  }

  async function refresh(selectionRequest = {}) {
    if (stopped) return snapshot()

    const version = ++currentVersion
    const refreshSelectionVersion = selectionVersion
    publish(version, {
      loading: true,
      error: '',
      requestVersion: version
    })

    try {
      const [, reportResponse] = await Promise.all([
        refreshProjects(),
        listReports()
      ])
      if (stopped || version !== currentVersion) return snapshot()

      const logicalProjects = buildLogicalGraphProjects(getProjects())
      const records = buildQualifiedQaProjects(logicalProjects, reportResponse)
      const explicitRoute = hasExplicitRouteSelection(selectionRequest)
      const routeStillOwnsSelection = selectionVersion === refreshSelectionVersion
      const selected = resolveQualifiedQaSelection(records, explicitRoute && routeStillOwnsSelection
        ? selectionRequest
        : {
            storedProjectId: state.selected?.projectId
              || readActiveProjectId(storage)
          })

      if (!publish(version, { records, selected, error: '' })) return snapshot()

      if (
        !stopped
        && version === currentVersion
        && selectionVersion === refreshSelectionVersion
        && selected
        && readActiveProjectId(storage) !== selected.projectId
      ) {
        rememberActiveProjectId(storage, selected.projectId)
      }
    } catch (error) {
      publish(version, {
        records: [],
        selected: null,
        error: errorMessage(error)
      })
    } finally {
      publish(version, { loading: false })
    }

    return snapshot()
  }

  function select(projectId) {
    if (stopped) return false
    const normalizedId = String(projectId ?? '').trim()
    const selected = state.records.find(record => record.projectId === normalizedId) || null
    if (!selected) return false

    selectionVersion += 1
    state.selected = selected
    rememberActiveProjectId(storage, selected.projectId)
    onChange(snapshot())
    return true
  }

  function clear() {
    if (stopped) return
    selectionVersion += 1
    state.selected = null
    rememberActiveProjectId(storage, '')
    onChange(snapshot())
  }

  function stop() {
    if (stopped) return
    stopped = true
    currentVersion += 1
    state.requestVersion = currentVersion
    state.loading = false
    onChange(snapshot())
  }

  return { refresh, select, clear, stop, snapshot }
}
