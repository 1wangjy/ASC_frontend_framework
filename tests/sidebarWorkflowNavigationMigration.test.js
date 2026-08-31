import test from 'node:test'
import assert from 'node:assert/strict'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { primaryNavigation } from '../src/features/navigation/appNavigation.js'

test('sidebar leaves graph and report entry points to the QA home shortcuts', () => {
  const destinations = primaryNavigation
    .filter(item => !item.divider)
    .map(item => [item.label, item.path])

  assert.deepEqual(destinations, [
    ['首页', '/'],
    ['数据平台', '/platform/data'],
    ['模型入口', '/platform/models']
  ])
})

test('graph and report workflow routes remain registered after sidebar migration', () => {
  const routes = new Map(ascRouteDefinitions.map(route => [route.name, route]))

  assert.equal(routes.get('Process')?.path, '/process/:projectId?')
  assert.equal(routes.get('Simulation')?.path, '/simulation/:simulationId')
  assert.equal(routes.get('SimulationRun')?.path, '/simulation/:simulationId/start')
  assert.equal(routes.get('Reports')?.path, '/reports')
  assert.equal(routes.get('Report')?.path, '/report/:reportId')
  assert.equal(routes.get('Process')?.meta?.navigationPath, '/process')
  assert.equal(routes.get('Reports')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('AscQa')?.meta?.title, '首页')
})
