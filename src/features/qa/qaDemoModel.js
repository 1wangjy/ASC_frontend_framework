const defaultSettings = Object.freeze({
  knowledgeBase: 'ASC 文献库',
  model: 'Auto',
  framework: 'Hybrid RAG',
  reasoning: 'Auto',
  ontologyEnabled: true
})

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
    phase: 'empty',
    question: '',
    answer: null,
    references: [],
    evidenceOpen: false,
    selectedCitationId: null,
    settings: { ...defaultSettings }
  }
}

export function submitQuestion(state, question) {
  const normalizedQuestion = String(question ?? '').trim()
  if (!normalizedQuestion) return state

  return {
    ...state,
    phase: 'loading',
    question: normalizedQuestion,
    answer: null,
    references: [],
    evidenceOpen: false,
    selectedCitationId: null
  }
}

export function completeMockAnswer(state) {
  if (!state || state.phase !== 'loading') return state

  return {
    ...state,
    phase: 'answered',
    answer: {
      ...answer,
      sections: answer.sections.map(section => ({
        ...section,
        citations: [...section.citations]
      })),
      citationIds: [...answer.citationIds],
      researchPath: [...answer.researchPath]
    },
    references: references.map(reference => ({ ...reference })),
    evidenceOpen: true,
    selectedCitationId: 'R1'
  }
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

  return {
    ...state,
    settings: {
      ...state.settings,
      ...updates
    }
  }
}

export function resetConversation() {
  return createQaState()
}
