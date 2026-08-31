import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildQualifiedQaProjects,
  resolveQualifiedQaSelection
} from '../src/features/qa/qaProjectEligibilityModel.js'
import { requestCodAnswer } from '../src/features/qa/qaApiAdapter.js'

const completedSimulationProject = {
  projectId: 'p1',
  project_id: 'p1',
  graphId: 'g1',
  graph_id: 'g1',
  simulationId: 's1',
  simulation_id: 's1',
  evolutionStatus: 'evolution_completed',
  name: '组会已完成项目'
}

test('qualifies a graph for QA after its simulation completes without requiring a report', () => {
  const records = buildQualifiedQaProjects([completedSimulationProject], [])

  assert.deepEqual(records, [{
    projectId: 'p1',
    graphId: 'g1',
    simulationId: 's1',
    projectName: '组会已完成项目',
    project: completedSimulationProject
  }])
  assert.equal(resolveQualifiedQaSelection(records, { routeProjectId: 'p1' }), records[0])
})

test('does not unlock QA for simulations that are unfinished, stopped, or failed', () => {
  for (const evolutionStatus of [
    'professional_completed',
    'environment_preparing',
    'evolution_ready',
    'evolution_running',
    'evolution_stopped',
    'evolution_failed'
  ]) {
    assert.deepEqual(buildQualifiedQaProjects([{
      ...completedSimulationProject,
      evolutionStatus
    }]), [], evolutionStatus)
  }
})

test('submits graph QA after project and simulation validation without report preflight', async () => {
  let submittedPayload = null
  const response = await requestCodAnswer({
    getProject: async () => ({
      success: true,
      data: {
        project_id: 'p1',
        graph_id: 'g1',
        simulation_id: 's1',
        status: 'graph_completed'
      }
    }),
    codGraphRAGQuery: async payload => {
      submittedPayload = payload
      return {
        success: true,
        data: {
          qa_run_id: 'qa1',
          final_answer: '回答',
          references: [],
          debug_trace: {
            graph_context: {
              scope_resolution: 'project_id',
              project_id: 'p1',
              graph_id: 'g1'
            }
          }
        }
      }
    }
  }, {
    simulationId: 's1',
    question: '研究问题',
    project: { project_id: 'p1', graph_id: 'g1' }
  })

  assert.equal(response.qaRunId, 'qa1')
  assert.equal(submittedPayload.project_id, 'p1')
  assert.equal(submittedPayload.graph_id, 'g1')
  assert.equal(submittedPayload.simulation_id, 's1')
  assert.equal('report_id' in submittedPayload, false)
})
