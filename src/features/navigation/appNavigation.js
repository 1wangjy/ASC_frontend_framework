export const primaryNavigation = [
  { label: '问答首页', path: '/', icon: 'home' },
  { label: '文献管理', path: '/documents', icon: 'document' },
  { label: '图谱构建', path: '/process', icon: 'graph' }
]

export function createPrimaryNavigationState() {
  let graphPath = '/process'

  return {
    observe(route = {}) {
      if (route.name !== 'Process') return
      const projectId = String(route.params?.projectId || '').trim()
      graphPath = projectId
        ? String(route.fullPath || `/process/${encodeURIComponent(projectId)}`)
        : '/process'
    },
    target(item = {}) {
      return item.path === '/process' ? graphPath : item.path
    }
  }
}

export const recentConversations = [
  {
    id: 'thermal-shock',
    title: '热震稳定性与 SiC 含量',
    question: '分析 ASC Al₂O₃-SiC-C 材料体系的热震稳定性及主要影响因素。'
  },
  {
    id: 'oxidation',
    title: '抗氧化剂作用机理',
    question: '分析 ASC 耐火材料中复合抗氧化剂的作用机理。'
  },
  {
    id: 'slag-corrosion',
    title: '高炉渣侵蚀路径分析',
    question: '梳理高炉出铁沟耐火材料的渣铁侵蚀路径。'
  },
  {
    id: 'phase-design',
    title: 'Al₂O₃-SiC-C 复相材料组成与结构设计',
    question: '如何设计 Al₂O₃-SiC-C 复相耐火材料的组成与显微结构？'
  },
  {
    id: 'preparation',
    title: 'ASC 耐火材料成型与制备工艺优化',
    question: 'ASC 耐火材料的成型和制备工艺应如何优化？'
  },
  {
    id: 'characterization',
    title: '显微结构与物相表征结果分析',
    question: '如何结合物相与显微结构表征分析 ASC 耐火材料的性能？'
  }
]
