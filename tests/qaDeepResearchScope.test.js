import test from 'node:test'
import assert from 'node:assert/strict'
import { requestCodAnswer, isInvalidQaEligibilityError } from '../src/features/qa/qaApiAdapter.js'

const scope = { project_id: 'p1', graph_id: 'g1' }
const answer = { success: true, data: { final_answer: '服务原答案', debug_trace: { graph_context: { ...scope, scope_resolution: 'project_id' } } } }

test('deep research accepts a completed graph without inventing a simulation ID', async () => {
  let sent
  const result = await requestCodAnswer({
    getProject: async () => ({ data: { ...scope, status: 'graph_completed' } }),
    codGraphRAGQuery: async payload => { sent = payload; return answer }
  }, { question: 'SiC 的作用？', project: scope })
  assert.equal(sent.project_id, 'p1')
  assert.equal(sent.graph_id, 'g1')
  assert.equal(Object.hasOwn(sent, 'simulation_id'), false)
  assert.equal(result.qaResult.final_answer, '服务原答案')
})

test('deep research rejects an incomplete authoritative graph before sending', async () => {
  let calls = 0
  await assert.rejects(() => requestCodAnswer({
    getProject: async () => ({ data: { ...scope, status: 'graph_building' } }),
    codGraphRAGQuery: async () => { calls += 1; return answer }
  }, { question: 'SiC 的作用？', project: scope }), isInvalidQaEligibilityError)
  assert.equal(calls, 0)
})

test('deep research still rejects a supplied simulation ID from another scope', async () => {
  let calls = 0
  await assert.rejects(() => requestCodAnswer({
    getProject: async () => ({ data: { ...scope, status: 'graph_completed', simulation_id: 's2' } }),
    codGraphRAGQuery: async () => { calls += 1; return answer }
  }, { question: 'SiC 的作用？', project: scope, simulationId: 's1' }), isInvalidQaEligibilityError)
  assert.equal(calls, 0)
})
