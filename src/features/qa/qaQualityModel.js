const ANSWER_METRICS = [
  ['confidence_score', '置信度'],
  ['relevance_score', '问题相关性'],
  ['accuracy_estimate', '准确性估计'],
  ['llms_as_judge_score', 'LLM Judge 评分'],
  ['path_validity_score', '路径有效性'],
  ['evidence_strength_score', '证据强度'],
  ['condition_completeness_score', '条件完整性'],
  ['evidence_coverage_score', '证据覆盖'],
  ['ontology_alignment_score', '本体一致性'],
  ['risk_control_score', '风险控制'],
  ['exploration_value_score', '探索价值']
]

const ANSWER_RADAR_KEYS = new Set([
  'confidence_score',
  'relevance_score',
  'accuracy_estimate',
  'path_validity_score',
  'evidence_strength_score',
  'condition_completeness_score',
  'ontology_alignment_score',
  'risk_control_score'
])

const ANSWER_SHORT_LABELS = {
  confidence_score: '可信',
  relevance_score: '相关',
  accuracy_estimate: '准确',
  path_validity_score: '路径',
  evidence_strength_score: '证据',
  condition_completeness_score: '条件',
  ontology_alignment_score: '本体',
  risk_control_score: '风险'
}

const ANSWER_DOMAIN_DEFINITIONS = [
  {
    key: 'reliability',
    label: 'Reliability / 回答可信性',
    metricKeys: ['confidence_score', 'accuracy_estimate', 'relevance_score', 'llms_as_judge_score']
  },
  {
    key: 'evidence',
    label: 'Evidence Maturity / 证据成熟度',
    metricKeys: ['path_validity_score', 'evidence_strength_score', 'condition_completeness_score', 'evidence_coverage_score']
  },
  {
    key: 'ontology',
    label: 'Ontology Alignment / 本体一致性',
    metricKeys: ['ontology_alignment_score', 'path_validity_score', 'condition_completeness_score']
  },
  {
    key: 'risk',
    label: 'Risk & Discovery / 风险与探索',
    metricKeys: ['risk_control_score', 'exploration_value_score']
  }
]

const ANSWER_ACADEMIC_KEYS = [
  'confidence_score',
  'accuracy_estimate',
  'evidence_strength_score',
  'condition_completeness_score',
  'ontology_alignment_score',
  'risk_control_score'
]

function finite(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value)
    if (number !== null) return number
  }
  return null
}

function metric(key, label, value) {
  const normalized = finite(value)
  return normalized === null ? null : { key, label, value: normalized }
}

function metricsFrom(definitions, source) {
  return definitions.flatMap(([key, label]) => {
    const item = metric(key, label, source?.[key])
    return item ? [item] : []
  })
}

function averageMetric(metricMap, keys) {
  const values = keys
    .map(key => metricMap.get(key)?.value)
    .filter(value => Number.isFinite(value))
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function metricBand(value) {
  if (value === null) return null
  if (value >= 0.88) return { band: 'excellent', label: 'High-confidence evidence band' }
  if (value >= 0.75) return { band: 'strong', label: 'Robust evidence band' }
  if (value >= 0.6) return { band: 'moderate', label: 'Moderate evidence band' }
  return { band: 'weak', label: 'Evidence gap band' }
}

function buildAnswerMetricProfile(answerMetrics) {
  const metricMap = new Map(answerMetrics.map(item => [item.key, item]))
  const answerDomainGroups = ANSWER_DOMAIN_DEFINITIONS.flatMap(definition => {
    const value = averageMetric(metricMap, definition.metricKeys)
    return value === null ? [] : [{ ...definition, value }]
  })
  const academicValue = averageMetric(metricMap, ANSWER_ACADEMIC_KEYS)
  const academicBand = metricBand(academicValue)

  return {
    answerDomainGroups,
    answerAcademicBand: academicBand
      ? { value: academicValue, ...academicBand }
      : null
  }
}

function coordinate(index, count, value, radius) {
  const angle = Math.PI * 2 * index / count - Math.PI / 2
  return {
    x: Number((110 + Math.cos(angle) * radius * value).toFixed(2)),
    y: Number((110 + Math.sin(angle) * radius * value).toFixed(2))
  }
}

export function buildQaRadar(metrics = []) {
  if (!Array.isArray(metrics) || metrics.length < 3) {
    return { axes: [], rings: [], polygon: '' }
  }

  const count = metrics.length
  const axes = metrics.map((item, index) => ({
    ...item,
    ...coordinate(index, count, Math.max(0, Math.min(1, item.value)), 70),
    axis: coordinate(index, count, 1, 70),
    labelPoint: coordinate(index, count, 1, 91)
  }))
  const rings = [0.25, 0.5, 0.75, 1].map(level => ({
    level,
    points: metrics.map((_, index) => {
      const point = coordinate(index, count, level, 70)
      return `${point.x},${point.y}`
    }).join(' ')
  }))

  return {
    axes,
    rings,
    polygon: axes.map(item => `${item.x},${item.y}`).join(' ')
  }
}

export function buildQaQualitySnapshot(result = {}) {
  const answerMetrics = metricsFrom(ANSWER_METRICS, result?.qa_quantitative_metrics).map(item => ({
    ...item,
    shortLabel: ANSWER_SHORT_LABELS[item.key] || item.label,
    band: metricBand(item.value)?.band || 'weak'
  }))
  const answerProfile = buildAnswerMetricProfile(answerMetrics)
  const route = result?.reasoning_route || result?.debug_trace?.adaptive_reasoning || {}
  const structural = route?.structural_metrics || {}
  const semantic = route?.semantic_assessment || {}
  const normalized = structural?.normalized_components || {}
  const reasoningMetrics = [
    metric('structural_score', '结构复杂度', firstFinite(route.structural_score, structural.structural_complexity_score)),
    metric('semantic_score', '语义复杂度', firstFinite(route.semantic_score, semantic.semantic_complexity_score)),
    metric('mechanism_coverage_score', '机制覆盖度', firstFinite(structural.mechanism_coverage_score, normalized.mechanism_coverage)),
    metric('path_evidence_alignment_score', '路径-证据对齐', firstFinite(structural.path_evidence_alignment_score, normalized.path_evidence_alignment)),
    metric('reasoning_readiness_score', '推理就绪度', firstFinite(structural.reasoning_readiness_score, normalized.reasoning_readiness))
  ].filter(Boolean)
  const routingMetrics = [
    metric('fused_score', '综合路由分', route.fused_score),
    metric('confidence', '路由置信度', route.confidence),
    metric('route_diversity_score', '路线多样性', firstFinite(structural.route_diversity_score, normalized.route_diversity)),
    metric('semantic_layer_coverage_score', '语义层覆盖', firstFinite(structural.semantic_layer_coverage_score, normalized.semantic_layer_coverage)),
    metric('mechanism_bridge_score', '机制桥接', firstFinite(structural.mechanism_bridge_score, normalized.mechanism_bridge)),
    metric('answer_gain_potential_score', '答案增益潜力', firstFinite(structural.answer_gain_potential_score, normalized.answer_gain_potential)),
    metric('cot_suitability_score', 'CoT 适配度', firstFinite(structural.cot_suitability_score, normalized.cot_suitability)),
    metric('tot_suitability_score', 'ToT 适配度', firstFinite(structural.tot_suitability_score, normalized.tot_suitability))
  ].filter(Boolean)
  const selectedMode = String(route?.selected_mode || '').trim().toLowerCase()
  const answerRadarMetrics = answerMetrics.filter(item => ANSWER_RADAR_KEYS.has(item.key))

  return {
    answerMetrics,
    ...answerProfile,
    reasoningMetrics,
    routingMetrics,
    answerRadar: buildQaRadar(answerRadarMetrics),
    reasoningRadar: buildQaRadar(reasoningMetrics),
    reasoningMode: selectedMode === 'tot' ? 'ToT' : (selectedMode === 'cot' ? 'CoT' : ''),
    reasoningDepth: finite(structural.max_path_length)
  }
}

export function hasQaQualityData(value = {}) {
  const snapshot = Array.isArray(value?.answerMetrics)
    ? value
    : buildQaQualitySnapshot(value)
  return Boolean(
    snapshot.answerMetrics?.length
    || snapshot.reasoningMetrics?.length
    || snapshot.routingMetrics?.length
    || snapshot.reasoningDepth !== null
  )
}

export function formatQaMetric(value) {
  const number = finite(value)
  return number === null ? '' : `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`
}

export function formatQaMetricPrecise(value) {
  const number = finite(value)
  return number === null ? '' : `${(Math.max(0, Math.min(1, number)) * 100).toFixed(2)}%`
}
