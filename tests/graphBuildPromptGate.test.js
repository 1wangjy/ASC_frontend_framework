import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  canBuildGraphProject,
  GRAPH_BUILD_RESEARCH_QUESTION_ERROR,
  runGraphBuildProjectRequest
} from '../src/features/research/simulationPreparationModel.js'

test('allows graph construction only when the project has a normalized research question', () => {
  assert.equal(canBuildGraphProject({ query_prompt: '  Study thermal shock.  ' }), true)
  assert.equal(canBuildGraphProject({ query_prompt: ' ', simulation_requirement: '\tFallback question\n' }), true)
  assert.equal(canBuildGraphProject({ query_prompt: ' \n ', simulation_requirement: '\t' }), false)
  assert.equal(canBuildGraphProject(null), false)
})

test('does not call the graph API for an empty or whitespace project research question', async () => {
  let buildGraphCalls = 0
  const payload = { project_id: 'legacy-empty-project', build_stage: 'base' }

  const result = await runGraphBuildProjectRequest({
    project: { project_id: 'legacy-empty-project', query_prompt: ' ', simulation_requirement: '\n\t' },
    payload,
    buildGraph: async () => {
      buildGraphCalls++
      return { success: true }
    }
  })

  assert.deepEqual(result, {
    canStart: false,
    error: GRAPH_BUILD_RESEARCH_QUESTION_ERROR,
    response: null
  })
  assert.equal(buildGraphCalls, 0)
})

test('passes an allowed graph payload through without changing its fields', async () => {
  const calls = []
  const payload = {
    project_id: 'project-1',
    entity_node_limit: 60,
    target_edge_count: 180,
    post_target_edge_iterations: 2,
    build_stage: 'base',
    source_corpus_type: 'survey'
  }

  const result = await runGraphBuildProjectRequest({
    project: { query_prompt: ' Question ' },
    payload,
    buildGraph: async value => {
      calls.push(value)
      return { success: true, data: { task_id: 'task-1' } }
    }
  })

  assert.equal(result.canStart, true)
  assert.equal(result.error, '')
  assert.equal(result.response.data.task_id, 'task-1')
  assert.deepEqual(calls, [payload])
})

test('Step 1 and MainView expose the graph prompt guard before any graph request or UI mutation', async () => {
  const [step1Source, mainViewSource] = await Promise.all([
    readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')
  ])
  const startBuildBlock = mainViewSource.slice(
    mainViewSource.indexOf('const startBuildGraph = async'),
    mainViewSource.indexOf('const nodeIdOf')
  )
  const guardIndex = startBuildBlock.indexOf('if (!canBuildGraphProject(projectData.value))')
  const errorClearIndex = startBuildBlock.indexOf("error.value = ''")
  const phaseMutationIndex = startBuildBlock.indexOf('currentPhase.value =')
  const apiIndex = startBuildBlock.indexOf('runGraphBuildProjectRequest({')

  assert.match(step1Source, /canBuildGraphProject\(props\.projectData\)/)
  assert.match(step1Source, /:disabled="!canStartBuild"/)
  assert.ok(step1Source.includes('\u5f53\u524d\u9879\u76ee\u7f3a\u5c11\u7814\u7a76\u95ee\u9898\uff0c\u4e0d\u80fd\u5f00\u59cb\u56fe\u8c31\u6784\u5efa\u3002'))
  assert.ok(step1Source.includes('\u95ee\u7b54\u9996\u9875'))
  assert.match(step1Source, /router\.push\(\{ name: 'AscQa' \}\)/)

  assert.equal(guardIndex >= 0, true)
  assert.equal(errorClearIndex > guardIndex, true)
  assert.equal(phaseMutationIndex > guardIndex, true)
  assert.equal(apiIndex > guardIndex, true)
  assert.ok(mainViewSource.includes('<div v-if="error" class="global-error-banner" role="alert">'))
  assert.ok(startBuildBlock.includes('GRAPH_BUILD_RESEARCH_QUESTION_ERROR'))
  assert.ok(startBuildBlock.includes('Graph build blocked: project research question is empty after normalization.'))
})
