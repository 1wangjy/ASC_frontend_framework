import { reactive } from 'vue'

import { getTaskStatus, listProjects } from '../../api/graph.js'
import { getSimulationHistory } from '../../api/simulation.js'
import {
  getGraphMonitorDelay,
  mergeGraphEvolutionState,
  normalizeGraphTaskItems,
  unwrapGraphProjects
} from './graphTaskMonitorModel.js'

const ACTIVE_DELAY_MS = 1500
const IDLE_DELAY_MS = 12000
const MAX_RETRY_DELAY_MS = 15000

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unable to refresh graph projects')
}

export function createGraphTaskMonitor(dependencies = {}) {
  const api = {
    listProjects: dependencies.listProjects || listProjects,
    getTaskStatus: dependencies.getTaskStatus || getTaskStatus,
    getSimulationHistory: dependencies.getSimulationHistory || getSimulationHistory,
    schedule: dependencies.schedule || ((callback, delay) => globalThis.setTimeout(callback, delay)),
    cancelSchedule: dependencies.cancelSchedule || (timerId => globalThis.clearTimeout(timerId)),
    browser: dependencies.browser || globalThis,
    now: dependencies.now || Date.now
  }
  const state = reactive({
    items: [],
    connection: 'idle',
    error: '',
    lastSyncedAt: 0,
    completedRevision: 0,
    running: false,
    failureCount: 0
  })
  let requestSequence = 0
  let timer = null
  const observedQaReadiness = new Map()
  let listenersRegistered = false

  function cancelPendingSchedule() {
    if (timer !== null) api.cancelSchedule(timer)
    timer = null
  }

  function scheduleNext(delay) {
    cancelPendingSchedule()
    if (state.running) timer = api.schedule(() => { refresh() }, delay)
  }

  function normalDelay() {
    return api.browser?.document?.hidden === true
      ? IDLE_DELAY_MS
      : getGraphMonitorDelay(state.items, { activeMs: ACTIVE_DELAY_MS, idleMs: IDLE_DELAY_MS })
  }

  function updateCompletedRevision(nextItems) {
    for (const item of nextItems) {
      if (observedQaReadiness.has(item.projectId) && !observedQaReadiness.get(item.projectId) && item.canOpenQa) {
        state.completedRevision += 1
      }
      observedQaReadiness.set(item.projectId, item.canOpenQa)
    }
  }

  async function refresh() {
    const requestId = ++requestSequence
    state.connection = state.connection === 'idle' ? 'connecting' : 'reconnecting'
    try {
      const [response, simulationHistory] = await Promise.all([
        api.listProjects({ limit: 50 }),
        api.getSimulationHistory(100).catch(() => [])
      ])
      const projects = unwrapGraphProjects(response)
      const activeTaskIds = [...new Set(
        projects
          .filter(project => project.status === 'graph_building')
          .map(project => String(project.graph_build_task_id || '').trim())
          .filter(Boolean)
      )]
      const taskResults = await Promise.allSettled(
        activeTaskIds.map(async taskId => [taskId, await api.getTaskStatus(taskId)])
      )
      const taskById = new Map(
        taskResults
          .filter(result => result.status === 'fulfilled' && result.value[1]?.success)
          .map(result => [result.value[0], result.value[1].data])
      )
      const nextItems = mergeGraphEvolutionState(
        normalizeGraphTaskItems(projects, taskById),
        simulationHistory
      )
      if (requestId !== requestSequence) return state

      updateCompletedRevision(nextItems)
      state.items = nextItems
      state.connection = 'online'
      state.error = ''
      state.failureCount = 0
      state.lastSyncedAt = api.now()
      scheduleNext(normalDelay())
    } catch (error) {
      if (requestId !== requestSequence) return state

      state.connection = 'offline'
      state.error = errorMessage(error)
      state.failureCount += 1
      scheduleNext(Math.min(MAX_RETRY_DELAY_MS, ACTIVE_DELAY_MS * 2 ** (state.failureCount - 1)))
    }
    return state
  }

  const onFocusOrOnline = () => refresh()
  const onVisibilityChange = () => {
    if (api.browser?.document?.hidden === true) scheduleNext(IDLE_DELAY_MS)
    else refresh()
  }

  function start() {
    if (state.running) return undefined
    state.running = true
    if (!listenersRegistered) {
      api.browser?.addEventListener?.('focus', onFocusOrOnline)
      api.browser?.addEventListener?.('online', onFocusOrOnline)
      api.browser?.document?.addEventListener?.('visibilitychange', onVisibilityChange)
      listenersRegistered = true
    }
    return refresh()
  }

  function stop() {
    cancelPendingSchedule()
    if (listenersRegistered) {
      api.browser?.removeEventListener?.('focus', onFocusOrOnline)
      api.browser?.removeEventListener?.('online', onFocusOrOnline)
      api.browser?.document?.removeEventListener?.('visibilitychange', onVisibilityChange)
      listenersRegistered = false
    }
    requestSequence += 1
    state.running = false
  }

  return { state, start, stop, refresh }
}

let graphTaskMonitor

export function useGraphTaskMonitor() {
  if (!graphTaskMonitor) graphTaskMonitor = createGraphTaskMonitor()
  return graphTaskMonitor
}
