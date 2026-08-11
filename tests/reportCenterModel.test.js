import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReportCenterItems,
  formatReportDate,
  unwrapReports
} from '../src/features/reports/reportCenterModel.js'

test('unwraps report arrays without inventing records', () => {
  const reports = [{ report_id: 'report-1' }]

  assert.deepEqual(unwrapReports(reports), reports)
  assert.deepEqual(unwrapReports({ success: true, data: reports }), reports)
  assert.deepEqual(unwrapReports({ success: true, data: null }), [])
})

test('deduplicates reports by simulation, sorts newest first, and links graph projects', () => {
  const reports = [
    {
      report_id: 'report-old',
      simulation_id: 'sim-1',
      graph_id: 'graph-1',
      title: '旧报告',
      status: 'completed',
      created_at: '2026-08-09T09:00:00+08:00'
    },
    {
      report_id: 'report-other',
      simulation_id: 'sim-2',
      graph_id: 'graph-2',
      title: '第二份报告',
      status: 'failed',
      created_at: '2026-08-10T09:00:00+08:00',
      error: '生成失败'
    },
    {
      report_id: 'report-new',
      simulation_id: 'sim-1',
      graph_id: 'graph-1',
      title: '最新报告',
      status: 'processing',
      created_at: '2026-08-11T09:00:00+08:00'
    },
    {
      simulation_id: 'sim-without-report-id',
      title: '无效报告'
    }
  ]
  const projects = [
    { projectId: 'project-1', graphId: 'graph-1', simulationId: 'sim-1', name: '哈哈哈' },
    { project_id: 'project-2', graph_id: 'graph-2', project_name: '第二个项目' }
  ]

  const items = buildReportCenterItems(reports, projects)

  assert.deepEqual(items.map(item => item.reportId), ['report-new', 'report-other'])
  assert.equal(items[0].projectName, '哈哈哈')
  assert.equal(items[0].status, 'generating')
  assert.equal(items[0].statusLabel, '生成中')
  assert.equal(items[1].projectName, '第二个项目')
  assert.equal(items[1].status, 'failed')
  assert.equal(items[1].statusLabel, '生成失败')
  assert.equal(items[1].error, '生成失败')
})

test('keeps unmatched reports visible with an explicit project fallback', () => {
  const [item] = buildReportCenterItems([
    {
      report_id: 'report-unmatched',
      simulation_id: 'sim-missing',
      title: '',
      status: 'completed',
      completed_at: '2026-08-11T10:00:00+08:00'
    }
  ], [])

  assert.equal(item.projectName, '未关联项目')
  assert.equal(item.title, '未命名研究报告')
  assert.equal(item.statusLabel, '已完成')
})

test('formats invalid or missing report dates safely', () => {
  assert.equal(formatReportDate(''), '时间未知')
  assert.equal(formatReportDate('not-a-date'), '时间未知')
  assert.match(formatReportDate('2026-08-11T10:00:00+08:00'), /2026/)
})
