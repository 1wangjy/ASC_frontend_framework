import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { renderSfc } from './helpers/renderSfc.js'
import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { primaryNavigation } from '../src/features/navigation/appNavigation.js'
import {
  deleteGraphProjectResources,
  normalizeProjectName,
  projectDeletionMessage,
  suggestNextProjectName
} from '../src/features/projects/graphProjectWorkspaceModel.js'

const activeProject = {
  id: 'task-active',
  projectId: 'p-active',
  graphId: '',
  name: 'project_2',
  status: 'graph_building',
  progress: 42,
  active: true,
  canOpenQa: false
}

const completedProject = {
  id: 'task-completed',
  projectId: 'p-completed',
  graphId: 'g-completed',
  name: 'project_1',
  status: 'graph_completed',
  progress: 100,
  active: false,
  canOpenQa: true
}

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

test('deletes the remote graph before the local project', async () => {
  const calls = []
  await deleteGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, { projectId: 'p1', graphId: 'g1' })

  assert.deepEqual(calls, [['graph', 'g1'], ['project', 'p1']])
})

test('deletes a graph-building project that does not have a graph id yet', async () => {
  const calls = []
  await deleteGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, { project_id: 'p-active', graph_id: '', active: true })

  assert.deepEqual(calls, [['project', 'p-active']])
})

test('stops local deletion when remote graph deletion resolves as failed', async () => {
  let projectDeleteCalls = 0

  await assert.rejects(
    deleteGraphProjectResources({
      deleteGraph: async () => ({ success: false, error: 'remote graph is busy' }),
      deleteGraphProject: async () => { projectDeleteCalls += 1; return { success: true } }
    }, { projectId: 'p1', graphId: 'g1' }),
    /remote graph is busy/
  )
  assert.equal(projectDeleteCalls, 0)
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
    items: [activeProject, completedProject],
    selectedProjectId: 'p-active'
  })

  assert.match(html, /project_2/)
  assert.match(html, /构建图谱/)
  assert.match(html, /project_1/)
  assert.match(html, /已完成/)
  assert.match(html, /删除/)
  assert.match(html, /去问答/)
  assert.equal((html.match(/去问答/g) || []).length, 1)
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
  const source = await readFile(new URL('../src/views/GraphProjectWorkspaceView.vue', import.meta.url), 'utf8')

  assert.match(source, /GraphProjectDeleteDialog/)
  assert.doesNotMatch(source, /globalThis\.confirm|window\.confirm/)
})

test('registers graph construction as a primary destination with an optional project route', () => {
  assert.deepEqual(primaryNavigation.map(item => [item.label, item.path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents'],
    ['图谱构建', '/process']
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
