export const ascRouteDefinitions = [
  // ── 首页：项目整体宣传页 ──
  {
    path: '/',
    name: 'AscHome',
    component: () => import('../views/LandingHomeView.vue'),
    meta: { title: '首页', public: true }
  },
  // ── 问题研究：智能问答 ──
  {
    path: '/research',
    name: 'AscQa',
    component: () => import('../views/AscQaView.vue'),
    meta: { title: '问题研究' }
  },
  {
    path: '/documents',
    name: 'Documents',
    redirect: { name: 'PlatformData', query: { mode: 'graph-select' } },
    meta: { title: '文献管理' }
  },
  {
    path: '/process/:projectId?',
    name: 'Process',
    component: () => import('../views/GraphProjectWorkspaceView.vue'),
    props: true,
    meta: { title: '知识图谱构建', navigationPath: '/process' }
  },
  {
    path: '/simulation/:simulationId',
    name: 'Simulation',
    component: () => import('../views/SimulationView.vue'),
    props: true,
    meta: { title: '研究配置', navigationPath: '/process' }
  },
  {
    path: '/simulation/:simulationId/start',
    name: 'SimulationRun',
    component: () => import('../views/SimulationRunView.vue'),
    props: true,
    meta: { title: '证据推理', navigationPath: '/process' }
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('../views/ReportCenterView.vue'),
    meta: { title: '报告生成', navigationPath: '/reports' }
  },
  {
    path: '/report/:reportId',
    name: 'Report',
    component: () => import('../views/ReportView.vue'),
    props: true,
    meta: { title: '研究报告', navigationPath: '/reports' }
  },
  {
    path: '/interaction/:reportId',
    name: 'Interaction',
    component: () => import('../views/InteractionView.vue'),
    props: true,
    meta: { title: '问答与证据评估' }
  },
  // ── Platform module routes (数据平台 & AI模型) ──
  // 数据平台总览（平行光感卡片展示页）
  {
    path: '/platform',
    name: 'PlatformDataHome',
    component: () => import('../platform/views/DataPlatformHome.vue'),
    meta: { title: '数据平台' }
  },
  {
    path: '/platform/data',
    name: 'PlatformData',
    component: () => import('../platform/views/DataManagerView.vue'),
    meta: { title: '数据平台' }
  },
  {
    path: '/platform/models',
    name: 'PlatformModels',
    component: () => import('../platform/views/HomeView.vue'),
    meta: { title: '模型入口' }
  },
  {
    // 验收测试[2026]：独立页面与接口（只读本机资源 + 本机服务，不影响业务功能）
    path: '/platform/acceptance',
    name: 'Acceptance2026',
    component: () => import('../platform/views/AcceptanceView.vue'),
    meta: { title: '验收测试[2026]' }
  },
  {
    path: '/platform/model1',
    name: 'PlatformModel1',
    component: () => import('../platform/views/Model1View.vue'),
    meta: { title: '性能预测' }
  },
  {
    path: '/platform/model2',
    name: 'PlatformModel2',
    component: () => import('../platform/views/Model2View.vue'),
    meta: { title: '配方优化' }
  },
  {
    path: '/platform/model3',
    name: 'PlatformModel3',
    component: () => import('../platform/views/Model3View.vue'),
    meta: { title: '服役预测' }
  },
  {
    path: '/platform/model4',
    name: 'PlatformModel4',
    component: () => import('../platform/views/Model4View.vue'),
    meta: { title: '仿真重建' }
  }
]

export const fallbackRoute = {
  path: '/:pathMatch(.*)*',
  redirect: '/'
}
