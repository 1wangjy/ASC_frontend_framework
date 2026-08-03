export const ascRouteDefinitions = [
  {
    path: '/',
    name: 'AscQa',
    component: () => import('../views/AscQaView.vue'),
    meta: { title: 'ASC QA' }
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
  }
]

export const fallbackRoute = {
  path: '/:pathMatch(.*)*',
  redirect: '/'
}
