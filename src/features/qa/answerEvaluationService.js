import {
  createDemoLlmResult,
  normalizeAnswerExcerpt
} from './answerEvaluationModel.js'

function normalizeContext(context = {}) {
  return {
    question: String(context.question ?? '').trim(),
    answerText: String(context.answerText ?? '').trim(),
    citationIds: Array.isArray(context.citationIds) ? [...context.citationIds] : []
  }
}

function wait(delay) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(delay) || 0)))
}

export function buildManualEvaluationPayload(context, manual = {}) {
  const normalized = normalizeContext(context)
  return {
    question: normalized.question,
    final_answer: normalized.answerText,
    citation_ids: normalized.citationIds,
    verdict: manual.verdict ?? null,
    selected_excerpt: normalizeAnswerExcerpt(manual.selectedExcerpt),
    error_types: Array.isArray(manual.issueTypes) ? [...manual.issueTypes] : [],
    comments: String(manual.comment ?? '').trim()
  }
}

export function buildLlmEvaluationPayload(context) {
  const normalized = normalizeContext(context)
  return {
    question: normalized.question,
    final_answer: normalized.answerText,
    qa_result: {
      answer: normalized.answerText,
      citation_ids: normalized.citationIds
    }
  }
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

export function createAnswerEvaluationService({ mode = 'demo', delay = 320, api = {} } = {}) {
  if (mode === 'api') {
    return {
      saveManual(context, manual) {
        if (typeof api.submitQAFeedback !== 'function') {
          return Promise.reject(new Error('人工评估接口尚未配置'))
        }
        return api.submitQAFeedback(buildManualEvaluationPayload(context, manual))
      },
      runLlm(context) {
        if (typeof api.judgeQAWithLLM !== 'function') {
          return Promise.reject(new Error('LLM 评估接口尚未配置'))
        }
        return api.judgeQAWithLLM(buildLlmEvaluationPayload(context))
      },
      saveLlm(context, result) {
        if (typeof api.submitQAFeedback !== 'function') {
          return Promise.reject(new Error('LLM 评估保存接口尚未配置'))
        }
        return api.submitQAFeedback({
          ...buildLlmEvaluationPayload(context),
          evaluation_source: 'llm',
          llm_evaluation: result
        })
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
