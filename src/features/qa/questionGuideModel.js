export const questionCategories = Object.freeze([
  {
    id: 'materials',
    title: '材料基础与体系设计',
    icon: 'model',
    backendCategories: ['耐火材料基础', '复相材料的组分结构设计'],
    questions: [
      'ASC 各组分分别起什么作用？',
      '如何根据服役条件选择耐火材料体系？',
      '颗粒级配如何影响复相材料结构？'
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
      '烧成制度应如何匹配材料组成？'
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
      '耐压强度与显气孔率有什么关系？'
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
      '如何识别高炉出铁沟的主要侵蚀路径？'
    ]
  }
])

function createGuide(category) {
  return {
    id: category.id,
    title: category.title,
    icon: category.icon,
    backendCategories: [...category.backendCategories],
    questions: [...category.questions]
  }
}

export function createQuestionGuideState() {
  return questionCategories.map(createGuide)
}
