import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGraphQaRoute } from '../src/features/projects/graphQaNavigation.js'

test('builds a QA route from a completed graph project', () => {
  assert.deepEqual(buildGraphQaRoute({ project_id: ' p1 ', graph_id: ' g1 ' }), {
    name: 'AscQa',
    query: { projectId: 'p1' }
  })
})

test('does not route an incomplete graph build', () => {
  assert.equal(buildGraphQaRoute({ project_id: 'p1', graph_id: '' }), null)
  assert.equal(buildGraphQaRoute({ project_id: '', graph_id: 'g1' }), null)
})

test('graph completion still navigates when the browser storage getter is denied', async () => {
  const navigation = await import('../src/features/projects/graphQaNavigation.js')
  const browser = {}
  Object.defineProperty(browser, 'localStorage', {
    get() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  })
  let navigatedRoute = null

  assert.equal(typeof navigation.navigateGraphProjectToQa, 'function')
  const navigated = await navigation.navigateGraphProjectToQa({
    project: { project_id: 'p1', graph_id: 'g1' },
    browser,
    navigate: (route) => { navigatedRoute = route }
  })

  assert.equal(navigated, true)
  assert.deepEqual(navigatedRoute, { name: 'AscQa', query: { projectId: 'p1' } })
})

test('completed-task finalization reports getProject failure without navigating', async () => {
  const navigation = await import('../src/features/projects/graphQaNavigation.js')
  assert.equal(typeof navigation.completeTaskGraphForQa, 'function')
  let navigated = false

  const result = await navigation.completeTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => { throw new Error('project lookup unavailable') },
    loadGraph: async () => true,
    navigate: async () => { navigated = true }
  })

  assert.equal(result.status, 'error')
  assert.match(result.message, /getProject.*project lookup unavailable/)
  assert.equal(navigated, false)
})

test('completed-task finalization rejects missing final identifiers without loading or navigating', async () => {
  const { completeTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  let graphLoaded = false
  let navigated = false

  const result = await completeTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => ({
      success: true,
      data: { project_id: 'p1', graph_id: '', status: 'graph_completed' }
    }),
    loadGraph: async () => { graphLoaded = true; return true },
    navigate: async () => { navigated = true }
  })

  assert.equal(result.status, 'error')
  assert.match(result.message, /project_id.*graph_id/)
  assert.equal(graphLoaded, false)
  assert.equal(navigated, false)
})

test('completed-task finalization navigates only after the final graph load succeeds', async () => {
  const { completeTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []

  const result = await completeTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => {
      calls.push('getProject')
      return {
        success: true,
        data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
      }
    },
    loadGraph: async () => {
      calls.push('loadGraph')
      return false
    },
    navigate: async () => { calls.push('navigate') }
  })

  assert.equal(result.status, 'error')
  assert.match(result.message, /graph load/)
  assert.deepEqual(calls, ['getProject', 'loadGraph'])
})

test('completed-task finalization validates and readies a graph without automatic navigation when requested', async () => {
  const { completeTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []

  const result = await completeTaskGraphForQa({
    projectId: 'p1',
    navigateWhenReady: false,
    getProject: async () => {
      calls.push('getProject')
      return {
        success: true,
        data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
      }
    },
    loadGraph: async () => { calls.push('loadGraph'); return true },
    onReady: async () => { calls.push('onReady') },
    navigate: async () => { calls.push('navigate') }
  })

  assert.equal(result.status, 'success')
  assert.deepEqual(result.route, { name: 'AscQa', query: { projectId: 'p1' } })
  assert.deepEqual(calls, ['getProject', 'loadGraph', 'onReady'])
})

test('completed-task no-navigation finalization still reports graph loading failures before readiness', async () => {
  const { completeTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []

  const result = await completeTaskGraphForQa({
    projectId: 'p1',
    navigateWhenReady: false,
    getProject: async () => ({
      success: true,
      data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
    }),
    loadGraph: async () => { calls.push('loadGraph'); return false },
    onReady: async () => { calls.push('onReady') }
  })

  assert.equal(result.status, 'error')
  assert.match(result.message, /graph load/)
  assert.deepEqual(calls, ['loadGraph'])
})

test('missing-task fallback reports getProject failure without navigating', async () => {
  const navigation = await import('../src/features/projects/graphQaNavigation.js')
  assert.equal(typeof navigation.completeMissingTaskGraphForQa, 'function')
  let navigated = false

  const result = await navigation.completeMissingTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => ({ success: false, error: 'project lookup failed' }),
    loadGraph: async () => true,
    navigate: async () => { navigated = true }
  })

  assert.equal(result.status, 'error')
  assert.match(result.message, /getProject.*project lookup failed/)
  assert.equal(navigated, false)
})

test('missing-task fallback keeps polling an unfinished project without navigating', async () => {
  const { completeMissingTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  let graphLoaded = false
  let navigated = false

  const result = await completeMissingTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => ({
      success: true,
      data: { project_id: 'p1', graph_id: 'g1', status: 'graph_building' }
    }),
    loadGraph: async () => { graphLoaded = true; return true },
    navigate: async () => { navigated = true }
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.project.status, 'graph_building')
  assert.equal(graphLoaded, false)
  assert.equal(navigated, false)
})

test('missing-task fallback navigates only after its completed graph loads', async () => {
  const { completeMissingTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []

  const failed = await completeMissingTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => ({
      success: true,
      data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
    }),
    loadGraph: async () => false,
    navigate: async () => { calls.push('navigate-after-failure') }
  })
  assert.equal(failed.status, 'error')
  assert.equal(calls.length, 0)

  const completed = await completeMissingTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => {
      calls.push('getProject')
      return {
        success: true,
        data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
      }
    },
    loadGraph: async () => { calls.push('loadGraph'); return true },
    navigate: async () => { calls.push('navigate'); return true }
  })

  assert.equal(completed.status, 'success')
  assert.deepEqual(calls, ['getProject', 'loadGraph', 'navigate'])
})

test('missing-task fallback stops completion polling before the final graph load', async () => {
  const { completeMissingTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []

  const result = await completeMissingTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => {
      calls.push('getProject')
      return {
        success: true,
        data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
      }
    },
    onCompletedProject: async () => { calls.push('stopPolling') },
    loadGraph: async () => { calls.push('loadGraph'); return true },
    navigate: async () => { calls.push('navigate'); return true }
  })

  assert.equal(result.status, 'success')
  assert.deepEqual(calls, ['getProject', 'stopPolling', 'loadGraph', 'navigate'])
})
