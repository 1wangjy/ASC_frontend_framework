import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildSingleReportGenerationPayload,
  completedReportFromStatus,
  createSingleReportFlow
} from '../src/features/reports/singleReportModel.js'
import service from '../src/api/index.js'
import { generateReport } from '../src/api/report.js'

test('always disables backend report regeneration in the generation payload', () => {
  assert.deepEqual(buildSingleReportGenerationPayload(' sim-1 '), {
    simulation_id: 'sim-1',
    force_regenerate: false
  })
  assert.throws(() => buildSingleReportGenerationPayload(''), /simulation_id/)
})

test('reuses only a completed report returned by the simulation status endpoint', () => {
  assert.equal(completedReportFromStatus({
    success: true,
    data: {
      simulation_id: 'sim-1',
      has_report: true,
      report_status: 'completed',
      report_id: 'report-1',
      interview_unlocked: true
    }
  }), 'report-1')

  assert.equal(completedReportFromStatus({
    success: true,
    data: {
      simulation_id: 'sim-1',
      has_report: true,
      report_status: 'failed',
      report_id: 'report-failed',
      interview_unlocked: false
    }
  }), '')
})

test('opens the completed report without issuing another generation request', async () => {
  const generatedPayloads = []
  const openedReports = []
  const flow = createSingleReportFlow({
    checkExistingReport: async () => ({
      success: true,
      data: {
        simulation_id: 'sim-1',
        has_report: true,
        report_status: 'completed',
        report_id: 'report-existing',
        interview_unlocked: true
      }
    }),
    requestReport: async payload => {
      generatedPayloads.push(payload)
      return { success: true, data: { report_id: 'report-new' } }
    },
    openReport: destination => openedReports.push(destination)
  })

  const result = await flow.proceed('sim-1')

  assert.equal(result.reused, true)
  assert.deepEqual(generatedPayloads, [])
  assert.deepEqual(openedReports, [{ reportId: 'report-existing', taskId: '' }])
  assert.equal(flow.snapshot().reportId, 'report-existing')
})

test('starts one non-regenerating request and opens its returned report', async () => {
  const generatedPayloads = []
  const openedReports = []
  const flow = createSingleReportFlow({
    checkExistingReport: async () => ({
      success: true,
      data: {
        simulation_id: 'sim-2',
        has_report: false,
        report_status: null,
        report_id: null,
        interview_unlocked: false
      }
    }),
    requestReport: async payload => {
      generatedPayloads.push(payload)
      return {
        success: true,
        data: {
          simulation_id: 'sim-2',
          report_id: 'report-new',
          task_id: 'task-new',
          status: 'generating',
          already_generated: false
        }
      }
    },
    openReport: destination => openedReports.push(destination)
  })

  const result = await flow.proceed('sim-2')

  assert.equal(result.reused, false)
  assert.deepEqual(generatedPayloads, [{ simulation_id: 'sim-2', force_regenerate: false }])
  assert.deepEqual(openedReports, [{ reportId: 'report-new', taskId: 'task-new' }])
})

test('fails closed when the existing-report check cannot be completed', async () => {
  let generateCalls = 0
  const flow = createSingleReportFlow({
    checkExistingReport: async () => {
      throw new Error('backend unavailable')
    },
    requestReport: async () => {
      generateCalls += 1
      return { success: true, data: { report_id: 'report-new' } }
    },
    openReport: () => {}
  })

  await assert.rejects(() => flow.proceed('sim-3'), /backend unavailable/)
  assert.equal(generateCalls, 0)
})

test('does not retry the non-idempotent report-generation POST after a transport failure', async () => {
  const originalAdapter = service.defaults.adapter
  const originalError = console.error
  const originalWarn = console.warn
  let attempts = 0

  service.defaults.adapter = async () => {
    attempts += 1
    throw new Error('connection reset after request was sent')
  }
  console.error = () => {}
  console.warn = () => {}

  try {
    await assert.rejects(
      () => generateReport({ simulation_id: 'sim-network', force_regenerate: true }),
      /connection reset/
    )
  } finally {
    service.defaults.adapter = originalAdapter
    console.error = originalError
    console.warn = originalWarn
  }

  assert.equal(attempts, 1)
})

test('Step3 routes through the single-report flow instead of forcing regeneration', async () => {
  const source = await readFile(
    new URL('../src/components/Step3Simulation.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /checkReportForSimulation/)
  assert.match(source, /createSingleReportFlow/)
  assert.match(source, /reportFlow\.inspect/)
  assert.match(source, /reportFlow\.proceed/)
  assert.match(source, /查看已有报告/)
  assert.doesNotMatch(source, /force_regenerate\s*:\s*true/)
})
