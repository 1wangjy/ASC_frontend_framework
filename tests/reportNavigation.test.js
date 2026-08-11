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

test('renders a passive report center when there is no report id', async () => {
  const html = await renderSfc('/src/views/ReportCenterView.vue', {}, { withRouter: true })

  assert.match(html, /尚无报告/)
  assert.match(html, /请先完成图谱演化/)
  assert.match(html, /前往图谱演化/)
})

test('keeps the report center free of report generation requests', async () => {
  const source = await readFile(
    new URL('../src/views/ReportCenterView.vue', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /api\/report|Step4Report|generateReport|fetch\(|axios/)
})
