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
  evolutionStatus: 'evolution_completed',
  stage: 'professional',
  progress: 100,
  active: false,
  canOpenQa: true
}

test('renders completed graph task details in SSR', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [completedItem]
  })

  assert.match(html, /图谱演化任务/)
  assert.match(html, /模拟组会已完成/)
  assert.match(html, /高温材料图谱/)
  assert.doesNotMatch(html, /100%/)
  assert.doesNotMatch(html, /graph-task-indicator__progress/)
  assert.match(html, /查看进度/)
  assert.doesNotMatch(html, /去问答/)
})

test('describes a base-only result as waiting for the complete knowledge graph', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'base_completed', evolutionStatus: undefined, canOpenQa: false }]
  })

  assert.match(html, /Base 构建完成，等待 Professional 构建/)
  assert.doesNotMatch(html, /Professional Research|基础图谱/)
})

test('distinguishes running and stopped evolution from a completed evolution', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [
      { ...completedItem, id: 'running', name: '运行项目', evolutionStatus: 'evolution_running', progress: 25, active: true },
      { ...completedItem, id: 'stopped', name: '停止项目', evolutionStatus: 'evolution_stopped', progress: 50, active: false }
    ]
  })

  assert.match(html, /正在模拟组会/)
  assert.match(html, /模拟组会已停止/)
})

test('shows stable workflow stage text instead of a synthetic percentage', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [
      { ...completedItem, id: 'base', status: 'graph_building', stage: 'base', evolutionStatus: undefined, progress: 22, active: true },
      { ...completedItem, id: 'professional', status: 'graph_building', stage: 'professional', evolutionStatus: undefined, progress: 67, active: true },
      { ...completedItem, id: 'environment', status: 'graph_completed', evolutionStatus: 'environment_preparing', progress: 0, active: true },
      { ...completedItem, id: 'meeting', status: 'graph_completed', evolutionStatus: 'evolution_running', progress: 21, active: true }
    ]
  })

  assert.match(html, /正在 Base 构建/)
  assert.match(html, /正在 Professional 构建/)
  assert.match(html, /正在环境搭建/)
  assert.match(html, /正在模拟组会/)
  assert.doesNotMatch(html, /22%|67%|21%/)
})

test('hides QA action for a task that is not ready', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'graph_building', evolutionStatus: undefined, progress: 42, active: true, canOpenQa: false }]
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

test('wires the singleton monitor and progress action through the persistent shell', async () => {
  const source = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.match(source, /useGraphTaskMonitor/)
  assert.match(source, /onMounted\(monitor\.start\)/)
  assert.match(source, /onUnmounted\(monitor\.stop\)/)
  assert.match(source, /GlobalGraphTaskIndicator/)
  assert.match(source, /const logicalGraphProjects = computed/)
  assert.match(source, /:items="logicalGraphProjects"/)
  assert.match(source, /:connection="monitor\.state\.connection"/)
  assert.match(source, /:last-synced-at="monitor\.state\.lastSyncedAt"/)
  assert.match(source, /@refresh="monitor\.refresh"/)
  assert.match(source, /name:\s*'Process'/)
  assert.doesNotMatch(source, /openProjectQa|navigateGraphProjectToQa/)
})

test('renders a compact graph-task-status trigger with an active count', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{ ...completedItem, status: 'graph_building', evolutionStatus: undefined, progress: 42, active: true, canOpenQa: false }]
  })

  assert.match(html, /图谱演化状态/)
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

test('removes QA shortcuts from the task indicator until the workflow is ready', async () => {
  const componentSource = await readFile(
    new URL('../src/features/tasks/GlobalGraphTaskIndicator.vue', import.meta.url),
    'utf8'
  )
  const shellSource = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(componentSource, /open-qa|graph-task-indicator__qa|去问答|问答首页/)
  assert.doesNotMatch(shellSource, /@open-qa|function openProjectQa|navigateGraphProjectToQa/)
})
