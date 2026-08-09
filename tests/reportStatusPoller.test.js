import test from 'node:test'
import assert from 'node:assert/strict'

import { createReportStatusPoller } from '../src/features/reports/reportStatusPoller.js'

function deferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

test('keeps report status polling single-flight while a request is pending', async () => {
  const requests = []
  let scheduledTick
  const poller = createReportStatusPoller({
    poll: () => {
      const request = deferred()
      requests.push(request)
      return request.promise
    },
    onResult: () => {},
    onError: error => { throw error },
    schedule: tick => {
      scheduledTick = tick
      return 1
    },
    cancel: () => {}
  })

  poller.start()
  scheduledTick()
  scheduledTick()

  assert.equal(requests.length, 1)
  requests[0].resolve({ data: { status: 'processing' } })
  await Promise.resolve()
  poller.stop()
})

test('ignores a pending report status response after polling stops', async () => {
  const request = deferred()
  const handled = []
  const poller = createReportStatusPoller({
    poll: () => request.promise,
    onResult: result => { handled.push(result) },
    onError: error => { throw error },
    schedule: () => 1,
    cancel: () => {}
  })

  poller.start()
  poller.stop()
  request.resolve({ data: { status: 'completed' } })
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(handled, [])
})

test('stop and immediate restart waits for the stale request before polling once', async () => {
  const requests = []
  const handled = []
  const poller = createReportStatusPoller({
    poll: () => {
      const request = deferred()
      requests.push(request)
      return request.promise
    },
    onResult: result => { handled.push(result) },
    onError: error => { throw error },
    schedule: () => requests.length + 1,
    cancel: () => {}
  })

  poller.start()
  poller.stop()
  poller.start()

  assert.equal(requests.length, 1)
  requests[0].resolve({ task: 'stale' })
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(handled, [])
  assert.equal(requests.length, 2)

  requests[1].resolve({ task: 'replacement' })
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(handled, [{ task: 'replacement' }])
  poller.stop()
})
