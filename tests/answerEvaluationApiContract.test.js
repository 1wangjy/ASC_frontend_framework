import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptLlmEvaluationResponse,
  buildLlmEvaluationPayload,
  buildLlmFeedbackPayload,
  buildManualEvaluationPayload
} from '../src/features/qa/answerEvaluationService.js'

const context = {
  question: '热震稳定性如何？',
  answerText: '回答正文',
  citationIds: ['R1'],
  qaRunId: 'qarun_1',
  qaResult: { qa_run_id: 'qarun_1', final_answer: '回答正文' }
}

test('builds a backend-valid manual feedback payload with required scores', () => {
  const payload = buildManualEvaluationPayload(context, {
    verdict: 'inaccurate',
    selectedExcerpt: '问题片段',
    issueTypes: ['evidence', 'reasoning'],
    comment: '证据不足'
  })

  assert.equal(payload.qa_run_id, 'qarun_1')
  assert.deepEqual(payload.scores, {
    correctness: 2,
    evidence_grounding: 2,
    domain_relevance: 2,
    overall_quality: 2
  })
  assert.deepEqual(payload.error_types, ['evidence_gap', 'reasoning_error'])
  assert.deepEqual(payload.annotations, [{
    selected_text: '问题片段',
    error_type: 'evidence_gap',
    comment: '证据不足'
  }])
  assert.equal(payload.qa_result.qa_run_id, 'qarun_1')
})

test('includes the real qa run and raw result in the LLM judge request', () => {
  const payload = buildLlmEvaluationPayload(context)
  assert.equal(payload.qa_run_id, 'qarun_1')
  assert.equal(payload.qa_result.final_answer, '回答正文')
  assert.equal(payload.final_answer, '回答正文')
})

test('adapts the backend judge envelope for the evaluation panel', () => {
  const adapted = adaptLlmEvaluationResponse({
    success: true,
    data: {
      model: 'deepseek-v4',
      method: 'llm_as_judge_qa_quality',
      overall_score: 4.25,
      confidence: 0.8,
      scores: {
        correctness: 4,
        evidence_grounding: 5,
        domain_relevance: 4,
        overall_quality: 4
      },
      error_types: ['evidence_gap'],
      correction_suggestions: '补充实验条件。明确温度范围。',
      rationale: '回答整体可靠。'
    }
  })

  assert.equal(adapted.isDemo, false)
  assert.equal(adapted.summary, '回答整体可靠。')
  assert.match(adapted.confidenceLabel, /4.25\/5/)
  assert.equal(adapted.dimensions.length, 4)
  assert.deepEqual(adapted.risks, ['证据不足'])
  assert.deepEqual(adapted.suggestions, ['补充实验条件', '明确温度范围'])
})

test('turns an adapted judge result into valid feedback scores', () => {
  const result = adaptLlmEvaluationResponse({ data: {
    scores: { correctness: 4, evidence_grounding: 5, domain_relevance: 4, overall_quality: 4 },
    overall_score: 4.25,
    error_types: [],
    comments: '可靠'
  } })
  const payload = buildLlmFeedbackPayload(context, result)

  assert.deepEqual(payload.scores, result.raw.scores)
  assert.equal(payload.verdict, 'accurate')
  assert.equal(payload.qa_run_id, 'qarun_1')
})
