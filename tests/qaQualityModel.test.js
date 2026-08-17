import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildQaQualitySnapshot,
  hasQaQualityData
} from '../src/features/qa/qaQualityModel.js'

test('maps only real backend answer and reasoning quality fields', () => {
  const snapshot = buildQaQualitySnapshot({
    qa_quantitative_metrics: {
      confidence_score: 0.91,
      relevance_score: 0.88,
      accuracy_estimate: 0.86,
      llms_as_judge_score: 0.83,
      evidence_strength_score: 0.82,
      ontology_alignment_score: 0.77,
      path_validity_score: 0.84,
      condition_completeness_score: 0.69,
      evidence_coverage_score: 0.8,
      risk_control_score: 0.73,
      exploration_value_score: 0.71
    },
    reasoning_route: {
      selected_mode: 'tot',
      structural_score: 0.75,
      semantic_score: 0.66,
      fused_score: 0.72,
      confidence: 0.89,
      structural_metrics: {
        mechanism_coverage_score: 0.81,
        path_evidence_alignment_score: 0.79,
        reasoning_readiness_score: 0.76,
        cot_suitability_score: 0.42,
        tot_suitability_score: 0.87,
        max_path_length: 4
      }
    }
  })

  assert.deepEqual(snapshot.answerMetrics.map(item => [item.key, item.value]), [
    ['confidence_score', 0.91],
    ['relevance_score', 0.88],
    ['accuracy_estimate', 0.86],
    ['llms_as_judge_score', 0.83],
    ['path_validity_score', 0.84],
    ['evidence_strength_score', 0.82],
    ['condition_completeness_score', 0.69],
    ['evidence_coverage_score', 0.8],
    ['ontology_alignment_score', 0.77],
    ['risk_control_score', 0.73],
    ['exploration_value_score', 0.71]
  ])
  assert.deepEqual(snapshot.reasoningMetrics.map(item => [item.key, item.value]), [
    ['structural_score', 0.75],
    ['semantic_score', 0.66],
    ['mechanism_coverage_score', 0.81],
    ['path_evidence_alignment_score', 0.79],
    ['reasoning_readiness_score', 0.76]
  ])
  assert.deepEqual(snapshot.routingMetrics.map(item => [item.key, item.value]), [
    ['fused_score', 0.72],
    ['confidence', 0.89],
    ['cot_suitability_score', 0.42],
    ['tot_suitability_score', 0.87]
  ])
  assert.equal(snapshot.reasoningMode, 'ToT')
  assert.equal(snapshot.reasoningDepth, 4)
  assert.equal(snapshot.answerRadar.axes.length, 8)
  assert.deepEqual(snapshot.answerRadar.axes.map(item => item.shortLabel), [
    '可信',
    '相关',
    '准确',
    '路径',
    '证据',
    '条件',
    '本体',
    '风险'
  ])
  assert.deepEqual(snapshot.answerDomainGroups.map(item => [item.key, Number(item.value.toFixed(4))]), [
    ['reliability', 0.87],
    ['evidence', 0.7875],
    ['ontology', 0.7667],
    ['risk', 0.72]
  ])
  assert.equal(snapshot.answerAcademicBand.band, 'strong')
  assert.equal(snapshot.answerAcademicBand.label, 'Robust evidence band')
  assert.equal(Number(snapshot.answerAcademicBand.value.toFixed(4)), 0.7967)
  assert.equal(snapshot.reasoningRadar.axes.length, 5)
  assert.equal(hasQaQualityData(snapshot), true)
})

test('does not invent missing or invalid metrics', () => {
  const snapshot = buildQaQualitySnapshot({
    qa_quantitative_metrics: {
      confidence_score: null,
      evidence_strength_score: 'not-a-score',
      path_validity_score: 0
    },
    debug_trace: {
      adaptive_reasoning: {
        structural_metrics: { max_path_length: 0 }
      }
    }
  })

  assert.deepEqual(snapshot.answerMetrics.map(item => item.key), ['path_validity_score'])
  assert.deepEqual(snapshot.reasoningMetrics, [])
  assert.deepEqual(snapshot.routingMetrics, [])
  assert.equal(snapshot.reasoningDepth, 0)
  assert.equal(snapshot.answerRadar.axes.length, 0)
  assert.equal(snapshot.reasoningRadar.axes.length, 0)
  assert.equal(hasQaQualityData(snapshot), true)
})

test('reports no quality module when the backend returned no real metric fields', () => {
  const snapshot = buildQaQualitySnapshot({
    qa_quantitative_metrics: {},
    reasoning_route: {
      selected_mode: 'cot',
      reason: 'route text is not a quality metric'
    }
  })

  assert.deepEqual(snapshot.answerMetrics, [])
  assert.deepEqual(snapshot.reasoningMetrics, [])
  assert.deepEqual(snapshot.routingMetrics, [])
  assert.equal(snapshot.reasoningDepth, null)
  assert.equal(hasQaQualityData(snapshot), false)
})
