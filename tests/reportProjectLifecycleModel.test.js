import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReportProjectRecords,
  isEvolutionComplete
} from '../src/features/reports/reportProjectLifecycleModel.js'

test('offers generation only for an evolved project without any report', () => {
  const [record] = buildReportProjectRecords([{
    projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '哈哈哈',
    evolutionStatus: 'evolution_completed'
  }], [])

  assert.equal(record.canGenerate, true)
  assert.equal(record.reportId, '')
  assert.equal(record.canOpenQa, false)
})

test('any existing report id prevents another report generation request', () => {
  for (const status of ['generating', 'completed', 'failed']) {
    const [record] = buildReportProjectRecords([{
      projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '哈哈哈',
      evolutionStatus: 'evolution_completed'
    }], [{ report_id: `r-${status}`, simulation_id: 's1', graph_id: 'g1', status }])
    assert.equal(record.canGenerate, false)
    assert.equal(record.reportId, `r-${status}`)
    assert.equal(record.canOpenQa, status === 'completed')
  }
})

test('excludes unfinished evolution from report generation', () => {
  const [record] = buildReportProjectRecords([{
    projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '等待中',
    evolutionStatus: 'evolution_running'
  }], [])

  assert.equal(isEvolutionComplete(record), false)
  assert.equal(record.canGenerate, false)
})

test('matches a report by graph ID before its simulation ID', () => {
  const projects = [
    { projectId: 'p-graph', graphId: 'g1', simulationId: 's-other', name: '图谱匹配', evolutionStatus: 'evolution_completed' },
    { projectId: 'p-simulation', graphId: 'g-other', simulationId: 's1', name: '模拟匹配', evolutionStatus: 'evolution_completed' }
  ]

  const records = buildReportProjectRecords(projects, [{
    report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed'
  }])

  assert.equal(records.find(record => record.projectId === 'p-graph').reportId, 'r1')
  assert.equal(records.find(record => record.projectId === 'p-simulation').reportId, '')
})

test('keeps unmatched saved reports as report-only records', () => {
  const [record] = buildReportProjectRecords([], [{
    report_id: 'r-orphan', graph_id: 'g-missing', simulation_id: 's-missing', status: 'completed'
  }])

  assert.deepEqual(record, {
    projectId: '', graphId: 'g-missing', simulationId: 's-missing', projectName: '未关联图谱',
    evolutionStatus: '', reportId: 'r-orphan', reportStatus: 'completed', reportTaskId: '',
    report: { report_id: 'r-orphan', graph_id: 'g-missing', simulation_id: 's-missing', status: 'completed' },
    canGenerate: false, canPreview: true, canDownload: true, canOpenQa: false
  })
})

test('uses the newest duplicate backend row without authorizing another report', () => {
  const [record] = buildReportProjectRecords([{
    projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '去重', evolutionStatus: 'evolution_completed'
  }], [
    { report_id: 'r-old', graph_id: 'g1', simulation_id: 's1', status: 'failed', created_at: '2026-08-10T09:00:00Z' },
    { report_id: 'r-new', graph_id: 'g1', simulation_id: 's1', status: 'completed', created_at: '2026-08-11T09:00:00Z' }
  ])

  assert.equal(record.reportId, 'r-new')
  assert.equal(record.canGenerate, false)
  assert.equal(record.canPreview, true)
})
