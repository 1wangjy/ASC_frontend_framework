import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { nextTick, ssrContextKey } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'

import { createMemoryVueRenderer, renderedText } from './createMemoryVueRenderer.js'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

const EmptyRouteView = { render: () => null }

async function loadClientRenderableSfc(server, modulePath, loaded = new Set()) {
  if (loaded.has(modulePath)) {
    return (await server.ssrLoadModule(modulePath)).default
  }
  loaded.add(modulePath)

  const filename = resolve(projectRoot, modulePath.replace(/^\/+/, ''))
  const source = await readFile(filename, 'utf8')
  const { descriptor } = parse(source, { filename })
  const script = compileScript(descriptor, { id: filename })
  const compiled = compileTemplate({
    id: filename,
    filename,
    source: descriptor.template.content,
    compilerOptions: { bindingMetadata: script.bindings }
  })
  if (compiled.errors.length) throw new Error(String(compiled.errors[0]))

  const vueUrl = import.meta.resolve('vue')
  const clientTemplate = compiled.code.replaceAll('from "vue"', `from ${JSON.stringify(vueUrl)}`)
  const templateModule = await import(`data:text/javascript;base64,${Buffer.from(clientTemplate).toString('base64')}`)
  const module = await server.ssrLoadModule(modulePath)
  module.default.render = templateModule.render

  const scripts = [descriptor.script?.content, descriptor.scriptSetup?.content]
    .filter(Boolean)
    .join('\n')
  const childImports = [...scripts.matchAll(/from\s+['"]([^'"]+\.vue)['"]/g)]
  for (const [, childImport] of childImports) {
    const childFilename = resolve(dirname(filename), childImport)
    const childModulePath = `/${relative(projectRoot, childFilename).replaceAll('\\', '/')}`
    await loadClientRenderableSfc(server, childModulePath, loaded)
  }
  return module.default
}

export async function mountSfcWithMemoryRouter(modulePath, initialPath) {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [vue()],
    server: { middlewareMode: true }
  })

  let app
  try {
    const component = await loadClientRenderableSfc(server, modulePath)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'AscQa', component: EmptyRouteView },
        { path: '/documents', name: 'Documents', component: EmptyRouteView },
        {
          path: '/process/:projectId?',
          name: 'Process',
          component: EmptyRouteView,
          meta: { navigationPath: '/process' }
        }
      ]
    })
    const { renderer, root } = createMemoryVueRenderer()
    app = renderer.createApp(component)
    app.use(router)
    app.provide(ssrContextKey, { modules: new Set() })

    await router.push(initialPath)
    await router.isReady()
    app.mount(root)
    await nextTick()

    return {
      app,
      root,
      router,
      async close() {
        app.unmount()
        await server.close()
      }
    }
  } catch (error) {
    app?.unmount()
    await server.close()
    throw error
  }
}

export function findRenderedNode(node, predicate) {
  if (predicate(node)) return node
  for (const child of node?.children || []) {
    const match = findRenderedNode(child, predicate)
    if (match) return match
  }
  return null
}

export async function clickRenderedLink(node) {
  const handlers = Array.isArray(node?.props?.onClick)
    ? node.props.onClick
    : [node?.props?.onClick]
  const event = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    currentTarget: { getAttribute: () => null },
    preventDefault() { this.defaultPrevented = true }
  }
  for (const handler of handlers) {
    if (typeof handler === 'function') await handler(event)
  }
  await nextTick()
}

export function findRenderedLinkByText(root, text) {
  return findRenderedNode(
    root,
    node => node?.type === 'a' && renderedText(node).includes(text)
  )
}
