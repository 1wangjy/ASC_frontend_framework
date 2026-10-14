import { createRouter, createWebHistory } from 'vue-router'
import { ascRouteDefinitions, fallbackRoute } from '../config/ascRoutes.js'
import { rememberIntendedPath, routeRequiresAuth } from '../config/routeAccess.js'
import { useAuthStore } from '../store/auth.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [...ascRouteDefinitions, fallbackRoute],
  scrollBehavior: () => ({ top: 0 })
})

// 未登录只允许停留在首页展示页：其他路由一律弹登录框并退回首页。
// 深链接（直接输 URL、外部跳转）与侧边栏点击都经过这里。
router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (routeRequiresAuth(to) && !authStore.isLoggedIn) {
    rememberIntendedPath(to.fullPath)
    authStore.openLoginModal()
    return { name: 'AscHome', replace: true }
  }
  // 管理员专页（meta.admin）：非管理员直接退回首页（后端接口另有鉴权，这里只是不给出入口）
  if (to.meta?.admin && !authStore.isAdmin) return { name: 'AscHome', replace: true }
  return true
})

export default router
