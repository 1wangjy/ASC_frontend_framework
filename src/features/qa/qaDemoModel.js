import {
  createAnswerEvaluationState,
  patchAnswerEvaluation
} from './answerEvaluationModel.js'

export const domesticModelOptions = Object.freeze([
  'DeepSeek · V4 Flash',
  'DeepSeek · V4 Pro',
  '通义千问 · Qwen 3.7 Plus',
  '通义千问 · Qwen 3.7 Max',
  'ASC Local · V1.0'
])

export const frameworkOptions = Object.freeze(['Hybrid RAG', 'NEXUS'])
export const reasoningOptions = Object.freeze(['Auto', 'CoT', 'ToT'])
export const PREVIEW_QUESTION = '为什么 SiC 含量会影响 ASC 耐火材料的抗氧化性能？'

const defaultSettings = Object.freeze({
  model: domesticModelOptions[0],
  framework: 'NEXUS',
  reasoning: 'Auto',
  ontologyEnabled: true,
  ontologyLocked: true
})

export const qaModeOptions = Object.freeze([
  { id: 'single', label: '单轮深度' },
  { id: 'multi', label: '多轮连续' }
])

const references = Object.freeze([
  {
    id: 'R1',
    title: 'Al₂O₃-SiC-C 复合耐火材料的热震行为研究',
    authors: '王某等',
    source: '耐火材料',
    year: 2019,
    locator: '53(4): 321–328',
    excerpt: '适量 SiC 与连续碳相能够降低热膨胀失配，并延缓裂纹扩展。'
  },
  {
    id: 'R2',
    title: '气孔结构对 Al₂O₃-SiC-C 材料热震稳定性的影响',
    authors: '李某等',
    source: '复合材料学报',
    year: 2021,
    locator: '38(6): 2082–2090',
    excerpt: '闭口气孔与较窄孔径分布有助于分散热应力集中。'
  },
  {
    id: 'R3',
    title: '碳相形态与分布对 SiC 基耐火材料热震性能的作用',
    authors: '张某等',
    source: '无机材料学报',
    year: 2020,
    locator: '35(9): 947–955',
    excerpt: '均匀碳网络能改善界面韧化效果并提高残余强度保持率。'
  }
])

const answer = Object.freeze({
  summary: 'ASC Al₂O₃-SiC-C 材料体系在高温服役环境下通常具有较好的热震稳定性，关键取决于组成协同、气孔结构、碳相连续性与界面结合。',
  citationIds: ['R1', 'R2', 'R3'],
  sections: [
    {
      title: '组成与含量',
      body: 'Al₂O₃ 提供高温骨架，SiC 兼具高导热与高温强度，碳相承担抗热冲击和裂纹偏转作用。适量 SiC 有助于降低温度梯度。',
      citations: ['R1']
    },
    {
      title: '气孔结构',
      body: '闭口气孔能够缓冲局部热应力；开口气孔过多则会削弱强度并加速氧化。控制总气孔率与孔径分布比单纯追求低气孔率更重要。',
      citations: ['R2']
    },
    {
      title: '碳相形态与分布',
      body: '均匀分布的沥青碳或树脂碳可改善界面韧化，并在氧化环境下形成保护层，降低热震损伤速率。',
      citations: ['R3']
    },
    {
      title: '提升策略',
      body: '建议联合优化 Al₂O₃/SiC/C 比例、细颗粒级配、抗氧化剂体系和低温结合强度，并通过残余强度保持率验证方案。',
      citations: ['R1', 'R2', 'R3']
    }
  ],
  researchPath: ['文献检索', '条件过滤', '证据提取', '本体对齐', '回答生成']
})

export function createQaState() {
  return {
    mode: 'single',
    phase: 'empty',
    question: '',
    qaRunId: '',
    qaResult: null,
    answerSource: null,
    errorMessage: '',
    answer: null,
    answerDetails: [],
    references: [],
    evidenceOpen: false,
    selectedCitationId: null,
    evaluation: createAnswerEvaluationState(),
    settings: { ...defaultSettings }
  }
}

export function selectQaMode(state, mode) {
  if (!state || !qaModeOptions.some(option => option.id === mode)) return state

  const singleTurn = mode === 'single'
  return {
    ...state,
    mode,
    settings: {
      ...state.settings,
      framework: singleTurn ? 'NEXUS' : 'Hybrid RAG',
      ontologyEnabled: singleTurn,
      ontologyLocked: singleTurn
    }
  }
}

export function submitQuestion(state, question) {
  const normalizedQuestion = String(question ?? '').trim()
  if (!normalizedQuestion) return state

  return {
    ...state,
    phase: 'loading',
    question: normalizedQuestion,
    qaRunId: '',
    qaResult: null,
    answerSource: null,
    errorMessage: '',
    answer: null,
    answerDetails: [],
    references: [],
    evidenceOpen: false,
    selectedCitationId: null,
    evaluation: createAnswerEvaluationState()
  }
}

export function completeApiAnswer(state, adaptedAnswer) {
  if (!state || state.phase !== 'loading' || !adaptedAnswer?.answer) return state

  const references = Array.isArray(adaptedAnswer.references) ? adaptedAnswer.references : []
  const answerDetails = Array.isArray(adaptedAnswer.answerDetails) ? adaptedAnswer.answerDetails : []
  return {
    ...state,
    phase: 'answered',
    qaRunId: adaptedAnswer.qaRunId || '',
    qaResult: adaptedAnswer.qaResult || null,
    answerSource: 'live',
    errorMessage: '',
    answer: adaptedAnswer.answer,
    answerDetails,
    references,
    evidenceOpen: false,
    selectedCitationId: references[0]?.id ?? null
  }
}

export function failApiAnswer(state, error) {
  if (!state || state.phase !== 'loading') return state

  return {
    ...state,
    phase: 'error',
    qaRunId: '',
    qaResult: null,
    answerSource: null,
    errorMessage: String(error?.message ?? '').trim() || '问答请求失败，请重新尝试。',
    answer: null,
    answerDetails: [],
    references: [],
    evidenceOpen: false,
    selectedCitationId: null
  }
}

export function completePreviewAnswer(state) {
  if (!state || state.phase !== 'loading') return state

  return {
    ...state,
    phase: 'answered',
    qaRunId: '',
    qaResult: null,
    answerSource: 'preview',
    errorMessage: '',
    answer: {
      ...answer,
      sections: answer.sections.map(section => ({
        ...section,
        citations: [...section.citations]
      })),
      citationIds: [...answer.citationIds],
      researchPath: [...answer.researchPath]
    },
    answerDetails: [],
    references: references.map(reference => ({ ...reference })),
    evidenceOpen: true,
    selectedCitationId: 'R1'
  }
}

export function completeMockAnswer(state) {
  return completePreviewAnswer(state)
}

export function canEvaluateAnswer(state) {
  return state?.phase === 'answered' && state?.answerSource === 'live'
}

export function selectCitation(state, citationId) {
  if (!state?.references?.some(reference => reference.id === citationId)) return state

  return {
    ...state,
    evidenceOpen: true,
    selectedCitationId: citationId
  }
}

export function updateQaSettings(state, updates) {
  if (!state) return state

  const allowedKeys = ['model', 'framework', 'reasoning', 'ontologyEnabled']
  const safeUpdates = Object.fromEntries(
    Object.entries(updates ?? {}).filter(([key]) => allowedKeys.includes(key))
  )
  const framework = safeUpdates.framework ?? state.settings.framework
  const nexusSelected = framework === 'NEXUS'

  return {
    ...state,
    settings: {
      ...state.settings,
      ...safeUpdates,
      framework,
      ontologyEnabled: nexusSelected
        ? true
        : (safeUpdates.ontologyEnabled ?? state.settings.ontologyEnabled),
      ontologyLocked: nexusSelected
    }
  }
}

export function updateAnswerEvaluation(state, patchOrUpdater) {
  if (!state?.evaluation) return state

  const nextEvaluation = typeof patchOrUpdater === 'function'
    ? patchOrUpdater(state.evaluation)
    : patchAnswerEvaluation(state.evaluation, patchOrUpdater)

  return nextEvaluation === state.evaluation
    ? state
    : { ...state, evaluation: nextEvaluation }
}

export function resetConversation() {
  return createQaState()
}
