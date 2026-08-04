export const questionCategories = Object.freeze([
  {
    id: 'materials',
    title: '材料基础与体系设计',
    icon: 'model',
    backendCategories: ['耐火材料基础', '复相材料的组分结构设计'],
    questions: [
      'ASC 各组分分别起什么作用？',
      '如何根据服役条件选择耐火材料体系？',
      '颗粒级配如何影响复相材料结构？',
      'Al₂O₃、SiC 和 C 的比例如何协同优化？',
      '结合剂类型会怎样改变基质结构？',
      '微粉组成如何影响材料的致密化？'
    ]
  },
  {
    id: 'processing',
    title: '制备成型与工艺控制',
    icon: 'database',
    backendCategories: ['耐火材料的合成制备成型'],
    questions: [
      '加水量如何影响浇注料流动性？',
      '混炼顺序对浇注料性能有什么影响？',
      '烧成制度应如何匹配材料组成？',
      '振动成型参数如何影响坯体致密度？',
      '养护制度如何影响早期强度发展？',
      '原料加入顺序怎样减少团聚和偏析？'
    ]
  },
  {
    id: 'characterization',
    title: '性能测试与表征分析',
    icon: 'document',
    backendCategories: ['性能测试', '表征分析'],
    questions: [
      '热震性能应采用哪些指标评价？',
      '如何结合 XRD 与 SEM 判断物相演变？',
      '耐压强度与显气孔率有什么关系？',
      '如何从 SEM 图像识别裂纹扩展路径？',
      '抗折强度与残余强度应如何联合评价？',
      '热膨胀曲线能反映哪些结构变化？'
    ]
  },
  {
    id: 'service',
    title: '服役行为与损毁机理',
    icon: 'graph',
    backendCategories: ['耐火材料的服役机制、损耗机理'],
    questions: [
      '氧化与渣蚀如何耦合导致损毁？',
      '热应力如何诱发耐火材料剥落？',
      '如何识别高炉出铁沟的主要侵蚀路径？',
      '渣铁渗透通常从哪些薄弱区域开始？',
      '碳相氧化如何加速材料结构劣化？',
      '如何利用残砖分析判断主导损毁机制？'
    ]
  }
])

function questionIndex(random, length) {
  const sampled = Number(random?.() ?? Math.random())
  return Math.min(length - 1, Math.max(0, Math.floor(sampled * length)))
}

function questionGroup(questions, startIndex, count = 1) {
  return Array.from(
    { length: Math.min(count, questions.length) },
    (_, offset) => questions[(startIndex + offset) % questions.length]
  )
}

function sameQuestionGroup(left, right) {
  return left.length === right.length
    && left.every((question, index) => question === right[index])
}

function createGuide(category, random) {
  const startIndex = questionIndex(random, category.questions.length)
  return {
    id: category.id,
    title: category.title,
    icon: category.icon,
    backendCategories: [...category.backendCategories],
    questions: questionGroup(category.questions, startIndex)
  }
}

export function createQuestionGuideState(random = Math.random) {
  return questionCategories.map(category => createGuide(category, random))
}

export function refreshQuestionGuide(state, categoryId, random = Math.random) {
  const category = questionCategories.find(item => item.id === categoryId)
  if (!category) return state

  return state.map(guide => {
    if (guide.id !== categoryId) return guide

    let startIndex = questionIndex(random, category.questions.length)
    let questions = questionGroup(category.questions, startIndex)
    if (sameQuestionGroup(questions, guide.questions)) {
      const currentStart = Math.max(0, category.questions.indexOf(guide.questions[0]))
      startIndex = (currentStart + 1) % category.questions.length
      questions = questionGroup(category.questions, startIndex)
    }

    return { ...guide, questions }
  })
}
