import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDeleteGraphProjectRequest,
  buildDeleteGraphRequest,
  buildListProjectsRequest,
  buildReportDownloadRequest,
  buildReportSectionsRequest,
  buildReportStatusRequest,
  buildResetGraphProjectRequest,
  buildSimulationInterviewRequest,
  buildUpdateGraphEdgeRequest
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

test('builds graph project maintenance requests with encoded backend ids', () => {
  assert.deepEqual(buildUpdateGraphEdgeRequest('project/7', 'edge 2', { fact: 'A → B' }), {
    url: '/api/graph/project/project%2F7/metadata/edge/edge%202',
    method: 'patch',
    data: { fact: 'A → B' }
  })
  assert.deepEqual(buildResetGraphProjectRequest('project/7'), {
    url: '/api/graph/project/project%2F7/reset',
    method: 'post'
  })
  assert.deepEqual(buildDeleteGraphProjectRequest('project/7'), {
    url: '/api/graph/project/project%2F7',
    method: 'delete'
  })
  assert.deepEqual(buildDeleteGraphRequest('graph/7'), {
    url: '/api/graph/delete/graph%2F7',
    method: 'delete'
  })
})

test('builds report section and Markdown download requests', () => {
  assert.deepEqual(buildReportSectionsRequest('report/9'), {
    url: '/api/report/report%2F9/sections',
    method: 'get'
  })
  assert.deepEqual(buildReportDownloadRequest('report/9'), {
    url: '/api/report/report%2F9/download',
    method: 'get',
    responseType: 'blob'
  })
})

test('maps each supported interview scope to the real simulation endpoint', () => {
  const data = { simulation_id: 'sim-1', prompt: 'What changed?' }

  assert.deepEqual(buildSimulationInterviewRequest('single', data), {
    url: '/api/simulation/interview',
    method: 'post',
    data
  })
  assert.deepEqual(buildSimulationInterviewRequest('batch', data), {
    url: '/api/simulation/interview/batch',
    method: 'post',
    data
  })
  assert.deepEqual(buildSimulationInterviewRequest('all', data), {
    url: '/api/simulation/interview/all',
    method: 'post',
    data
  })
  assert.throws(
    () => buildSimulationInterviewRequest('preview', data),
    /Unsupported interview scope/
  )
})
