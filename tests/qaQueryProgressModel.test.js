import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildQaQueryProgress,
  QA_QUERY_PROGRESS_STEPS
} from '../src/features/qa/qaQueryProgressModel.js'

test('reveals the established CoD query stages one at a time', () => {
  const initial = buildQaQueryProgress(0)
  assert.equal(initial.elapsedSeconds, 0)
  assert.equal(initial.percent, 6)
  assert.deepEqual(initial.steps.map(step => step.status), [
    'in_progress',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending'
  ])

  const halfway = buildQaQueryProgress(4100)
  assert.equal(halfway.elapsedSeconds, 4)
  assert.equal(halfway.percent, 50)
  assert.deepEqual(halfway.steps.map(step => step.status), [
    'completed',
    'completed',
    'completed',
    'completed',
    'in_progress',
    'pending',
    'pending',
    'pending',
    'pending'
  ])

  const finalStage = buildQaQueryProgress(10000)
  assert.equal(finalStage.percent, 94)
  assert.equal(finalStage.steps.at(-1).status, 'in_progress')
  assert.equal(finalStage.steps.filter(step => step.status === 'completed').length, 8)
})

test('uses the original nine query stages and user-facing status labels', () => {
  assert.deepEqual(QA_QUERY_PROGRESS_STEPS.map(step => step.key), [
    'llm_initial_question_answer',
    'query_decomposition',
    'llm_free_subgraph_retrieval',
    'adaptive_reasoning_routing',
    'candidate_path_reconstruction',
    'lightweight_path_verification',
    'reasoning_path_selection',
    'path_grounded_answer_generation',
    'llm_answer_refinement'
  ])

  const progress = buildQaQueryProgress(1800)
  assert.deepEqual(progress.steps.map(step => step.statusText), [
    '已完成',
    '已完成',
    '执行中',
    '等待中',
    '等待中',
    '等待中',
    '等待中',
    '等待中',
    '等待中'
  ])
})
