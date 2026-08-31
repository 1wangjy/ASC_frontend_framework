import test from 'node:test'
import assert from 'node:assert/strict'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import * as navigation from '../src/features/navigation/appNavigation.js'
import { renderSfc } from './helpers/renderSfc.js'

const { primaryNavigation, recentConversations } = navigation

test('keeps graph and report routes while removing their primary sidebar destinations', () => {
  assert.deepEqual(primaryNavigation.filter(item => !item.divider).map(({ label, path }) => [label, path]), [
    ['首页', '/'],
    ['数据平台', '/platform/data'],
    ['模型入口', '/platform/models']
  ])

  assert.deepEqual(ascRouteDefinitions.map(({ name, path }) => [name, path]), [
    ['AscQa', '/'],
    ['Documents', '/documents'],
    ['Process', '/process/:projectId?'],
    ['Simulation', '/simulation/:simulationId'],
    ['SimulationRun', '/simulation/:simulationId/start'],
    ['Reports', '/reports'],
    ['Report', '/report/:reportId'],
    ['Interaction', '/interaction/:reportId'],
    ['PlatformData', '/platform/data'],
    ['PlatformModels', '/platform/models'],
    ['PlatformModel1', '/platform/model1'],
    ['PlatformModel2', '/platform/model2'],
    ['PlatformModel3', '/platform/model3'],
    ['PlatformModel4', '/platform/model4']
  ])
})

test('renders a distinct report navigation icon', async () => {
  const html = await renderSfc('/src/components/ui/AscIcon.vue', { name: 'report' })
  assert.match(html, /M6 3h9l3 3v18H6z/)
})

test('assigns graph evolution, report generation, and interaction to separate navigation areas', () => {
  const workflowRoutes = ascRouteDefinitions.filter(route => (
    ['Simulation', 'SimulationRun', 'Reports', 'Report', 'Interaction'].includes(route.name)
  ))

  assert.deepEqual(
    workflowRoutes.map(route => [route.name, route.meta?.navigationPath]),
    [
      ['Simulation', '/process'],
      ['SimulationRun', '/process'],
      ['Reports', '/reports'],
      ['Report', '/reports'],
      ['Interaction', undefined]
    ]
  )
})

test('renders new chat above the truthfully named example list', async () => {
  const [historyHtml, sidebarHtml] = await Promise.all([
    renderSfc('/src/features/qa/RecentConversationsPanel.vue', {
      conversations: recentConversations
    }),
    renderSfc('/src/components/navigation/AscSidebar.vue', {}, { withRouter: true })
  ])

  assert.match(historyHtml, /示例问题/)
  assert.match(historyHtml, /新建问答/)
  assert.doesNotMatch(historyHtml, /历史问题|查看更多历史|收起历史/)
  const contentHtml = historyHtml.slice(historyHtml.indexOf('recent-conversations__content'))
  assert.ok(contentHtml.indexOf('新建问答') < contentHtml.indexOf('示例问题'))
  assert.doesNotMatch(sidebarHtml, /新建问答/)
})

test('preserves a supplied title for the compact example panel trigger', async () => {
  const html = await renderSfc('/src/features/qa/RecentConversationsPanel.vue', {
    title: '本次会话',
    conversations: recentConversations
  })

  assert.match(html, /<aside[^>]*aria-label="本次会话"/)
  assert.match(html, /recent-conversations__compact-toggle[\s\S]*?<span[^>]*>本次会话<\/span>/)
})
