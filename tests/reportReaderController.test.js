import test from 'node:test'
import assert from 'node:assert/strict'

import { createReportReaderController } from '../src/features/reports/reportReaderController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function completedReport(reportId = 'report-1') {
  return {
    success: true,
    data: {
      report_id: reportId,
      simulation_id: 'sim-1',
      graph_id: 'graph-1',
      status: 'completed',
      title: '后端报告题目',
      subtitle: '后端副标题',
      markdown_content: '# 完整报告',
      outline: { sections: [] },
      error: null
    }
  }
}

function sectionsResponse({ complete = true, sections = [] } = {}) {
  return {
    success: true,
    data: {
      report_id: 'report-1',
      total_sections: sections.length,
      is_complete: complete,
      sections
    }
  }
}

test('completed reports load once without starting status or interval polling', async () => {
  let statusCalls = 0
  let scheduled = 0
  const controller = createReportReaderController({
    getReport: async () => completedReport(),
    getSections: async () => sectionsResponse(),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => {
      statusCalls += 1
      return { success: true, data: { status: 'completed' } }
    },
    schedule: () => {
      scheduled += 1
      return 1
    },
    cancel: () => {}
  })

  await controller.open({ reportId: 'report-1', taskId: 'task-1' })

  assert.equal(controller.snapshot().status, 'completed')
  assert.equal(controller.snapshot().report.report_id, 'report-1')
  assert.equal(statusCalls, 0)
  assert.equal(scheduled, 0)
})

test('active reports schedule one refresh and share one in-flight request', async () => {
  let scheduledTick
  let reportCalls = 0
  const refreshGate = deferred()
  const controller = createReportReaderController({
    getReport: async () => {
      reportCalls += 1
      if (reportCalls === 1) {
        return {
          success: true,
          data: { report_id: 'report-1', status: 'processing', outline: { sections: [] } }
        }
      }
      return refreshGate.promise
    },
    getSections: async () => sectionsResponse({ complete: false }),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => ({ success: true, data: { status: 'processing' } }),
    schedule: tick => {
      scheduledTick = tick
      return 7
    },
    cancel: () => {}
  })

  await controller.open({ reportId: 'report-1', taskId: 'task-1' })
  assert.equal(typeof scheduledTick, 'function')

  const first = scheduledTick()
  const second = controller.refresh()
  assert.strictEqual(first, second)
  assert.equal(reportCalls, 2)

  refreshGate.resolve({
    success: true,
    data: { report_id: 'report-1', status: 'processing', outline: { sections: [] } }
  })
  await first
})

test('a failed backend report task stops polling and publishes its message', async () => {
  let scheduledTick
  const cancelled = []
  let statusCalls = 0
  const controller = createReportReaderController({
    getReport: async () => ({
      success: true,
      data: { report_id: 'report-1', status: 'processing', outline: { sections: [] } }
    }),
    getSections: async () => sectionsResponse({ complete: false }),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => {
      statusCalls += 1
      return statusCalls === 1
        ? { success: true, data: { status: 'processing' } }
        : { success: true, data: { status: 'failed', message: '报告生成失败' } }
    },
    schedule: tick => {
      scheduledTick = tick
      return 9
    },
    cancel: timer => cancelled.push(timer)
  })

  await controller.open({ reportId: 'report-1', taskId: 'task-1' })
  await scheduledTick()

  assert.equal(controller.snapshot().status, 'failed')
  assert.equal(controller.snapshot().error, '报告生成失败')
  assert.deepEqual(cancelled, [9])
})

test('a late old report response cannot replace the active report', async () => {
  const oldReport = deferred()
  const controller = createReportReaderController({
    getReport: reportId => reportId === 'report-1'
      ? oldReport.promise
      : Promise.resolve(completedReport('report-2')),
    getSections: async () => sectionsResponse(),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => ({ success: true, data: { status: 'completed' } }),
    schedule: () => 1,
    cancel: () => {}
  })

  const firstOpen = controller.open({ reportId: 'report-1', taskId: '' })
  await controller.open({ reportId: 'report-2', taskId: '' })
  oldReport.resolve(completedReport('report-1'))
  await firstOpen

  assert.equal(controller.snapshot().reportId, 'report-2')
  assert.equal(controller.snapshot().report.report_id, 'report-2')
})

test('stop prevents a deferred request from publishing after unmount', async () => {
  const pending = deferred()
  const published = []
  const controller = createReportReaderController({
    getReport: () => pending.promise,
    getSections: async () => sectionsResponse(),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => ({ success: true, data: { status: 'completed' } }),
    onChange: state => published.push(state),
    schedule: () => 1,
    cancel: () => {}
  })

  const opening = controller.open({ reportId: 'report-1', taskId: '' })
  const countBeforeStop = published.length
  controller.stop()
  pending.resolve(completedReport())
  await opening

  assert.equal(published.length, countBeforeStop)
})

test('agent section-complete events fill progress before sections are saved', async () => {
  const controller = createReportReaderController({
    getReport: async () => ({
      success: true,
      data: {
        report_id: 'report-1',
        status: 'processing',
        outline: { sections: [{ title: '核心摘要' }] }
      }
    }),
    getSections: async () => sectionsResponse({ complete: false }),
    getAgentLog: async () => ({
      success: true,
      data: {
        from_line: 0,
        logs: [{
          action: 'section_complete',
          section_index: 1,
          section_title: '核心摘要',
          details: { content: '实时章节内容' }
        }]
      }
    }),
    getStatus: async () => ({ success: true, data: { status: 'processing' } }),
    schedule: () => 1,
    cancel: () => {}
  })

  await controller.open({ reportId: 'report-1', taskId: 'task-1' })

  assert.equal(controller.snapshot().sectionsResponse.data.sections[0].content, '实时章节内容')
  assert.equal(controller.snapshot().agentLogLine, 1)
  controller.stop()
})
