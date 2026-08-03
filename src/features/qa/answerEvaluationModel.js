export const manualIssueOptions = Object.freeze([
  { id: 'retrieval', label: '检索失败' },
  { id: 'knowledge', label: '知识缺失' },
  { id: 'reasoning', label: '推理错误' },
  { id: 'evidence', label: '证据不足' },
  { id: 'unsupported', label: '无依据断言' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'domain', label: '领域不匹配' }
])

const validVerdicts = new Set(['accurate', 'inaccurate'])
const validIssueIds = new Set(manualIssueOptions.map(option => option.id))

export function createAnswerEvaluationState() {
  return {
    mode: 'manual',
    manual: {
      verdict: null,
      selectedExcerpt: '',
      issueTypes: [],
      comment: '',
      saveStatus: 'idle',
      errorMessage: ''
    },
    llm: {
      runStatus: 'idle',
      result: null,
      errorMessage: '',
      saveStatus: 'idle',
      saveErrorMessage: ''
    }
  }
}

export function normalizeAnswerExcerpt(value, maxLength = 500) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  const safeLimit = Number.isFinite(maxLength) && maxLength >= 0 ? maxLength : 500
  return normalized.slice(0, safeLimit)
}

export function patchAnswerEvaluation(state, patch = {}) {
  if (!state || !patch || typeof patch !== 'object') return state

  return {
    ...state,
    ...patch,
    manual: patch.manual ? { ...state.manual, ...patch.manual } : state.manual,
    llm: patch.llm ? { ...state.llm, ...patch.llm } : state.llm
  }
}

export function setManualVerdict(state, verdict) {
  if (!state || !validVerdicts.has(verdict)) return state

  const diagnosis = verdict === 'accurate'
    ? { selectedExcerpt: '', issueTypes: [], comment: '' }
    : {}

  return patchAnswerEvaluation(state, {
    manual: {
      ...diagnosis,
      verdict,
      saveStatus: 'idle',
      errorMessage: ''
    }
  })
}

export function toggleManualIssue(state, issueId) {
  if (!state || !validIssueIds.has(issueId)) return state

  const issueTypes = state.manual.issueTypes.includes(issueId)
    ? state.manual.issueTypes.filter(id => id !== issueId)
    : [...state.manual.issueTypes, issueId]

  return patchAnswerEvaluation(state, {
    manual: { issueTypes, saveStatus: 'idle', errorMessage: '' }
  })
}

export function createDemoLlmResult() {
  return {
    isDemo: true,
    summary: '演示评估：回答总体与引用证据一致，但部分结论仍可补充适用条件。',
    confidenceLabel: '总体可信，建议补充边界条件',
    model: 'ASC Evaluation Demo',
    version: 'V1.0',
    evaluatedAt: new Date().toISOString(),
    dimensions: [
      { label: '证据一致性', result: '良好' },
      { label: '回答完整性', result: '需补充' },
      { label: '表述严谨性', result: '良好' }
    ],
    risks: [
      '提升策略未明确限定材料配比与服役温度范围。',
      '部分建议需要实验数据进一步验证。'
    ],
    suggestions: [
      '补充不同温度区间下的适用边界。',
      '将残余强度保持率作为验证指标写入结论。'
    ]
  }
}
