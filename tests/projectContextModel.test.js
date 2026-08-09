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

test('unwraps the backend project-list envelope and normalizes identifiers', () => {
  const result = listGraphProjects({
    success: true,
    data: [{ project_id: ' p1 ', graph_id: ' g1 ', updated_at: '2026-08-08T10:00:00Z' }]
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].project_id, 'p1')
  assert.equal(result[0].graph_id, 'g1')
})

test('prefers URL project, then stored project, then newest project', () => {
  assert.equal(resolveActiveProject(projects, 'older', 'newer')?.project_id, 'older')
  assert.equal(resolveActiveProject(projects, 'missing', 'older')?.project_id, 'older')
  assert.equal(resolveActiveProject(projects, 'missing', 'also-missing')?.project_id, 'newer')
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

test('never fabricates a usable project when the backend has no graph id', () => {
  assert.deepEqual(listGraphProjects([
    { project_id: 'unfinished', graph_id: '' },
    { project_id: '', graph_id: 'graph-without-project' }
  ]), [])
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

test('treats unavailable browser storage as an empty active-project memory', () => {
  const storage = {
    getItem() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  }

  assert.equal(readActiveProjectId(storage), null)
})

test('treats a throwing browser localStorage getter as unavailable storage', async () => {
  const projectContext = await import('../src/features/projects/projectContextModel.js')
  const browser = {}
  Object.defineProperty(browser, 'localStorage', {
    get() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  })

  assert.equal(typeof projectContext.getBrowserStorage, 'function')
  assert.equal(projectContext.getBrowserStorage(browser), null)
})

test('does not let active-project storage writes block the calling flow', () => {
  let continuedAfterWrite = false
  const storage = {
    setItem() {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    },
    removeItem() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  }

  assert.doesNotThrow(() => {
    rememberActiveProjectId(storage, 'project-1')
    continuedAfterWrite = true
  })
  assert.equal(continuedAfterWrite, true)
  assert.doesNotThrow(() => rememberActiveProjectId(storage, ''))
})

test('invalid-scope refresh leaves every project unselected for a manual choice', async () => {
  const projectContext = await import('../src/features/projects/projectContextModel.js')
  assert.equal(typeof projectContext.resolveProjectAfterRefresh, 'function')

  const availableProjects = [
    { project_id: 'p2', graph_id: 'g2', updated_at: '2026-08-09T01:00:00Z' },
    { project_id: 'p1', graph_id: 'g1', updated_at: '2026-08-09T00:00:00Z' }
  ]

  assert.equal(projectContext.resolveProjectAfterRefresh(availableProjects, {
    routeProjectId: 'p1',
    storedProjectId: 'p2',
    requireManualSelection: true
  }), null)
  assert.equal(projectContext.resolveProjectAfterRefresh(availableProjects, {
    routeProjectId: 'p1',
    storedProjectId: 'p2'
  })?.project_id, 'p1')
})
