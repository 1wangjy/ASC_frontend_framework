import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildReportGenerationPayload } from '../src/features/reports/singleReportModel.js'
import { buildReportProjectRecords } from '../src/features/reports/reportProjectLifecycleModel.js'
import { createReportCenterController } from '../src/features/reports/reportCenterController.js'
import { buildReportProjectGroups } from '../src/features/reports/reportCenterModel.js'

const project = {
  projectId: 'p1', graphId: 'g1', simulationId: 's1', name: 'project_1',
  evolutionStatus: 'evolution_completed'
}

test('builds a backward-compatible regeneration payload with an optional report name', () => {
  assert.deepEqual(buildReportGenerationPayload({
    simulationId: 's1', forceRegenerate: true, reportName: 'report_2'
  }), {
    simulation_id: 's1',
    force_regenerate: true,
    report_name: 'report_2'
  })
})

test('keeps every report returned for the same graph project', () => {
  const records = buildReportProjectRecords([project], [
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-18' },
    { report_id: 'r2', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-19' }
  ])

  assert.deepEqual(records.map(record => record.reportId), ['r2', 'r1'])
  assert.equal(records.every(record => record.projectId === 'p1'), true)
  assert.equal(records.every(record => record.canRegenerate), true)
})

test('regeneration bypasses the single-report check and sends exactly one forced request', async () => {
  const payloads = []
  let checks = 0
  const controller = createReportCenterController({
    listReports: async () => [],
    checkExistingReport: async () => { checks += 1; return { success: true, data: { has_report: true, report_id: 'r1' } } },
    generateReport: async payload => {
      payloads.push(payload)
      return { success: true, data: { report_id: 'r2', task_id: 't2' } }
    },
    downloadReport: async () => new Blob(),
    deleteReport: async () => ({ success: true }),
    getProjects: () => [project],
    openReport: () => {},
    browser: {},
    onChange: () => {}
  })

  await controller.generate(project, { forceRegenerate: true, reportName: 'report_2' })

  assert.equal(checks, 0)
  assert.deepEqual(payloads, [{ simulation_id: 's1', force_regenerate: true, report_name: 'report_2' }])
})

test('groups a project report set and derives stable report sequence names', () => {
  const records = buildReportProjectRecords([project], [
    { report_id: 'r2', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-19' },
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-18' }
  ])

  const [group] = buildReportProjectGroups(records)

  assert.equal(group.projectName, 'project_1')
  assert.equal(group.reportCount, 2)
  assert.equal(group.nextReportName, 'report_3')
  assert.deepEqual(group.records.map(record => record.reportName), ['report_2', 'report_1'])
  assert.deepEqual(group.records.map(record => record.displayTitle), [
    'project_1 · report_2',
    'project_1 · report_1'
  ])
})

test('prefers a persisted backend report name when one is returned', () => {
  const [group] = buildReportProjectGroups(buildReportProjectRecords([project], [
    {
      report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed',
      created_at: '2026-08-18', report_name: '热震机理复核'
    }
  ]))

  assert.equal(group.records[0].reportName, '热震机理复核')
  assert.equal(group.records[0].displayTitle, 'project_1 · 热震机理复核')
})

test('does not allow another report request while one project report is generating', () => {
  const [group] = buildReportProjectGroups(buildReportProjectRecords([project], [
    { report_id: 'r2', graph_id: 'g1', simulation_id: 's1', status: 'generating', created_at: '2026-08-19' },
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-18' }
  ]))

  assert.equal(group.hasGeneratingReport, true)
  assert.equal(group.canRegenerate, false)
})

test('completed simulation UI exposes independent QA and report actions plus regeneration', async () => {
  const source = await readFile(new URL('../src/components/Step3Simulation.vue', import.meta.url), 'utf8')

  assert.match(source, /进入图谱问答/)
  assert.match(source, /reportActionLabel/)
  assert.match(source, /再次生成报告/)
  assert.match(source, /reportHandoff\.value\.state === 'completed'/)
})

test('completed simulation keeps actions in a full-width toolbar and bounds the agent timeline', async () => {
  const source = await readFile(new URL('../src/components/Step3Simulation.vue', import.meta.url), 'utf8')

  assert.match(source, /\.control-bar\s*\{[^}]*flex-direction:\s*column;/s)
  assert.match(source, /\.action-controls\s*\{[^}]*order:\s*-1;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s)
  assert.match(source, /\.status-group\s*\{[^}]*width:\s*min\(100%,\s*980px\);/s)
  assert.match(source, /\.main-content-area\s*\{[^}]*max-height:\s*min\(54vh,\s*560px\);/s)
})
