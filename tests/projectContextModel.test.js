import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIVE_PROJECT_STORAGE_KEY,
  listGraphProjects,
  readActiveProjectId,
  rememberActiveProjectId,
  resolveActiveProject
} from '../src/features/projects/projectContextModel.js'

const projects = [
  { project_id: 'without-graph', graph_id: null, updated_at: '2026-08-04T12:00:00Z' },
  { project_id: 'older', graph_id: 'graph-1', updated_at: '2026-08-02T12:00:00Z' },
  { project_id: 'newer', graph_id: 'graph-2', created_at: '2026-08-03T12:00:00Z' }
]

test('keeps only usable graph projects and orders the newest first', () => {
  assert.deepEqual(
    listGraphProjects(projects).map((project) => project.project_id),
    ['newer', 'older']
  )
})

test('restores a preferred usable project', () => {
  assert.equal(resolveActiveProject(projects, 'older')?.project_id, 'older')
})

test('falls back to the newest usable graph project', () => {
  assert.equal(resolveActiveProject(projects, 'missing')?.project_id, 'newer')
})

test('returns null when there is no usable graph project', () => {
  assert.equal(resolveActiveProject([{ project_id: 'p1', graph_id: null }], 'p1'), null)
})

test('persists only the active project identifier', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }

  rememberActiveProjectId(storage, 'older')
  assert.equal(values.get(ACTIVE_PROJECT_STORAGE_KEY), 'older')
  assert.equal(readActiveProjectId(storage), 'older')

  rememberActiveProjectId(storage, '')
  assert.equal(readActiveProjectId(storage), null)
})

