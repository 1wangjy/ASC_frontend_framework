import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { nextTick, ssrContextKey } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'

import { WorkflowRouteOutlet } from '../../src/features/navigation/WorkflowRouteOutlet.js'
import { createMemoryVueRenderer } from './createMemoryVueRenderer.js'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

function cleanViteId(id = '') {
  let clean = id.split('?')[0]
  if (clean.startsWith('/@fs/')) clean = clean.slice('/@fs/'.length)
  if (/^\/[A-Za-z]:\//.test(clean)) clean = clean.slice(1)
  return clean
}

function moduleOverridePlugin(moduleOverrides) {
  const overrides = new Map(
    Object.entries(moduleOverrides).map(([modulePath, source], index) => [
      resolve(projectRoot, modulePath.replace(/^\/+/, '')),
      { id: `\0workflow-route-test:${index}`, source }
    ])
  )
  const virtualModules = new Map([...overrides.values()].map(value => [value.id, value.source]))

  return {
    name: 'workflow-route-test-overrides',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || (!source.startsWith('.') && !isAbsolute(source))) return null
      const importerPath = cleanViteId(importer)
      const candidate = resolve(dirname(importerPath), source)
      return overrides.get(candidate)?.id ?? null
    },
    load(id) {
      return virtualModules.get(id) ?? null
    }
  }
}

async function loadClientRenderableSfc(server, modulePath, overriddenPaths, loaded = new Set()) {
  if (loaded.has(modulePath)) return (await server.ssrLoadModule(modulePath)).default
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
  const templateModule = await import(
    `data:text/javascript;base64,${Buffer.from(clientTemplate).toString('base64')}`
  )
  const module = await server.ssrLoadModule(modulePath)
  module.default.render = templateModule.render

  const scripts = [descriptor.script?.content, descriptor.scriptSetup?.content]
    .filter(Boolean)
    .join('\n')
  const childImports = [...scripts.matchAll(/from\s+['"]([^'"]+\.vue)['"]/g)]
  for (const [, childImport] of childImports) {
    const childFilename = resolve(dirname(filename), childImport)
    const childModulePath = `/${relative(projectRoot, childFilename).replaceAll('\\', '/')}`
    if (!overriddenPaths.has(childModulePath)) {
      await loadClientRenderableSfc(server, childModulePath, overriddenPaths, loaded)
    }
  }
  return module.default
}

export async function settleWorkflowUpdates() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

export async function mountWorkflowRoutes({ initialPath, moduleOverrides = {}, routes }) {
  const overriddenPaths = new Set(
    Object.keys(moduleOverrides).map(modulePath => `/${modulePath.replace(/^\/+/, '').replaceAll('\\', '/')}`)
  )
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [moduleOverridePlugin(moduleOverrides), vue()],
    server: { middlewareMode: true }
  })

  let app
  try {
    const resolvedRoutes = []
    for (const route of routes) {
      resolvedRoutes.push({
        ...route,
        component: typeof route.component === 'string'
          ? await loadClientRenderableSfc(server, route.component, overriddenPaths)
          : route.component
      })
    }
    const router = createRouter({ history: createMemoryHistory(), routes: resolvedRoutes })
    const { renderer, root } = createMemoryVueRenderer()
    app = renderer.createApp(WorkflowRouteOutlet)
    app.use(router)
    app.provide(ssrContextKey, { modules: new Set() })

    await router.push(initialPath)
    await router.isReady()
    app.mount(root)
    await settleWorkflowUpdates()

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
