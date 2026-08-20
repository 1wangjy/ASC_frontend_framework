import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptLlmEvaluationResponse,
  buildLlmEvaluationPayload,
  buildLlmFeedbackPayload,
  buildManualEvaluationPayload,
  createAnswerEvaluationService
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

test('keeps each serialized backend review item together without leaking list syntax', () => {
  const adapted = adaptLlmEvaluationResponse({
    success: true,
    data: {
      status: 'applied',
      method: 'llm_as_judge_qa_quality',
      overall_score: 3.4,
      correction_suggestions: "['1. 问题：缺少评价指标\\n修正：补充保持率计算\\n预期证据：引用实验数据', '2. 问题：条件窗口不清楚\\n修正：明确测试温度\\n预期证据：引用测试标准']"
    }
  })

  assert.deepEqual(adapted.suggestions, [
    '问题：缺少评价指标\n修正：补充保持率计算\n预期证据：引用实验数据',
    '问题：条件窗口不清楚\n修正：明确测试温度\n预期证据：引用测试标准'
  ])
  assert.doesNotMatch(adapted.suggestions.join('\n'), /\['|', '|\\n/)
})

test('identifies real LLM and heuristic fallback evaluation sources', () => {
  const applied = adaptLlmEvaluationResponse({ data: {
    status: 'applied',
    method: 'llm_as_judge_qa_quality',
    model: 'deepseek/deepseek-v4-flash',
    overall_score: 4.1,
    trace: { fallback_used: false },
    storage: { judge_record_id: 'judge_record_1' }
  } })
  const fallback = adaptLlmEvaluationResponse({ data: {
    status: 'heuristic',
    method: 'heuristic_qa_quality_judge',
    written_by: 'LLM as Judge (heuristic fallback)',
    overall_score: 3.2,
    trace: { fallback_used: true }
  } })

  assert.equal(applied.sourceKind, 'llm')
  assert.equal(applied.sourceLabel, '真实 LLM 评估')
  assert.equal(applied.autoRecorded, true)
  assert.equal(applied.judgeRecordId, 'judge_record_1')
  assert.equal(fallback.sourceKind, 'heuristic')
  assert.equal(fallback.sourceLabel, '规则兜底评估')
  assert.match(fallback.sourceDescription, /未调用大模型/)
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

test('links an explicitly saved feedback record to the already stored judge record', () => {
  const result = adaptLlmEvaluationResponse({ data: {
    status: 'applied',
    scores: { correctness: 4, evidence_grounding: 4, domain_relevance: 4, overall_quality: 4 },
    overall_score: 4,
    storage: { judge_record_id: 'judge_record_2' }
  } })

  const payload = buildLlmFeedbackPayload(context, result)
  assert.equal(payload.metadata.evaluation_source, 'llm')
  assert.equal(payload.metadata.judge_id, 'judge_record_2')
  assert.equal(payload.metadata.source_kind, 'llm')
})

test('does not silently use demo evaluation unless demo mode is explicit', async () => {
  const service = createAnswerEvaluationService()
  await assert.rejects(
    service.runLlm(context),
    /LLM 评估接口尚未配置/
  )
})
