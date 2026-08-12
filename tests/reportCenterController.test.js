import test from 'node:test'
import assert from 'node:assert/strict'

import { createReportCenterController } from '../src/features/reports/reportCenterController.js'

const evolvedRecord = {
  projectId: 'project-1',
  projectName: '测试项目',
  simulationId: 'simulation-1',
  evolutionStatus: 'evolution_completed',
  canGenerate: true
}

test('a double click shares one generation request', async () => {
  const check = deferred()
  const generation = deferred()
  let generateCalls = 0
  const controller = createController({
    checkExistingReport: () => check.promise,
    generateReport: async () => {
      generateCalls += 1
      return generation.promise
    }
  })

  const first = controller.generate(evolvedRecord)
  const second = controller.generate(evolvedRecord)

  assert.strictEqual(first, second)
  check.resolve({ success: true, data: { has_report: false, report_id: '' } })
  await waitFor(() => generateCalls === 1)
  generation.resolve({ success: true, data: { report_id: 'report-new', task_id: 'task-new' } })
  await first
  assert.equal(generateCalls, 1)
})

test('refresh suppresses a stale list response and derives lifecycle records from projects', async () => {
  const older = deferred()
  const newer = deferred()
  let listCalls = 0
  const controller = createController({
    listReports: () => (++listCalls === 1 ? older.promise : newer.promise),
    getProjects: () => [evolvedRecord]
  })

  const first = controller.refresh()
  const second = controller.refresh()
  newer.resolve({ success: true, data: [{ report_id: 'report-newer', simulation_id: 'other' }] })
  await second
  older.resolve({ success: true, data: [{ report_id: 'report-stale', simulation_id: 'simulation-1' }] })
  await first

  assert.deepEqual(controller.state.reports.map(report => report.report_id), ['report-newer'])
  assert.deepEqual(
    controller.state.records.map(record => [record.projectId, record.reportId, record.canGenerate]),
    [['project-1', '', true], ['', 'report-newer', false]]
  )
  assert.equal(controller.state.loading, false)
})

test('syncProjects recomputes records from cached reports without listing again', async () => {
  let projects = []
  let listCalls = 0
  const changes = []
  const controller = createController({
    listReports: async () => {
      listCalls += 1
      return []
    },
    getProjects: () => projects,
    onChange: state => changes.push(structuredClone(state))
  })
  await controller.refresh()
  projects = [evolvedRecord]

  controller.syncProjects()

  assert.equal(listCalls, 1)
  assert.equal(changes.at(-1).records[0].projectId, 'project-1')
  assert.equal(controller.state.records[0].canGenerate, true)
})

test('an existing report opens after a fresh check instead of generating', async () => {
  const opened = []
  let checkCalls = 0
  let generateCalls = 0
  const controller = createController({
    checkExistingReport: async simulationId => {
      checkCalls += 1
      assert.equal(simulationId, 'simulation-1')
      return { success: true, data: { has_report: true, report_id: 'report-existing', task_id: 'task-1' } }
    },
    generateReport: async () => { generateCalls += 1 },
    openReport: destination => opened.push(destination)
  })

  await controller.generate(evolvedRecord)

  assert.equal(checkCalls, 1)
  assert.equal(generateCalls, 0)
  assert.deepEqual(opened, [{ reportId: 'report-existing', taskId: 'task-1' }])
})

test('a failed fresh check blocks the generation POST and exposes an action error', async () => {
  let generateCalls = 0
  const controller = createController({
    checkExistingReport: async () => { throw new Error('status unavailable') },
    generateReport: async () => { generateCalls += 1 }
  })

  await assert.rejects(() => controller.generate(evolvedRecord), /status unavailable/)

  assert.equal(generateCalls, 0)
  assert.equal(controller.state.actionError, 'status unavailable')
  assert.equal(controller.state.mutatingProjectId, '')
})

test('a successful refresh clears a previous action error', async () => {
  const controller = createController({
    checkExistingReport: async () => { throw new Error('status unavailable') }
  })
  await assert.rejects(() => controller.generate(evolvedRecord), /status unavailable/)

  await controller.refresh()

  assert.equal(controller.state.actionError, '')
})

test('a completed generation triggers exactly one list refresh', async () => {
  let listCalls = 0
  const opened = []
  const controller = createController({
    listReports: async () => { listCalls += 1; return [] },
    checkExistingReport: async () => ({ success: true, data: { has_report: false, report_id: '' } }),
    generateReport: async () => ({ success: true, data: { report_id: 'report-new', task_id: 'task-new' } }),
    openReport: destination => opened.push(destination)
  })

  await controller.generate(evolvedRecord)

  assert.equal(listCalls, 1)
  assert.deepEqual(opened, [{ reportId: 'report-new', taskId: 'task-new' }])
})

test('a failed generation POST refreshes once and keeps its final action error visible', async () => {
  let listCalls = 0
  const controller = createController({
    listReports: async () => { listCalls += 1; return [] },
    checkExistingReport: async () => ({ success: true, data: { has_report: false, report_id: '' } }),
    generateReport: async () => { throw new Error('generation POST failed') }
  })

  await assert.rejects(() => controller.generate(evolvedRecord), /generation POST failed/)

  assert.equal(listCalls, 1)
  assert.equal(controller.state.actionError, 'generation POST failed')
})

test('a completed POST still refreshes once when report navigation fails', async () => {
  let listCalls = 0
  const controller = createController({
    listReports: async () => { listCalls += 1; return [] },
    checkExistingReport: async () => ({ success: true, data: { has_report: false, report_id: '' } }),
    generateReport: async () => ({ success: true, data: { report_id: 'report-new', task_id: 'task-new' } }),
    openReport: () => { throw new Error('navigation failed') }
  })

  await assert.rejects(() => controller.generate(evolvedRecord), /navigation failed/)

  assert.equal(listCalls, 1)
  assert.equal(controller.state.actionError, 'navigation failed')
})

test('stop suppresses late refresh and action state mutations', async () => {
  const list = deferred()
  const check = deferred()
  const changes = []
  const controller = createController({
    listReports: () => list.promise,
    checkExistingReport: () => check.promise,
    onChange: state => changes.push(structuredClone(state))
  })
  const refresh = controller.refresh()
  const generation = controller.generate(evolvedRecord)
  controller.stop()
  const stoppedState = structuredClone(controller.state)
  const stoppedChanges = changes.length

  list.resolve([{ report_id: 'late-report', simulation_id: 'simulation-1' }])
  check.reject(new Error('late check failure'))
  await Promise.allSettled([refresh, generation])

  assert.deepEqual(controller.state, stoppedState)
  assert.equal(changes.length, stoppedChanges)
})

test('download state is scoped by report ID and forwards the browser only to the saver', async () => {
  const response = deferred()
  const clicked = []
  const revoked = []
  const browser = {
    Blob,
    document: { createElement: () => ({ click: () => clicked.push('clicked') }) },
    URL: {
      createObjectURL: blob => { assert.equal(blob.size, 6); return 'blob:report' },
      revokeObjectURL: url => revoked.push(url)
    }
  }
  const controller = createController({
    browser,
    downloadReport: reportId => {
      assert.equal(reportId, 'report-7')
      return response.promise
    }
  })

  const pending = controller.download({ reportId: 'report-7', projectName: '七号项目' })
  assert.equal(controller.state.downloadingReportId, 'report-7')
  response.resolve(new Blob(['report']))
  const filename = await pending

  assert.equal(filename, '七号项目-研究报告.md')
  assert.equal(controller.state.downloadingReportId, '')
  assert.deepEqual(clicked, ['clicked'])
  assert.deepEqual(revoked, ['blob:report'])
})

test('stop prevents a late download response from creating browser side effects', async () => {
  const response = deferred()
  const events = []
  const controller = createController({
    downloadReport: () => response.promise,
    browser: {
      Blob,
      document: { createElement: () => { events.push('element'); return { click: () => events.push('click') } } },
      URL: {
        createObjectURL: () => { events.push('url'); return 'blob:late' },
        revokeObjectURL: () => events.push('revoke')
      }
    }
  })
  const pending = controller.download({ reportId: 'report-late', projectName: '迟到项目' })
  controller.stop()

  response.resolve(new Blob(['report']))
  await pending

  assert.deepEqual(events, [])
})

test('rejects a second report download while the first remains in flight', async () => {
  const firstResponse = deferred()
  const requested = []
  const browser = {
    Blob,
    document: { createElement: () => ({ click() {} }) },
    URL: { createObjectURL: () => 'blob:first', revokeObjectURL() {} }
  }
  const controller = createController({
    browser,
    downloadReport: reportId => {
      requested.push(reportId)
      return firstResponse.promise
    }
  })

  const first = controller.download({ reportId: 'r1', projectName: '一号' })
  await assert.rejects(
    () => controller.download({ reportId: 'r2', projectName: '二号' }),
    /download.*progress/i
  )
  assert.deepEqual(requested, ['r1'])
  assert.equal(controller.state.downloadingReportId, 'r1')
  firstResponse.resolve(new Blob(['report']))
  await first
  assert.equal(controller.state.downloadingReportId, '')
})

function createController(overrides = {}) {
  return createReportCenterController({
    listReports: async () => [],
    checkExistingReport: async () => ({ success: true, data: { has_report: false, report_id: '' } }),
    generateReport: async () => ({ success: true, data: { report_id: 'report-new' } }),
    downloadReport: async () => new Blob(['report']),
    getProjects: () => [evolvedRecord],
    openReport: () => {},
    browser: {},
    onChange: () => {},
    ...overrides
  })
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

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  assert.equal(predicate(), true)
}
