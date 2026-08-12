import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { renderSfc } from './helpers/renderSfc.js'
import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { primaryNavigation } from '../src/features/navigation/appNavigation.js'
import {
  deleteLogicalGraphProjectResources,
  deleteGraphProjectResources,
  normalizeProjectName,
  projectDeletionMessage,
  suggestNextProjectName
} from '../src/features/projects/graphProjectWorkspaceModel.js'
import {
  buildLogicalGraphProjects,
  isFinalGraphProject
} from '../src/features/projects/logicalGraphProjectModel.js'

const activeProject = {
  id: 'task-active',
  projectId: 'p-active',
  graphId: '',
  name: 'project_2',
  status: 'graph_building',
  stage: 'base',
  progress: 42,
  active: true,
  canOpenQa: false,
  memberProjectIds: ['p-active'],
  resources: [{ projectId: 'p-active', graphId: '' }]
}

const completedProject = {
  id: 'task-completed',
  projectId: 'p-completed',
  graphId: 'g-completed',
  name: 'project_1',
  status: 'graph_completed',
  evolutionStatus: 'professional_completed',
  stage: 'professional',
  progress: 100,
  active: false,
  canOpenQa: true,
  memberProjectIds: ['p-completed', 'base-completed'],
  resources: [
    { projectId: 'p-completed', graphId: 'g-completed' },
    { projectId: 'base-completed', graphId: 'base-g' }
  ]
}

const baseCompletedProject = {
  id: 'base-completed',
  projectId: 'base-only',
  graphId: 'base-only-g',
  name: 'project_base_only',
  status: 'base_completed',
  stage: 'base',
  active: false,
  canOpenQa: false,
  memberProjectIds: ['base-only'],
  resources: [{ projectId: 'base-only', graphId: 'base-only-g' }]
}

test('keeps the Base graph build action inside the split workspace card', async () => {
  const source = await readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8')
  const buildInputsCss = source.slice(
    source.indexOf('.build-inputs {'),
    source.indexOf('.node-limit-label,')
  )
  const buildButtonCss = source.slice(
    source.indexOf('.build-btn {'),
    source.indexOf('.build-btn:disabled')
  )
  const nodeInputCss = source.slice(
    source.indexOf('.node-limit-input input {'),
    source.indexOf('.build-btn {')
  )

  assert.match(buildInputsCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(buildButtonCss, /grid-column:\s*1\s*\/\s*-1/)
  assert.match(buildButtonCss, /width:\s*100%/)
  assert.match(nodeInputCss, /box-sizing:\s*border-box/)
  assert.match(nodeInputCss, /min-width:\s*0/)
})

test('groups Base and Professional backend records into one user-visible project', () => {
  const logical = buildLogicalGraphProjects([
    {
      projectId: 'base-1',
      graphId: 'base-g',
      name: 'project_1',
      stage: 'base',
      status: 'graph_completed',
      active: false,
      updatedAt: 1
    },
    {
      projectId: 'pro-1',
      graphId: '',
      name: 'Professional Research Graph Project',
      baseProjectId: 'base-1',
      stage: 'professional',
      status: 'graph_building',
      active: true,
      updatedAt: 2
    }
  ])

  assert.equal(logical.length, 1)
  assert.equal(logical[0].name, 'project_1')
  assert.equal(logical[0].projectId, 'pro-1')
  assert.equal(logical[0].canOpenQa, false)
  assert.deepEqual(logical[0].memberProjectIds, ['pro-1', 'base-1'])
})

test('groups the generated Professional record by workflow name when the backend omits base_project_id', () => {
  const logical = buildLogicalGraphProjects([
    {
      projectId: 'base-haha',
      graphId: 'base-g',
      name: '哈哈哈',
      stage: 'base',
      status: 'graph_completed',
      active: false,
      updatedAt: 1
    },
    {
      projectId: 'pro-haha',
      graphId: 'pro-g',
      name: '哈哈哈 · Professional Research',
      status: 'graph_completed',
      active: false,
      updatedAt: 2
    }
  ])

  assert.equal(logical.length, 1)
  assert.equal(logical[0].name, '哈哈哈')
  assert.equal(logical[0].projectId, 'pro-haha')
  assert.equal(logical[0].canOpenQa, true)
  assert.deepEqual(logical[0].memberProjectIds, ['pro-haha', 'base-haha'])
})

test('treats only a completed Professional record as the final graph', () => {
  assert.equal(isFinalGraphProject(null), false)

  assert.equal(isFinalGraphProject({
    project_id: 'base-1',
    graph_id: 'base-g',
    graph_build_stage: 'base',
    status: 'graph_completed'
  }), false)

  assert.equal(isFinalGraphProject({
    project_id: 'pro-1',
    graph_id: 'pro-g',
    base_project_id: 'base-1',
    graph_build_stage: 'professional',
    status: 'graph_completed'
  }), true)
})

test('keeps an unlinked Professional record visible instead of merging it incorrectly', () => {
  const logical = buildLogicalGraphProjects([{
    projectId: 'pro-orphan',
    graphId: 'pro-g',
    name: 'Imported Professional Graph',
    baseProjectId: 'missing-base',
    stage: 'professional',
    status: 'graph_completed',
    active: false,
    updatedAt: 3
  }])

  assert.equal(logical.length, 1)
  assert.equal(logical[0].name, 'Imported Professional Graph')
  assert.equal(logical[0].projectId, 'pro-orphan')
  assert.equal(logical[0].canOpenQa, true)
})

test('suggests the next project_N name from backend and monitor project labels', () => {
  assert.equal(suggestNextProjectName([
    { project_name: 'project_1' },
    { name: 'Other' },
    { name: 'project_7' },
    { project_name: ' project_3 ' }
  ]), 'project_8')
  assert.equal(suggestNextProjectName([]), 'project_1')
})

test('normalizes a user-entered project name without inventing one', () => {
  assert.equal(normalizeProjectName('  ASC thermal graph  '), 'ASC thermal graph')
  assert.equal(normalizeProjectName('   '), '')
})

test('warns explicitly before deleting an active graph project', () => {
  assert.match(projectDeletionMessage({ name: 'project_2', active: true }), /正在构建/)
  assert.match(projectDeletionMessage({ name: 'project_2', active: true }), /无法撤销/)
  assert.doesNotMatch(projectDeletionMessage({ name: 'project_2', active: false }), /正在构建/)
})

test('deletes the authoritative project record before cleaning the remote graph', async () => {
  const calls = []
  await deleteGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, { projectId: 'p1', graphId: 'g1' })

  assert.deepEqual(calls, [['project', 'p1'], ['graph', 'g1']])
})

test('deletes a graph-building project that does not have a graph id yet', async () => {
  const calls = []
  await deleteGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, { project_id: 'p-active', graph_id: '', active: true })

  assert.deepEqual(calls, [['project', 'p-active']])
})

test('deletes every backend record in a logical project from child to root', async () => {
  const calls = []
  await deleteLogicalGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, completedProject)

  assert.deepEqual(calls, [
    ['project', 'p-completed'],
    ['graph', 'g-completed'],
    ['project', 'base-completed'],
    ['graph', 'base-g']
  ])
})

test('keeps the project deleted when remote graph cleanup resolves as failed', async () => {
  let projectDeleteCalls = 0

  const result = await deleteGraphProjectResources({
    deleteGraph: async () => ({ success: false, error: 'remote graph is busy' }),
    deleteGraphProject: async () => { projectDeleteCalls += 1; return { success: true } }
  }, { projectId: 'p1', graphId: 'g1' })

  assert.equal(projectDeleteCalls, 1)
  assert.deepEqual(result.cleanupWarnings, ['remote graph is busy'])
})

test('requires a project id before issuing destructive requests', async () => {
  await assert.rejects(
    deleteGraphProjectResources({
      deleteGraph: async () => ({ success: true }),
      deleteGraphProject: async () => ({ success: true })
    }, { projectId: ' ' }),
    /缺少项目 ID/
  )
})

test('renders active and completed projects with status-aware actions', async () => {
  const html = await renderSfc('/src/features/projects/GraphProjectList.vue', {
    items: [activeProject, baseCompletedProject, completedProject],
    selectedProjectId: 'base-completed'
  })

  assert.match(html, /project_2/)
  assert.match(html, /正在 Base 构建/)
  assert.match(html, /Base 构建完成，等待 Professional 构建/)
  assert.match(html, /project_1/)
  assert.match(html, /Professional 构建完成，等待环境搭建/)
  assert.match(html, /删除/)
  assert.doesNotMatch(html, /去问答/)
  assert.doesNotMatch(html, /\d+%/)
  assert.doesNotMatch(html, /graph-project-card__progress/)
  assert.doesNotMatch(html, /Professional Research|基础图谱|最终图谱/)
  assert.match(html, /graph-project-card--selected/)
})

test('renders the latest graph evolution state supplied by the monitor', async () => {
  const html = await renderSfc('/src/features/projects/GraphProjectList.vue', {
    items: [
      { ...completedProject, projectId: 'running', name: '运行项目', evolutionStatus: 'evolution_running' },
      { ...completedProject, projectId: 'completed', name: '完成项目', evolutionStatus: 'evolution_completed' },
      { ...completedProject, projectId: 'failed', name: '失败项目', evolutionStatus: 'evolution_failed' },
      { ...completedProject, projectId: 'stopped', name: '停止项目', evolutionStatus: 'evolution_stopped' }
    ]
  })

  assert.match(html, /正在模拟组会/)
  assert.match(html, /模拟组会已完成/)
  assert.match(html, /模拟组会失败/)
  assert.match(html, /模拟组会已停止/)
})

test('renders the five-step workflow without a misleading graph percentage', async () => {
  const html = await renderSfc('/src/components/WorkflowProgressBar.vue', {
    currentStep: 1
  })

  assert.match(html, /步骤 1\/5/)
  assert.doesNotMatch(html, /当前步骤\s*\d+%/)
  assert.doesNotMatch(html, /workflow-track|workflow-fill/)
})

test('shows Step 1 QA only for a completed Professional graph', async () => {
  const baseHtml = await renderSfc('/src/components/Step1GraphBuild.vue', {
    currentPhase: 4,
    projectData: {
      project_id: 'base-1',
      graph_id: 'base-g',
      graph_build_stage: 'base',
      status: 'graph_completed'
    }
  })
  const professionalHtml = await renderSfc('/src/components/Step1GraphBuild.vue', {
    currentPhase: 4,
    projectData: {
      project_id: 'pro-1',
      graph_id: 'pro-g',
      base_project_id: 'base-1',
      graph_build_stage: 'professional',
      status: 'graph_completed'
    }
  })

  assert.doesNotMatch(baseHtml, /去图谱问答/)
  assert.match(professionalHtml, /去图谱问答/)
})

test('renders a useful empty graph workspace project list', async () => {
  const html = await renderSfc('/src/features/projects/GraphProjectList.vue', { items: [] })
  assert.match(html, /暂无图谱项目/)
  assert.match(html, /请先从文献管理选择文献并开始构建/)
})

test('renders an accessible in-page confirmation for an active project', async () => {
  const html = await renderSfc('/src/features/projects/GraphProjectDeleteDialog.vue', {
    project: activeProject,
    deleting: false
  })

  assert.match(html, /role="alertdialog"/)
  assert.match(html, /project_2/)
  assert.match(html, /正在构建/)
  assert.match(html, /取消/)
  assert.match(html, /确认删除/)
})

test('workspace uses the in-page confirmation instead of a native browser dialog', async () => {
  const source = await readFile(new URL('../src/features/projects/GraphProjectWorkspacePanel.vue', import.meta.url), 'utf8')
  const dialogSource = await readFile(new URL('../src/features/projects/GraphProjectDeleteDialog.vue', import.meta.url), 'utf8')

  assert.match(source, /GraphProjectDeleteDialog/)
  assert.doesNotMatch(source, /globalThis\.confirm|window\.confirm/)
  assert.match(dialogSource, /<Teleport\s+to="body"/)
  assert.match(dialogSource, /:disabled="teleportDisabled"/)
})

test('shell collapses the graph project column into a compact reopen control', async () => {
  const source = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')

  assert.match(source, /graphProjectPanelCollapsed/)
  assert.match(source, /app-shell__route-frame--project-panel-collapsed/)
  assert.match(source, /aria-label="打开项目栏"/)
  assert.match(source, /data-tooltip="打开项目栏"/)
  assert.match(source, /@collapse="graphProjectPanelCollapsed = true"/)
  assert.match(source, /grid-template-columns:\s*44px\s+minmax\(0,\s*1fr\)/)
  assert.match(source, /\.project-panel-rail__open\s*\{[^}]*top:\s*76px/s)
  assert.match(source, /\.project-panel-rail__open\s*\{[^}]*margin:\s*76px auto 0/s)
})

test('project panel exposes a compact collapse control', async () => {
  const source = await readFile(new URL('../src/features/projects/GraphProjectWorkspacePanel.vue', import.meta.url), 'utf8')

  assert.match(source, /defineEmits\(\['collapse'\]\)/)
  assert.match(source, /aria-label="收起项目栏"/)
  assert.match(source, /\$emit\('collapse'\)/)
  assert.match(source, /graph-project-panel__header-actions/)
  assert.doesNotMatch(source, /\.graph-project-panel__collapse\s*\{[^}]*position:\s*absolute/s)
})

test('registers graph evolution and report generation as separate primary destinations', () => {
  assert.deepEqual(primaryNavigation.map(item => [item.label, item.path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents'],
    ['图谱演化', '/process'],
    ['报告生成', '/reports']
  ])
  assert.equal(
    ascRouteDefinitions.find(route => route.name === 'Process')?.path,
    '/process/:projectId?'
  )
  assert.equal(
    ascRouteDefinitions.find(route => route.name === 'Process')?.meta.navigationPath,
    '/process'
  )
})
