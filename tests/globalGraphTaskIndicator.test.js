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
  assert.match(source, /<aside[^>]*@keydown\.esc="handleEscape"/)
  assert.doesNotMatch(source, /@keydown\.esc\.stop/)
  assert.match(
    source,
    /function handleEscape\(event\)\s*\{\s*if \(!expanded\.value\) return\s*event\.stopPropagation\(\)\s*closePopover\(\)/
  )
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

test('renders a compact graph-task-status trigger with an active count', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'graph_building', progress: 42, active: true, canOpenQa: false }]
  })

  assert.match(html, /\u56fe\u8c31\u4efb\u52a1\u72b6\u6001/)
  assert.match(html, /graph-task-indicator__count/)
  assert.doesNotMatch(html, /\u95ee\u7b54\u9996\u9875/)
})

test('keeps the task panel collapsible and its task list internally scrollable', async () => {
  const source = await readFile(
    new URL('../src/features/tasks/GlobalGraphTaskIndicator.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /@click="expanded = !expanded"/)
  assert.match(source, /v-show="expanded"/)
  assert.match(source, /graph-task-indicator__close/)
  assert.match(source, /\.graph-task-indicator__list\s*\{[^}]*overflow-y:\s*auto/s)
})

test('removes the redundant QA-home shortcut while preserving project QA routing', async () => {
  const componentSource = await readFile(
    new URL('../src/features/tasks/GlobalGraphTaskIndicator.vue', import.meta.url),
    'utf8'
  )
  const shellSource = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(componentSource, /open-qa-home|graph-task-indicator__qa-home|\u95ee\u7b54\u9996\u9875/)
  assert.doesNotMatch(shellSource, /@open-qa-home|function openQaHome/)
  assert.match(shellSource, /@open-qa="openProjectQa"/)
  assert.match(shellSource, /navigateGraphProjectToQa/)
})
