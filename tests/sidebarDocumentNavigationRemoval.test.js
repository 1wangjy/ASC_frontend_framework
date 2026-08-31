import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { primaryNavigation } from '../src/features/navigation/appNavigation.js'
import { prepareDocumentsForGraph } from '../src/platform/services/graphDocumentBridge.js'

test('redirects the retired documents URL without removing the graph bridge', async () => {
  assert.equal(primaryNavigation.some(item => item.path === '/documents'), false)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: ascRouteDefinitions.map(({ component, ...route }) => ({
      ...route,
      ...(route.redirect ? {} : { component: { render: () => null } }),
    })),
  })
  await router.push('/documents')
  await router.isReady()

  assert.equal(router.currentRoute.value.name, 'PlatformData')
  assert.equal(router.currentRoute.value.fullPath, '/platform/data?mode=graph-select')
  assert.equal(typeof prepareDocumentsForGraph, 'function')
})
