import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import * as navigation from '../src/features/navigation/appNavigation.js'
import {
  clickRenderedLink,
  findRenderedLinkByText,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import { renderSfc } from './helpers/renderSfc.js'

const { primaryNavigation, recentConversations } = navigation

test('keeps QA, documents, graph evolution, and report generation as primary destinations', () => {
  assert.deepEqual(primaryNavigation.map(({ label, path }) => [label, path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents'],
    ['图谱演化', '/process'],
    ['报告生成', '/reports']
  ])

  assert.equal(primaryNavigation.find(item => item.path === '/reports')?.icon, 'report')

  assert.deepEqual(ascRouteDefinitions.map(({ name, path }) => [name, path]), [
    ['AscQa', '/'],
    ['Documents', '/documents'],
    ['Process', '/process/:projectId?'],
    ['Simulation', '/simulation/:simulationId'],
    ['SimulationRun', '/simulation/:simulationId/start'],
    ['Reports', '/reports'],
    ['Report', '/report/:reportId'],
    ['Interaction', '/interaction/:reportId']
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

  state.observe({
    name: 'Process',
    fullPath: '/process',
    params: {}
  })
  assert.equal(state.target(graphDestination), '/process')

  state.observe({
    name: 'Process',
    fullPath: '/process/new',
    params: { projectId: 'new' }
  })
  assert.equal(state.target(graphDestination), '/process/new')
})

test('returns to the exact running graph evolution stage after visiting another primary page', () => {
  const graphDestination = primaryNavigation.find(item => item.path === '/process')
  const cases = [
    ['Simulation', '/simulation/sim-123'],
    ['SimulationRun', '/simulation/sim-123/start?maxRounds=24']
  ]

  for (const [name, fullPath] of cases) {
    const state = navigation.createPrimaryNavigationState()
    state.observe({ name, fullPath, params: {} })
    state.observe({ name: 'Documents', fullPath: '/documents', params: {} })
    assert.equal(state.target(graphDestination), fullPath)
  }
})

test('remembers graph evolution and report generation routes independently', () => {
  const state = navigation.createPrimaryNavigationState()
  const graphDestination = primaryNavigation.find(item => item.path === '/process')
  const reportDestination = primaryNavigation.find(item => item.path === '/reports')

  state.observe({
    name: 'SimulationRun',
    fullPath: '/simulation/sim-123/start?maxRounds=24',
    params: { simulationId: 'sim-123' }
  })
  state.observe({
    name: 'Report',
    fullPath: '/report/report-123?taskId=task-123',
    params: { reportId: 'report-123' }
  })

  assert.equal(state.target(graphDestination), '/simulation/sim-123/start?maxRounds=24')
  assert.equal(state.target(reportDestination), '/report/report-123?taskId=task-123')

  state.observe({ name: 'Reports', fullPath: '/reports', params: {} })

  assert.equal(state.target(graphDestination), '/simulation/sim-123/start?maxRounds=24')
  assert.equal(state.target(reportDestination), '/reports')
})

async function clickGraphSidebarEntry(fixture) {
  await nextTick()
  const graphLink = findRenderedLinkByText(fixture.root, '图谱演化')
  assert.ok(graphLink, 'rendered sidebar should contain the graph navigation entry')
  await clickRenderedLink(graphLink)
}

async function clickReportSidebarEntry(fixture) {
  await nextTick()
  const reportLink = findRenderedLinkByText(fixture.root, '报告生成')
  assert.ok(reportLink, 'rendered sidebar should contain the report navigation entry')
  await clickRenderedLink(reportLink)
}

test('AscSidebar recognizes the passive report center route', async () => {
  const fixture = await mountSfcWithMemoryRouter('/src/components/navigation/AscSidebar.vue', '/reports')
  try {
    assert.equal(fixture.router.currentRoute.value.name, 'Reports')
  } finally {
    await fixture.close()
  }
})

test('AscSidebar returns to the selected graph project through its rendered router-link', async () => {
  const fixture = await mountSfcWithMemoryRouter('/src/components/navigation/AscSidebar.vue', '/process/p1')
  try {
    await fixture.router.push('/documents')
    await clickGraphSidebarEntry(fixture)
    assert.equal(fixture.router.currentRoute.value.fullPath, '/process/p1')
  } finally {
    await fixture.close()
  }
})

test('AscSidebar clears its retained project after an explicit unscoped Process route', async () => {
  const fixture = await mountSfcWithMemoryRouter('/src/components/navigation/AscSidebar.vue', '/process/p1')
  try {
    await fixture.router.push('/process')
    await fixture.router.push('/documents')
    await clickGraphSidebarEntry(fixture)
    assert.equal(fixture.router.currentRoute.value.fullPath, '/process')
  } finally {
    await fixture.close()
  }
})

test('AscSidebar retains the existing /process/new workflow route', async () => {
  const fixture = await mountSfcWithMemoryRouter('/src/components/navigation/AscSidebar.vue', '/process/new')
  try {
    await fixture.router.push('/documents')
    await clickGraphSidebarEntry(fixture)
    assert.equal(fixture.router.currentRoute.value.fullPath, '/process/new')
  } finally {
    await fixture.close()
  }
})

test('AscSidebar returns to the running simulation stage instead of the project overview', async () => {
  const fixture = await mountSfcWithMemoryRouter(
    '/src/components/navigation/AscSidebar.vue',
    '/simulation/sim-123/start?maxRounds=24'
  )
  try {
    await fixture.router.push('/documents')
    await clickGraphSidebarEntry(fixture)
    assert.equal(
      fixture.router.currentRoute.value.fullPath,
      '/simulation/sim-123/start?maxRounds=24'
    )
  } finally {
    await fixture.close()
  }
})

test('AscSidebar returns to the exact running report after visiting another primary page', async () => {
  const fixture = await mountSfcWithMemoryRouter(
    '/src/components/navigation/AscSidebar.vue',
    '/report/report-1?taskId=task-1'
  )
  try {
    await fixture.router.push('/documents')
    await clickReportSidebarEntry(fixture)
    assert.equal(fixture.router.currentRoute.value.fullPath, '/report/report-1?taskId=task-1')
  } finally {
    await fixture.close()
  }
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
