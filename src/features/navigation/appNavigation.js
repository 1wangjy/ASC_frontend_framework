export const primaryNavigation = [
  { label: '首页', path: '/', icon: 'home' },
  { divider: true },
  {
    label: '问题研究',
    path: '/research',
    icon: 'search',
    children: [
      { label: '智能会话', path: '/research?mode=multi' },
      { label: '深度研究', path: '/research?mode=single' }
    ]
  },
  {
    label: '数据平台',
    path: '/platform',
    icon: 'database',
    children: [
      { label: '智能解析', path: '/platform/data?tab=parse' },
      { label: '数据管理', path: '/platform/data?tab=manage' },
      { label: '文献管理', path: '/platform/data?tab=literature' },
      { label: '图谱项目', path: '/process' },
      { label: '报告中心', path: '/reports' }
    ]
  },
  {
    label: '模型入口',
    path: '/platform/models',
    icon: 'model',
    children: [
      { label: '性能预测', path: '/platform/model1' },
      { label: '配方优化', path: '/platform/model2' },
      { label: '服役预测', path: '/platform/model3' },
      { label: '仿真重建', path: '/platform/model4' },
      { label: '验收测试[2026]', path: '/platform/acceptance' }
    ]
  }
]

const GRAPH_WORKFLOW_ROUTE_NAMES = new Set([
  'Simulation',
  'SimulationRun'
])

const REPORT_WORKFLOW_ROUTE_NAMES = new Set(['Report'])

export function createPrimaryNavigationState() {
  let graphPath = '/process'
  let reportPath = '/reports'

  return {
    observe(route = {}) {
      if (route.name === 'Process') {
        const projectId = String(route.params?.projectId || '').trim()
        graphPath = projectId
          ? String(route.fullPath || `/process/${encodeURIComponent(projectId)}`)
          : '/process'
        return
      }

      if (GRAPH_WORKFLOW_ROUTE_NAMES.has(route.name) && route.fullPath) {
        graphPath = String(route.fullPath)
        return
      }

      if (route.name === 'Reports') {
        reportPath = '/reports'
        return
      }

      if (REPORT_WORKFLOW_ROUTE_NAMES.has(route.name) && route.fullPath) {
        reportPath = String(route.fullPath)
      }
    },
    target(item = {}) {
      if (item.path === '/process') return graphPath
      if (item.path === '/reports') return reportPath
      return item.path
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
