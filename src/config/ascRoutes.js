export const ascRouteDefinitions = [
  {
    path: '/',
    name: 'AscQa',
    component: () => import('../views/AscQaView.vue'),
    meta: { title: '问答首页' }
  },
  {
    path: '/documents',
    name: 'Documents',
    component: () => import('../views/DocumentLibraryView.vue'),
    meta: { title: '文献管理' }
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { title: '知识图谱' }
  },
  {
    path: '/knowledge/explorer',
    name: 'KnowledgeExplorer',
    component: () => import('../views/KnowledgeExplorerView.vue'),
    meta: { title: '知识图谱工作区' }
  },
  {
    path: '/data',
    name: 'DataPlatform',
    component: () => import('../views/DataPlatformView.vue'),
    meta: { title: '数据平台' }
  },
  {
    path: '/models',
    name: 'Models',
    component: () => import('../views/ModelsView.vue'),
    meta: { title: '专业模型' }
  },
  {
    path: '/process/:projectId',
    name: 'Process',
    component: () => import('../views/MainView.vue'),
    props: true,
    meta: { title: '知识图谱构建', navigationPath: '/knowledge' }
  },
  {
    path: '/simulation/:simulationId',
    name: 'Simulation',
    component: () => import('../views/SimulationView.vue'),
    props: true,
    meta: { title: '研究配置', navigationPath: '/knowledge' }
  },
  {
    path: '/simulation/:simulationId/start',
    name: 'SimulationRun',
    component: () => import('../views/SimulationRunView.vue'),
    props: true,
    meta: { title: '证据推理', navigationPath: '/knowledge' }
  },
  {
    path: '/report/:reportId',
    name: 'Report',
    component: () => import('../views/ReportView.vue'),
    props: true,
    meta: { title: '研究报告', navigationPath: '/' }
  },
  {
    path: '/interaction/:reportId',
    name: 'Interaction',
    component: () => import('../views/InteractionView.vue'),
    props: true,
    meta: { title: '问答与证据评估', navigationPath: '/' }
  }
]

export const fallbackRoute = {
  path: '/:pathMatch(.*)*',
  redirect: '/'
}
