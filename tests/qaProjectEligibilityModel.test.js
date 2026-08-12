import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildQualifiedQaProjects,
  resolveQualifiedQaSelection
} from '../src/features/qa/qaProjectEligibilityModel.js'

const projects = [
  {
    projectId: 'p1',
    graphId: 'g1',
    simulationId: 's1',
    name: '已完成项目',
    project_id: 'p1',
    graph_id: 'g1'
  },
  {
    projectId: 'p2',
    graphId: 'g2',
    simulationId: 's2',
    name: '另一个项目',
    project_id: 'p2',
    graph_id: 'g2'
  }
]

test('includes only graph projects with a completed backend report', () => {
  const records = buildQualifiedQaProjects(projects, [
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: ' completed ' },
    { report_id: 'r2', graph_id: 'g2', simulation_id: 's2', status: 'generating' }
  ])

  assert.deepEqual(records.map(record => record.projectId), ['p1'])
  assert.deepEqual(records[0], {
    projectId: 'p1',
    graphId: 'g1',
    simulationId: 's1',
    reportId: 'r1',
    projectName: '已完成项目',
    reportStatus: 'completed',
    project: projects[0]
  })
})

test('excludes every normalized status except completed', () => {
  for (const status of ['generating', 'pending', 'processing', 'running', 'failed', 'error', 'unknown', '']) {
    assert.deepEqual(buildQualifiedQaProjects([projects[0]], [{
      report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status
    }]), [], `status ${status || '<empty>'} must not qualify`)
  }
})

test('associates a report by graph ID before its conflicting simulation ID', () => {
  const records = buildQualifiedQaProjects(projects, [{
    report_id: 'r-graph-owner',
    graph_id: 'g1',
    simulation_id: 's2',
    status: 'completed'
  }])

  assert.deepEqual(records.map(record => record.projectId), ['p1'])
  assert.equal(records[0].simulationId, 's1')
})

test('falls back to simulation association when a report has no usable graph association', () => {
  const records = buildQualifiedQaProjects([projects[0]], [{
    report_id: 'r1', graph_id: 'stale-graph', simulation_id: 's1', status: 'completed'
  }])

  assert.deepEqual(records.map(record => record.projectId), ['p1'])
})

test('uses the graph-matched completed report to supply a missing project simulation ID', () => {
  const project = { projectId: 'p1', graphId: 'g1', name: '报告补全模拟' }
  const records = buildQualifiedQaProjects([project], [{
    report_id: 'r1', graph_id: 'g1', simulation_id: 's-from-report', status: 'completed'
  }])

  assert.equal(records.length, 1)
  assert.equal(records[0].simulationId, 's-from-report')
})

test('excludes report-only rows and projects without a graph ID or full simulation context', () => {
  const incompleteProjects = [
    { projectId: 'missing-graph', simulationId: 's1', name: '缺少图谱' },
    { projectId: 'missing-simulation', graphId: 'g2', name: '缺少模拟' }
  ]
  const reports = [
    { report_id: 'orphan', graph_id: 'orphan-g', simulation_id: 'orphan-s', status: 'completed' },
    { report_id: 'no-graph', simulation_id: 's1', status: 'completed' },
    { report_id: 'no-simulation', graph_id: 'g2', status: 'completed' }
  ]

  assert.deepEqual(buildQualifiedQaProjects(incompleteProjects, reports), [])
})

test('uses the explicit matching report route before the saved project selection', () => {
  const records = buildQualifiedQaProjects(projects, [
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed' },
    { report_id: 'r2', graph_id: 'g2', simulation_id: 's2', status: 'completed' }
  ])
  const selected = resolveQualifiedQaSelection(records, {
    routeProjectId: 'p2', routeReportId: 'r2', storedProjectId: 'p1'
  })

  assert.equal(selected.projectId, 'p2')
})

test('rejects a mismatched explicit project/report pair and never accepts either half', () => {
  const records = buildQualifiedQaProjects(projects, [
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed' },
    { report_id: 'r2', graph_id: 'g2', simulation_id: 's2', status: 'completed' }
  ])

  assert.equal(resolveQualifiedQaSelection(records, {
    routeProjectId: 'p1', routeReportId: 'r2'
  }), null)
})

test('uses only an existing saved project and otherwise remains unselected', () => {
  const records = buildQualifiedQaProjects([projects[0]], [
    { report_id: 'r1', graph_id: 'g1', simulation_id: 's1', status: 'completed' }
  ])

  assert.equal(resolveQualifiedQaSelection(records, { storedProjectId: 'p1' }).reportId, 'r1')
  assert.equal(resolveQualifiedQaSelection(records, { storedProjectId: 'stale' }), null)
  assert.equal(resolveQualifiedQaSelection(records, {}), null)
})

test('chooses one newest completed report per project deterministically', () => {
  const reports = [
    { report_id: 'r-old', graph_id: 'g1', simulation_id: 's1', status: 'completed', completed_at: '2026-08-10T09:00:00Z' },
    { report_id: 'r-new', graph_id: 'g1', simulation_id: 's1', status: 'completed', completed_at: '2026-08-11T09:00:00Z' },
    { report_id: 'r-z', graph_id: 'g2', simulation_id: 's2', status: 'completed', completed_at: 'not-a-date' },
    { report_id: 'r-a', graph_id: 'g2', simulation_id: 's2', status: 'completed', completed_at: 'not-a-date' }
  ]

  const forward = buildQualifiedQaProjects(projects, reports)
  const reversed = buildQualifiedQaProjects([...projects].reverse(), [...reports].reverse())

  assert.deepEqual(forward.map(record => [record.projectId, record.reportId]), [
    ['p1', 'r-new'],
    ['p2', 'r-z']
  ])
  assert.deepEqual(reversed.map(record => [record.projectId, record.reportId]), [
    ['p1', 'r-new'],
    ['p2', 'r-z']
  ])
})
