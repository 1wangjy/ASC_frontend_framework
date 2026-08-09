import test from 'node:test'
import assert from 'node:assert/strict'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { primaryNavigation, recentConversations } from '../src/features/navigation/appNavigation.js'
import { renderSfc } from './helpers/renderSfc.js'

test('keeps QA and documents as the only primary destinations while retaining workflow routes', () => {
  assert.deepEqual(primaryNavigation.map(({ label, path }) => [label, path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents']
  ])

  assert.deepEqual(ascRouteDefinitions.map(({ name, path }) => [name, path]), [
    ['AscQa', '/'],
    ['Documents', '/documents'],
    ['Process', '/process/:projectId'],
    ['Simulation', '/simulation/:simulationId'],
    ['SimulationRun', '/simulation/:simulationId/start'],
    ['Report', '/report/:reportId'],
    ['Interaction', '/interaction/:reportId']
  ])
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
  assert.ok(historyHtml.indexOf('新建问答') < historyHtml.indexOf('示例问题'))
  assert.doesNotMatch(sidebarHtml, /新建问答/)
})
