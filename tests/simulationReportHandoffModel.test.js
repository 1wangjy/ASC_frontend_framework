import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSimulationReportDestination,
  deriveSimulationReportHandoff
} from '../src/features/reports/simulationReportHandoffModel.js'

test('maps a simulation without a report to the report center handoff', () => {
  assert.deepEqual(deriveSimulationReportHandoff({
    success: true,
    data: { simulation_id: 'sim-1', has_report: false, report_id: '' }
  }), {
    state: 'ready',
    label: '前往报告生成',
    reportId: '',
    shouldPoll: false
  })
})

test('maps an in-progress report to a polling report-center handoff', () => {
  assert.deepEqual(deriveSimulationReportHandoff({
    success: true,
    data: {
      simulation_id: 'sim-1',
      has_report: true,
      report_id: 'report-running',
      report_status: 'running'
    }
  }), {
    state: 'generating',
    label: '报告生成中',
    reportId: 'report-running',
    shouldPoll: true
  })
})

test('maps a completed report to its report detail', () => {
  const handoff = deriveSimulationReportHandoff({
    success: true,
    data: {
      simulation_id: 'sim-1',
      has_report: true,
      report_id: ' report-completed ',
      report_status: 'COMPLETED'
    }
  })

  assert.deepEqual(handoff, {
    state: 'completed',
    label: '查看已生成报告',
    reportId: 'report-completed',
    shouldPoll: false
  })
  assert.deepEqual(buildSimulationReportDestination({
    handoff,
    projectId: ' project-1 ',
    simulationId: ' sim-1 '
  }), {
    name: 'Report',
    params: { reportId: 'report-completed' },
    query: { projectId: 'project-1', simulationId: 'sim-1' }
  })
})

test('maps a failed report to the report center instead of its detail page', () => {
  const handoff = deriveSimulationReportHandoff({
    success: true,
    data: {
      simulation_id: 'sim-1',
      has_report: true,
      report_id: 'report-failed',
      report_status: 'failed'
    }
  })

  assert.deepEqual(handoff, {
    state: 'failed',
    label: '报告生成失败',
    reportId: 'report-failed',
    shouldPoll: false
  })
  assert.deepEqual(buildSimulationReportDestination({
    handoff,
    projectId: 'project-1',
    simulationId: 'sim-1'
  }), {
    name: 'Reports',
    query: { projectId: 'project-1', simulationId: 'sim-1' }
  })
})

test('never opens report detail when completed status has no report ID', () => {
  const handoff = deriveSimulationReportHandoff({
    success: true,
    data: { has_report: true, report_status: 'completed', report_id: '' }
  })

  assert.equal(handoff.state, 'unknown')
  assert.equal(buildSimulationReportDestination({
    handoff,
    projectId: 'project-1',
    simulationId: 'sim-1'
  }).name, 'Reports')
})
