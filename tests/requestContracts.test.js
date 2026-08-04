import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildListProjectsRequest,
  buildReportStatusRequest
} from '../src/api/requestContracts.js'

test('builds the existing graph-project list request', () => {
  assert.deepEqual(buildListProjectsRequest({ limit: 20 }), {
    url: '/api/graph/project/list',
    method: 'get',
    params: { limit: 20 }
  })
})

test('posts a report task identifier in the JSON body', () => {
  assert.deepEqual(buildReportStatusRequest({ taskId: 'task-7' }), {
    url: '/api/report/generate/status',
    method: 'post',
    data: { task_id: 'task-7' }
  })
})

test('posts a simulation identifier without placeholder fields', () => {
  assert.deepEqual(buildReportStatusRequest({ simulationId: 'sim-3' }), {
    url: '/api/report/generate/status',
    method: 'post',
    data: { simulation_id: 'sim-3' }
  })
})

