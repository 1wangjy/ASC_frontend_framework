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
