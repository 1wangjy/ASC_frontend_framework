import {
  createDemoLlmResult,
  normalizeAnswerExcerpt
} from './answerEvaluationModel.js'

function normalizeContext(context = {}) {
  return {
    question: String(context.question ?? '').trim(),
    answerText: String(context.answerText ?? '').trim(),
    citationIds: Array.isArray(context.citationIds) ? [...context.citationIds] : [],
    qaRunId: String(context.qaRunId ?? '').trim(),
    qaResult: context.qaResult && typeof context.qaResult === 'object' ? context.qaResult : {}
  }
}

const ISSUE_TYPE_MAP = {
  retrieval: 'retrieval_failure',
  knowledge: 'knowledge_gap',
  reasoning: 'reasoning_error',
  evidence: 'evidence_gap',
  unsupported: 'hallucination',
  incomplete: 'incomplete_answer',
  domain: 'domain_mismatch'
}

const ERROR_TYPE_LABELS = {
  retrieval_failure: '检索失败',
  knowledge_gap: '知识缺失',
  reasoning_error: '推理错误',
  evidence_gap: '证据不足',
  hallucination: '无依据断言',
  incomplete_answer: '回答不完整',
  domain_mismatch: '领域不匹配',
  prompt_or_style_issue: '表达策略问题'
}

function scoreSet(value) {
  return {
    correctness: value,
    evidence_grounding: value,
    domain_relevance: value,
    overall_quality: value
  }
}

function qaResultOf(context) {
  const result = {
    ...context.qaResult,
    question: context.question,
    final_answer: context.answerText,
    answer: context.answerText,
    citation_ids: context.citationIds
  }
  const qaRunId = context.qaRunId || context.qaResult.qa_run_id
  if (qaRunId) result.qa_run_id = qaRunId
  return result
}

function wait(delay) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(delay) || 0)))
}

export function buildManualEvaluationPayload(context, manual = {}) {
  const normalized = normalizeContext(context)
  const errorTypes = Array.isArray(manual.issueTypes)
    ? manual.issueTypes.map((type) => ISSUE_TYPE_MAP[type] || type).filter(Boolean)
    : []
  const selectedExcerpt = normalizeAnswerExcerpt(manual.selectedExcerpt)
  const comment = String(manual.comment ?? '').trim()
  const verdict = manual.verdict ?? ''

  const payload = {
    question: normalized.question,
    final_answer: normalized.answerText,
    qa_result: qaResultOf(normalized),
    scores: scoreSet(verdict === 'accurate' ? 5 : 2),
    verdict,
    error_types: errorTypes,
    correction_suggestions: verdict === 'inaccurate' ? comment : '',
    comments: comment,
    annotations: selectedExcerpt ? [{
      selected_text: selectedExcerpt,
      error_type: errorTypes[0] || '',
      comment
    }] : [],
    answer_sources: normalized.citationIds.map((referenceId) => ({ reference_id: referenceId }))
  }
  if (normalized.qaRunId) payload.qa_run_id = normalized.qaRunId
  return payload
}

export function buildLlmEvaluationPayload(context) {
  const normalized = normalizeContext(context)
  const payload = {
    question: normalized.question,
    final_answer: normalized.answerText,
    qa_result: qaResultOf(normalized)
  }
  if (normalized.qaRunId) payload.qa_run_id = normalized.qaRunId
  return payload
}

function responseData(payload) {
  if (payload?.scores || payload?.overall_score !== undefined) return payload
  if (payload?.data?.scores || payload?.data?.overall_score !== undefined) return payload.data
  if (payload?.data?.data?.scores || payload?.data?.data?.overall_score !== undefined) return payload.data.data
  return {}
}

function decodeSuggestionText(value) {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\([\\'\"])/g, '$1')
    .trim()
}

function normalizeSuggestionItem(value) {
  return decodeSuggestionText(value)
    .replace(/^\d+\s*[.、]\s*/, '')
    .trim()
}

function parseSerializedSuggestionList(value) {
  const source = String(value ?? '').trim()
  if (!source.startsWith('[') || !source.endsWith(']')) return null

  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // The current backend can return a Python-style single-quoted list string.
  }

  const items = []
  let index = 1
  const end = source.length - 1
  const skipSeparators = () => {
    while (index < end && /[\s,]/.test(source[index])) index += 1
  }

  skipSeparators()
  while (index < end) {
    const quote = source[index]
    if (quote !== "'" && quote !== '"') return null
    index += 1

    let item = ''
    let closed = false
    while (index < end) {
      const character = source[index]
      if (character === '\\') {
        const escaped = source[index + 1]
        const replacements = { n: '\n', r: '', t: ' ', '\\': '\\', "'": "'", '"': '"' }
        item += Object.prototype.hasOwnProperty.call(replacements, escaped)
          ? replacements[escaped]
          : escaped
        index += 2
        continue
      }
      if (character === quote) {
        closed = true
        index += 1
        break
      }
      item += character
      index += 1
    }
    if (!closed) return null
    items.push(item)
    skipSeparators()
  }

  return items.length ? items : null
}

function suggestionsOf(value) {
  const candidates = Array.isArray(value)
    ? value
    : parseSerializedSuggestionList(value)

  if (candidates) {
    return candidates
      .map(normalizeSuggestionItem)
      .filter(Boolean)
  }

  const text = decodeSuggestionText(value)
  const numberedItems = text.split(/(?:^|\n)\s*(?=\d+\s*[.、]\s*)/).filter(Boolean)
  const items = numberedItems.length > 1
    ? numberedItems
    : text.split(/[。；;\n]+/)

  return items
    .map(normalizeSuggestionItem)
    .filter(Boolean)
}

function evaluationSource(result) {
  const fallbackUsed = result?.trace?.fallback_used === true
    || String(result?.status ?? '').toLowerCase() === 'heuristic'
    || /heuristic|fallback/i.test(`${result?.method ?? ''} ${result?.written_by ?? ''}`)
  if (fallbackUsed) {
    return {
      sourceKind: 'heuristic',
      sourceLabel: '规则兜底评估',
      sourceDescription: '当前结果来自后端规则兜底，未调用大模型。'
    }
  }

  const llmApplied = String(result?.status ?? '').toLowerCase() === 'applied'
    || /llm/i.test(`${result?.method ?? ''} ${result?.written_by ?? ''}`)
    || Boolean(String(result?.model ?? '').trim())
  if (llmApplied) {
    return {
      sourceKind: 'llm',
      sourceLabel: '真实 LLM 评估',
      sourceDescription: '当前结果由后端 LLM Judge 生成。'
    }
  }

  return {
    sourceKind: 'backend',
    sourceLabel: '后端评估',
    sourceDescription: '后端未返回可识别的评估来源标识。'
  }
}

export function adaptLlmEvaluationResponse(payload = {}) {
  const result = responseData(payload)
  const source = evaluationSource(result)
  const scores = result.scores && typeof result.scores === 'object' ? result.scores : {}
  const overallScore = Number(result.overall_score)
  const confidence = Number(result.confidence)
  const scoreLabel = Number.isFinite(overallScore) ? `${overallScore}/5` : '评分未知'
  const confidenceLabel = Number.isFinite(confidence) ? ` · 置信度 ${Math.round(confidence * 100)}%` : ''
  const dimensions = [
    ['correctness', '回答正确性'],
    ['evidence_grounding', '证据支撑'],
    ['domain_relevance', '领域相关性'],
    ['overall_quality', '整体质量']
  ].map(([key, label]) => ({ label, result: scores[key] !== undefined ? `${scores[key]}/5` : '未评分' }))

  return {
    isDemo: false,
    ...source,
    autoRecorded: Boolean(result?.storage?.judge_record_id),
    judgeRecordId: String(result?.storage?.judge_record_id || result?.judge_id || ''),
    summary: String(result.rationale || result.comments || '后端已完成 LLM 评估。'),
    confidenceLabel: `总体评分 ${scoreLabel}${confidenceLabel}`,
    model: String(result.model || result.written_by || 'Backend LLM Judge'),
    version: String(result.method || result.status || 'api'),
    evaluatedAt: new Date().toISOString(),
    dimensions,
    risks: (Array.isArray(result.error_types) ? result.error_types : [])
      .map((type) => ERROR_TYPE_LABELS[type] || String(type)),
    suggestions: suggestionsOf(result.correction_suggestions),
    raw: result
  }
}

export function buildLlmFeedbackPayload(context, adaptedResult = {}) {
  const normalized = normalizeContext(context)
  const raw = adaptedResult.raw && typeof adaptedResult.raw === 'object' ? adaptedResult.raw : {}
  const overallScore = Number(raw.overall_score)

  const payload = {
    question: normalized.question,
    final_answer: normalized.answerText,
    qa_result: qaResultOf(normalized),
    scores: raw.scores || scoreSet(3),
    verdict: Number.isFinite(overallScore) && overallScore >= 3.5 ? 'accurate' : 'inaccurate',
    error_types: Array.isArray(raw.error_types) ? raw.error_types : [],
    correction_suggestions: String(raw.correction_suggestions ?? ''),
    comments: String(raw.comments || raw.rationale || ''),
    metadata: {
      evaluation_source: 'llm',
      source_kind: adaptedResult.sourceKind || 'backend',
      judge_id: raw?.storage?.judge_record_id || raw.judge_id || ''
    }
  }
  if (normalized.qaRunId) payload.qa_run_id = normalized.qaRunId
  return payload
}

export function getAnswerEvaluationErrorMessage(error) {
  const message = String(error?.message ?? '').trim()
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return '评估等待时间过长，请重新尝试'
  }
  if (/status code 5\d\d|service unavailable|network error/i.test(message)) {
    return '评估服务暂时不可用，请稍后重试'
  }
  return message || '评估未能完成，请重新尝试'
}

export function createAnswerEvaluationService({ mode = 'api', delay = 320, api = {} } = {}) {
  if (mode === 'api') {
    return {
      saveManual(context, manual) {
        if (typeof api.submitQAFeedback !== 'function') {
          return Promise.reject(new Error('人工评估接口尚未配置'))
        }
        return api.submitQAFeedback(buildManualEvaluationPayload(context, manual))
      },
      async runLlm(context) {
        if (typeof api.judgeQAWithLLM !== 'function') {
          throw new Error('LLM 评估接口尚未配置')
        }
        const response = await api.judgeQAWithLLM(buildLlmEvaluationPayload(context))
        return adaptLlmEvaluationResponse(response)
      },
      saveLlm(context, result) {
        if (typeof api.submitQAFeedback !== 'function') {
          return Promise.reject(new Error('LLM 评估保存接口尚未配置'))
        }
        return api.submitQAFeedback(buildLlmFeedbackPayload(context, result))
      }
    }
  }

  return {
    async saveManual() {
      await wait(delay)
      return { success: true, mode: 'demo' }
    },
    async runLlm() {
      await wait(delay)
      return createDemoLlmResult()
    },
    async saveLlm() {
      await wait(delay)
      return { success: true, mode: 'demo' }
    }
  }
}
