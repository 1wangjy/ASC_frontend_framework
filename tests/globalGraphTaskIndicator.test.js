import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { renderSfc } from './helpers/renderSfc.js'

const completedItem = {
  id: 'task-1',
  projectId: 'project-1',
  graphId: 'graph-1',
  name: '高温材料图谱',
  status: 'graph_completed',
  progress: 100,
  active: false,
  canOpenQa: true
}

test('renders completed graph task details in SSR', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [completedItem]
  })

  assert.match(html, /图谱任务/)
  assert.match(html, /高温材料图谱/)
  assert.match(html, /100%/)
  assert.match(html, /查看进度/)
  assert.match(html, /去问答/)
})

test('hides QA action for a task that is not ready', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'graph_building', progress: 42, active: true, canOpenQa: false }]
  })

  assert.doesNotMatch(html, /去问答/)
})

test('renders an offline connection notice and refresh action', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [completedItem],
    connection: 'offline'
  })

  assert.match(html, /连接已断开，上次状态/)
  assert.match(html, /重新连接/)
})

test('keeps the task indicator display-only and accessible across breakpoints', async () => {
  const source = await readFile(
    new URL('../src/features/tasks/GlobalGraphTaskIndicator.vue', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /from\s+['"][^'"]*src\/api/)
  assert.doesNotMatch(source, /setTimeout|setInterval/)
  assert.match(source, /selectVisibleGraphTasks/)
  assert.match(source, /aria-expanded/)
  assert.match(source, /keydown\.esc|event\.key === 'Escape'/)
  assert.match(source, /<aside[^>]*@keydown\.esc\.stop="closePopover"/)
  assert.match(source, /nextTick/)
  assert.match(source, /@media \(max-width: 760px\)/)
})

test('wires the singleton monitor and graph actions through the persistent shell', async () => {
  const source = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.match(source, /useGraphTaskMonitor/)
  assert.match(source, /onMounted\(monitor\.start\)/)
  assert.match(source, /onUnmounted\(monitor\.stop\)/)
  assert.match(source, /GlobalGraphTaskIndicator/)
  assert.match(source, /:items="monitor\.state\.items"/)
  assert.match(source, /:connection="monitor\.state\.connection"/)
  assert.match(source, /:last-synced-at="monitor\.state\.lastSyncedAt"/)
  assert.match(source, /@refresh="monitor\.refresh"/)
  assert.match(source, /name:\s*'Process'/)
  assert.match(source, /navigateGraphProjectToQa/)
})

test('renders the QA home action for an active task that cannot open project QA', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'graph_building', progress: 42, active: true, canOpenQa: false }]
  })

  assert.match(html, /\u95ee\u7b54\u9996\u9875/)
})

test('emits an unscoped QA-home action from outside the expandable popover', async () => {
  const source = await readFile(
    new URL('../src/features/tasks/GlobalGraphTaskIndicator.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /open-qa-home/)
  assert.match(source, /class="graph-task-indicator__qa-home"/)
  assert.match(source, /@click="\$emit\('open-qa-home'\)"/)
  assert.ok(
    source.indexOf('graph-task-indicator__qa-home') < source.indexOf('id="global-graph-task-popover"'),
    'QA home must remain outside the expandable popover'
  )
})

test('routes the unscoped QA-home action to the named AscQa route', async () => {
  const source = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.match(source, /@open-qa-home="openQaHome"/)
  assert.match(source, /function openQaHome\(\)\s*\{\s*router\.push\(\{ name: 'AscQa' \}\)/)
})
