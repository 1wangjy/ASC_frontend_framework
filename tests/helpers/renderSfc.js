import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

export async function renderSfc(modulePath, props = {}, { withRouter = false } = {}) {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [vue()],
    server: { middlewareMode: true }
  })

  try {
    const module = await server.ssrLoadModule(modulePath)
    const app = createSSRApp(module.default, props)

    if (withRouter) {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
      })
      app.use(router)
      await router.push('/')
      await router.isReady()
    }

    return renderToString(app)
  } finally {
    await server.close()
  }
}
