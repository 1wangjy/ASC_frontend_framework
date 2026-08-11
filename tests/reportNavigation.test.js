import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { renderSfc } from './helpers/renderSfc.js'

test('assigns report detail to the report generation module', () => {
  const routes = new Map(ascRouteDefinitions.map(route => [route.name, route]))

  assert.equal(routes.get('Reports')?.path, '/reports')
  assert.equal(routes.get('Reports')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Report')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Simulation')?.meta?.navigationPath, '/process')
  assert.equal(routes.get('SimulationRun')?.meta?.navigationPath, '/process')
  assert.notEqual(routes.get('Interaction')?.meta?.navigationPath, '/process')
})

test('renders a stable report center shell while saved reports are loading', async () => {
  const html = await renderSfc('/src/views/ReportCenterView.vue', {}, { withRouter: true })

  assert.match(html, /报告生成/)
  assert.match(html, /已保存的研究报告/)
  assert.match(html, /正在读取已保存报告/)
})

test('loads the report center from the read-only list and opens real report ids', async () => {
  const source = await readFile(
    new URL('../src/views/ReportCenterView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /listReports\(\{\s*limit:\s*50\s*\}\)/)
  assert.match(source, /buildReportCenterItems/)
  assert.match(source, /buildLogicalGraphProjects/)
  assert.match(source, /name:\s*['"]Report['"]/)
  assert.match(source, /报告列表加载失败/)
  assert.match(source, /尚无报告/)
  assert.match(source, /重新加载/)
  assert.doesNotMatch(source, /generateReport|force_regenerate|report\/generate|deleteReport/)
})
