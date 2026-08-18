import test from 'node:test'
import assert from 'node:assert/strict'

import { createReportCenterAutoRefresh } from '../src/features/reports/reportCenterAutoRefresh.js'

test('refreshes on activation and polls every three seconds only while a report is generating', async () => {
  const scheduled = []
  const cancelled = []
  const calls = []
  let generating = true
  const autoRefresh = createReportCenterAutoRefresh({
    refresh: options => {
      calls.push(options)
      return Promise.resolve()
    },
    shouldContinue: () => generating,
    schedule: (callback, delay) => {
      const handle = { callback, delay }
      scheduled.push(handle)
      return handle
    },
    cancel: handle => cancelled.push(handle),
    intervalMs: 3000
  })

  await autoRefresh.activate({ background: false })
  assert.deepEqual(calls, [{ background: false }])
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 3000)

  generating = false
  scheduled[0].callback()
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(calls, [{ background: false }, { background: true }])
  assert.equal(scheduled.length, 1)
  assert.deepEqual(cancelled, [])
})

test('deactivation cancels the timer and a late response cannot restart polling', async () => {
  const request = deferred()
  const scheduled = []
  const cancelled = []
  let calls = 0
  const autoRefresh = createReportCenterAutoRefresh({
    refresh: () => {
      calls += 1
      return calls === 1 ? Promise.resolve() : request.promise
    },
    shouldContinue: () => true,
    schedule: callback => {
      const handle = { callback }
      scheduled.push(handle)
      return handle
    },
    cancel: handle => cancelled.push(handle)
  })

  await autoRefresh.activate()
  scheduled[0].callback()
  await Promise.resolve()
  autoRefresh.deactivate()
  request.resolve()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(calls, 2)
  assert.equal(scheduled.length, 1)
  assert.equal(cancelled.length, 0)
})

test('manual refresh is single-flight and resets the next polling deadline', async () => {
  const request = deferred()
  const scheduled = []
  const cancelled = []
  let calls = 0
  const autoRefresh = createReportCenterAutoRefresh({
    refresh: options => {
      calls += 1
      return calls === 1 ? Promise.resolve() : request.promise.then(() => options)
    },
    shouldContinue: () => true,
    schedule: callback => {
      const handle = { callback }
      scheduled.push(handle)
      return handle
    },
    cancel: handle => cancelled.push(handle)
  })

  await autoRefresh.activate()
  const first = autoRefresh.refreshNow({ background: false })
  const second = autoRefresh.refreshNow({ background: false })
  await Promise.resolve()

  assert.strictEqual(first, second)
  assert.equal(calls, 2)
  assert.deepEqual(cancelled, [scheduled[0]])
  request.resolve()
  await first
  assert.equal(scheduled.length, 2)
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}
