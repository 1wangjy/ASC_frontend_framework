import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { createSSRApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const graphRoutes = [
  ['/process/p1', { path: '/process/:projectId?', name: 'Process' }],
  ['/simulation/s1', { path: '/simulation/:simulationId', name: 'Simulation' }],
  ['/simulation/s1/start', { path: '/simulation/:simulationId/start', name: 'SimulationRun' }],
  ['/report/r1', { path: '/report/:reportId', name: 'Report' }],
  ['/interaction/r1', { path: '/interaction/:reportId', name: 'Interaction' }]
]

test('keeps one knowledge-graph project table beside every stage of the graph workflow', async () => {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [vue()],
    server: { middlewareMode: true }
  })

  try {
    const { default: AscShell } = await server.ssrLoadModule('/src/layouts/AscShell.vue')
    for (const [path, route] of graphRoutes) {
      const stageComponent = { render: () => h('p', 'active workflow stage') }
      const routes = [
        { path: '/', name: 'AscQa', component: stageComponent },
        { path: '/documents', name: 'Documents', component: stageComponent },
        ...(route.name === 'Process'
          ? []
          : [{ path: '/process/:projectId?', name: 'Process', component: stageComponent }]),
        {
          ...route,
          component: stageComponent,
          meta: { navigationPath: '/process' }
        }
      ]
      const router = createRouter({
        history: createMemoryHistory(),
        routes
      })
      await router.push(path)
      await router.isReady()
      const app = createSSRApp({
        render: () => h(AscShell, null, { default: () => h('p', 'active workflow stage') })
      })
      app.use(router)
      const html = await renderToString(app)

      assert.equal((html.match(/知识图谱项目/g) || []).length, 1, path)
      assert.match(html, /active workflow stage/, path)
    }
  } finally {
    await server.close()
  }
})
