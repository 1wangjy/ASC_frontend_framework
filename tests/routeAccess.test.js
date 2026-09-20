import test from 'node:test'
import assert from 'node:assert/strict'

import { canAccessRoute, consumeIntendedPath, navigationItemLocked, rememberIntendedPath, routeRequiresAuth } from '../src/config/routeAccess.js'

const HOME = { name: 'AscHome', meta: { title: '首页', public: true } }
const RESEARCH = { name: 'AscQa', meta: { title: '问题研究' } }
const PLATFORM_DATA = { name: 'PlatformData', meta: { title: '数据平台' } }

test('only the home showcase page is public', () => {
  assert.equal(routeRequiresAuth(HOME), false)
  assert.equal(routeRequiresAuth(RESEARCH), true)
  assert.equal(routeRequiresAuth(PLATFORM_DATA), true)
})

test('meta.public grants access without a name whitelist entry', () => {
  assert.equal(routeRequiresAuth({ name: 'Anything', meta: { public: true } }), false)
})

test('logged-out visitors may only reach the home route', () => {
  assert.equal(canAccessRoute(false, HOME), true)
  assert.equal(canAccessRoute(false, RESEARCH), false)
  assert.equal(canAccessRoute(false, PLATFORM_DATA), false)
})

test('logged-in users reach every route', () => {
  assert.equal(canAccessRoute(true, HOME), true)
  assert.equal(canAccessRoute(true, RESEARCH), true)
  assert.equal(canAccessRoute(true, PLATFORM_DATA), true)
})

test('sidebar items lock according to the resolved route, not the raw path', () => {
  const routes = {
    '/': { matched: [HOME] },
    '/research': { matched: [RESEARCH] },
    '/platform/data?tab=literature': { matched: [PLATFORM_DATA] },
  }
  const router = { resolve: (path) => routes[path] || { matched: [] } }

  assert.equal(navigationItemLocked(false, router, '/'), false)
  assert.equal(navigationItemLocked(false, router, '/research'), true)
  assert.equal(navigationItemLocked(false, router, '/platform/data?tab=literature'), true)

  assert.equal(navigationItemLocked(true, router, '/research'), false)
  assert.equal(navigationItemLocked(true, router, '/platform/data?tab=literature'), false)
})

test('an unresolvable target locks rather than silently navigating', () => {
  const router = { resolve: () => { throw new Error('bad path') } }
  assert.equal(navigationItemLocked(false, router, '/broken'), true)
})

// node --test 环境没有 sessionStorage：用最小桩验证"登录后跳回原目标页"的一次性语义
function withSessionStorage(run) {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  try {
    run(store)
  } finally {
    delete globalThis.sessionStorage
  }
}

test('an intercepted path is remembered and consumed exactly once', () => {
  withSessionStorage(() => {
    rememberIntendedPath('/platform/data?tab=literature')
    assert.equal(consumeIntendedPath(), '/platform/data?tab=literature')
    assert.equal(consumeIntendedPath(), '')
  })
})

test('returning home clears any pending target', () => {
  withSessionStorage(() => {
    rememberIntendedPath('/research')
    rememberIntendedPath('/')
    assert.equal(consumeIntendedPath(), '')
  })
})

test('a broken sessionStorage never throws', () => {
  const broken = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  globalThis.sessionStorage = broken
  try {
    assert.doesNotThrow(() => rememberIntendedPath('/research'))
    assert.equal(consumeIntendedPath(), '')
  } finally {
    delete globalThis.sessionStorage
  }
})
