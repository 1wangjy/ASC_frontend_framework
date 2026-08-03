import { createRouter, createWebHistory } from 'vue-router'
import { ascRouteDefinitions, fallbackRoute } from '../config/ascRoutes.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [...ascRouteDefinitions, fallbackRoute],
  scrollBehavior: () => ({ top: 0 })
})

export default router
