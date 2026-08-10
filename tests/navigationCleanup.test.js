import test from 'node:test'
import assert from 'node:assert/strict'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import * as navigation from '../src/features/navigation/appNavigation.js'
import { renderSfc } from './helpers/renderSfc.js'

const { primaryNavigation, recentConversations } = navigation

test('keeps QA, documents, and graph construction as primary destinations while retaining workflow routes', () => {
  assert.deepEqual(primaryNavigation.map(({ label, path }) => [label, path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents'],
    ['图谱构建', '/process']
  ])

  assert.deepEqual(ascRouteDefinitions.map(({ name, path }) => [name, path]), [
    ['AscQa', '/'],
    ['Documents', '/documents'],
    ['Process', '/process/:projectId?'],
    ['Simulation', '/simulation/:simulationId'],
    ['SimulationRun', '/simulation/:simulationId/start'],
    ['Report', '/report/:reportId'],
    ['Interaction', '/interaction/:reportId']
  ])
})

test('returns to the last selected graph project after visiting another primary page', () => {
  const state = navigation.createPrimaryNavigationState?.()
  assert.ok(state, 'primary navigation should retain the last project-scoped graph route')

  const graphDestination = primaryNavigation.find(item => item.path === '/process')
  const documentsDestination = primaryNavigation.find(item => item.path === '/documents')

  state.observe({
    name: 'Process',
    fullPath: '/process/proj-123',
    params: { projectId: 'proj-123' }
  })
  assert.equal(state.target(graphDestination), '/process/proj-123')

  state.observe({
    name: 'Documents',
    fullPath: '/documents',
    params: {}
  })
  assert.equal(state.target(graphDestination), '/process/proj-123')
  assert.equal(state.target(documentsDestination), '/documents')
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
