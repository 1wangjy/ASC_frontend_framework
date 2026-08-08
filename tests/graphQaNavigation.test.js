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
