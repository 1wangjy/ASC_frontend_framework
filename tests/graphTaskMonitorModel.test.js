import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGraphMonitorDelay,
  normalizeGraphTaskItems,
  selectVisibleGraphTasks,
  unwrapGraphProjects
} from '../src/features/tasks/graphTaskMonitorModel.js'

test('unwraps the backend project response envelope', () => {
  assert.deepEqual(
    unwrapGraphProjects({ success: true, data: [{ project_id: 'p1' }] }),
    [{ project_id: 'p1' }]
  )
})

test('uses ontology progress and message while generating an ontology', () => {
  const [item] = normalizeGraphTaskItems([{
    project_id: 'p1',
    status: 'ontology_generating',
    ontology_progress: { progress: '44', message: 'Extracting concepts' }
  }])

  assert.equal(item.progress, 44)
  assert.equal(item.message, 'Extracting concepts')
  assert.equal(item.active, true)
})

test('uses the matching graph-build task progress and message', () => {
  const [item] = normalizeGraphTaskItems([{
    project_id: 'p1',
    status: 'graph_building',
    graph_build_task_id: 'task-1',
    ontology_progress: { progress: 20, message: 'Ontology message' }
  }], new Map([['task-1', { progress: '73', message: 'Writing graph' }]]))

  assert.equal(item.progress, 73)
  assert.equal(item.message, 'Writing graph')
})

test('preserves the Professional relationship needed to group backend project records', () => {
  const [item] = normalizeGraphTaskItems([{
    project_id: 'pro-1',
    base_project_id: 'base-1',
    graph_build_stage: 'professional',
    status: 'graph_building'
  }])

  assert.equal(item.baseProjectId, 'base-1')
  assert.equal(item.stage, 'professional')
})

test('permits QA only for completed Professional projects with both identifiers', () => {
  const items = normalizeGraphTaskItems([
    { project_id: 'base-1', graph_id: 'base-g', graph_build_stage: 'base', status: 'graph_completed' },
    { project_id: 'pro-1', graph_id: 'pro-g', base_project_id: 'base-1', graph_build_stage: 'professional', status: 'graph_completed' },
    { project_id: 'pro-2', graph_id: '', base_project_id: 'base-2', graph_build_stage: 'professional', status: 'graph_completed' },
    { project_id: 'pro-3', graph_id: 'pro-g3', base_project_id: 'base-3', graph_build_stage: 'professional', status: 'graph_building' }
  ])

  assert.deepEqual(
    new Map(items.map(item => [item.projectId, item.canOpenQa])),
    new Map([['base-1', false], ['pro-1', true], ['pro-2', false], ['pro-3', false]])
  )
})

test('does not permit QA when a completed project has whitespace-only identifiers', () => {
  const items = normalizeGraphTaskItems([
    { project_id: 'p1', graph_id: '   ', graph_build_stage: 'professional', status: 'graph_completed' },
    { project_id: 'p2', graph_id: 'g2', graph_build_stage: 'professional', status: 'graph_completed' }
  ])

  assert.equal(items.find(item => item.projectId === 'p1').canOpenQa, false)
  assert.equal(items.find(item => item.projectId === 'p2').canOpenQa, true)
})

test('surfaces a failed graph task error as an inactive terminal failure', () => {
  const [item] = normalizeGraphTaskItems([{
    project_id: 'p1',
    status: 'graph_building',
    graph_build_task_id: 'task-1',
    ontology_progress: { message: 'Ontology message' }
  }], new Map([['task-1', {
    status: 'failed',
    error: '图谱写入失败',
    message: 'Delayed status message'
  }]]))

  assert.equal(item.status, 'failed')
  assert.equal(item.active, false)
  assert.equal(item.message, '图谱写入失败')
})

test('keeps active tasks and only the first three terminal tasks visible', () => {
  const visible = selectVisibleGraphTasks([
    { id: 'active-1', active: true },
    { id: 'done-1', active: false },
    { id: 'done-2', active: false },
    { id: 'active-2', active: true },
    { id: 'done-3', active: false },
    { id: 'done-4', active: false }
  ])

  assert.deepEqual(visible.map(item => item.id), [
    'active-1', 'active-2', 'done-1', 'done-2', 'done-3'
  ])
})

test('polls active tasks quickly and idle tasks slowly', () => {
  assert.equal(getGraphMonitorDelay([{ active: true }]), 1500)
  assert.equal(getGraphMonitorDelay([{ active: false }]), 12000)
})
