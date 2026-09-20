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
  if (!routeRequiresAuth(to) || authStore.isLoggedIn) return true
  rememberIntendedPath(to.fullPath)
  authStore.openLoginModal()
  return { name: 'AscHome', replace: true }
})

export default router
