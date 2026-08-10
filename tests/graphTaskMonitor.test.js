import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createGraphTaskMonitor } from '../src/features/tasks/graphTaskMonitor.js'

function project(overrides = {}) {
  return {
    project_id: 'p1',
    project_name: 'Project one',
    graph_id: 'g1',
    status: 'graph_building',
    graph_build_task_id: 'task-1',
    updated_at: '2026-08-09T00:00:00Z',
    ...overrides
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function createHarness(overrides = {}) {
  const listeners = new Map()
  const scheduled = []
  const browser = {
    document: {
      hidden: false,
      addEventListener(type, listener) { listeners.set(`document:${type}`, listener) },
      removeEventListener(type) { listeners.delete(`document:${type}`) }
    },
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type) { listeners.delete(type) }
  }
  const dependencies = {
    listProjects: async () => ({ success: true, data: [] }),
    getTaskStatus: async () => ({ success: true, data: {} }),
    schedule(callback, delay) { const timer = { callback, delay }; scheduled.push(timer); return timer },
    cancelSchedule(timer) { const index = scheduled.indexOf(timer); if (index >= 0) scheduled.splice(index, 1) },
    browser,
    now: () => 1234,
    ...overrides
  }
  return { monitor: createGraphTaskMonitor(dependencies), listeners, scheduled, browser }
}

test('refreshes graph-building projects using distinct task-status progress', async () => {
  const listCalls = []
  const taskCalls = []
  const { monitor } = createHarness({
    listProjects: async options => {
      listCalls.push(options)
      return { success: true, data: [project(), project({ project_id: 'p2' }), project({ project_id: 'p3', status: 'created', graph_build_task_id: 'ignored' })] }
    },
    getTaskStatus: async taskId => { taskCalls.push(taskId); return { success: true, data: { progress: 73, message: 'Writing graph' } } }
  })

  await monitor.refresh()

  assert.deepEqual(listCalls, [{ limit: 50 }])
  assert.deepEqual(taskCalls, ['task-1'])
  assert.equal(monitor.state.items.find(item => item.projectId === 'p1').progress, 73)
})

test('preserves the last snapshot and exposes a failed project refresh', async () => {
  let shouldFail = false
  const { monitor } = createHarness({
    listProjects: async () => {
      if (shouldFail) throw new Error('backend unavailable')
      return { success: true, data: [project()] }
    }
  })
  await monitor.refresh()
  const previousItems = monitor.state.items
  shouldFail = true

  await monitor.refresh()

  assert.equal(monitor.state.items, previousItems)
  assert.equal(monitor.state.connection, 'offline')
  assert.equal(monitor.state.error, 'backend unavailable')
})

test('increments completedRevision only for an observed transition to QA-ready', async () => {
  let completed = true
  const { monitor } = createHarness({
    listProjects: async () => ({ success: true, data: [project({ status: completed ? 'graph_completed' : 'graph_building' })] })
  })
  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 0)
  completed = false
  await monitor.refresh()
  completed = true
  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 1)
  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 1)
})

test('increments completedRevision when an observed project reappears QA-ready after an absent snapshot', async () => {
  const snapshots = [
    [project({ status: 'graph_building' })],
    [],
    [project({ status: 'graph_completed' })]
  ]
  const { monitor } = createHarness({
    listProjects: async () => ({ success: true, data: snapshots.shift() })
  })

  await monitor.refresh()
  await monitor.refresh()
  await monitor.refresh()

  assert.equal(monitor.state.completedRevision, 1)
  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 1)
})

test('has no list-all-tasks API dependency', async () => {
  const source = await readFile(new URL('../src/features/tasks/graphTaskMonitor.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /\blistGraphTasks\b/)
  assert.doesNotMatch(source, /\/api\/graph\/tasks\b/)
})

test('does not let an older refresh overwrite a newer snapshot', async () => {
  const first = deferred()
  let call = 0
  const { monitor } = createHarness({
    listProjects: () => (++call === 1 ? first.promise : Promise.resolve({ success: true, data: [project({ project_id: 'new' })] }))
  })
  const earlier = monitor.refresh()
  await monitor.refresh()
  first.resolve({ success: true, data: [project({ project_id: 'old' })] })
  await earlier

  assert.deepEqual(monitor.state.items.map(item => item.projectId), ['new'])
})

test('keeps project data online when one task-status lookup fails', async () => {
  const { monitor } = createHarness({
    listProjects: async () => ({ success: true, data: [project()] }),
    getTaskStatus: async () => { throw new Error('task lookup failed') }
  })
  await monitor.refresh()

  assert.equal(monitor.state.connection, 'online')
  assert.equal(monitor.state.items[0].progress, 0)
  assert.equal(monitor.state.error, '')
})

test('start is idempotent and stop clears its lifecycle listeners and timer', async () => {
  const { monitor, listeners, scheduled } = createHarness()
  await monitor.start()
  await monitor.start()
  assert.equal(listeners.size, 3)
  assert.equal(scheduled.length, 1)
  monitor.stop()
  assert.equal(listeners.size, 0)
  assert.equal(scheduled.length, 0)
  assert.equal(monitor.state.running, false)
})

test('keeps native global timers bound to the browser receiver', async () => {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const timers = new Set()

  globalThis.setTimeout = function browserSetTimeout(callback, delay) {
    assert.equal(this, globalThis)
    const timer = { callback, delay }
    timers.add(timer)
    return timer
  }
  globalThis.clearTimeout = function browserClearTimeout(timer) {
    assert.equal(this, globalThis)
    timers.delete(timer)
  }

  try {
    const monitor = createGraphTaskMonitor({
      listProjects: async () => ({ success: true, data: [] }),
      getTaskStatus: async () => ({ success: true, data: {} }),
      browser: globalThis,
      now: () => 1234
    })

    await monitor.start()
    assert.equal(monitor.state.connection, 'online')
    assert.equal(timers.size, 1)
    monitor.stop()
    assert.equal(timers.size, 0)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('focus, online, and visible visibility changes refresh immediately', async () => {
  let calls = 0
  const { monitor, listeners, browser } = createHarness({ listProjects: async () => { calls += 1; return { success: true, data: [] } } })
  await monitor.start()
  await listeners.get('focus')()
  await listeners.get('online')()
  browser.document.hidden = true
  await listeners.get('document:visibilitychange')()
  browser.document.hidden = false
  await listeners.get('document:visibilitychange')()
  monitor.stop()

  assert.equal(calls, 4)
})

test('uses active, idle-hidden, and capped exponential retry delays', async () => {
  let failed = false
  const { monitor, scheduled, browser } = createHarness({
    listProjects: async () => {
      if (failed) throw new Error('no backend')
      return { success: true, data: [project()] }
    }
  })
  await monitor.start()
  assert.equal(scheduled[0].delay, 1500)
  browser.document.hidden = true
  await monitor.refresh()
  assert.equal(scheduled[0].delay, 12000)
  failed = true
  await monitor.refresh()
  assert.equal(scheduled[0].delay, 1500)
  for (let index = 0; index < 4; index += 1) await monitor.refresh()
  assert.equal(scheduled[0].delay, 15000)
  monitor.stop()
})
