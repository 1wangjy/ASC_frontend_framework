import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { defineComponent, h, nextTick, onUnmounted } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAuthStore } from '../src/store/auth.js'
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../src/config/authStorage.js'
import { createMemoryVueRenderer, renderedText } from './helpers/createMemoryVueRenderer.js'

// Compile the real root auth boundary. Only the visual shell/login dialog are
// stubbed; routing, Pinia, KeepAlive and the workflow outlet are real.
const appUrl = new URL('../src/App.vue', import.meta.url)
const { descriptor } = parse(await readFile(appUrl, 'utf8'))
const compiled = compileScript(descriptor, { id: 'logout-regression', inlineTemplate: true }).content
  .replace(/import AscShell from [^\n]+/, 'const AscShell = { setup(_, { slots }) { return () => slots.default?.() } }')
  .replace(/import AscLoginModal from [^\n]+/, 'const AscLoginModal = { render: () => null }')
  .replace(/from (['"])([^'"]+)\1/g, (_, quote, specifier) =>
    `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, appUrl).href : import.meta.resolve(specifier))}`)
const App = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default

async function mountOwner() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.setSession({ id: 'owner-a', username: 'owner-a' }, 'test-token-a')
  let unmounts = 0
  let mounts = 0
  const Page = defineComponent({ name: 'AscQaView', setup() {
    const label = `${auth.username}: mount ${++mounts}`
    onUnmounted(() => unmounts++)
    return () => h('p', label)
  } })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'AscHome', component: { render: () => h('p', 'public home') }, meta: { public: true } },
    { path: '/research', name: 'AscQa', component: Page },
  ] })
  const { renderer, root } = createMemoryVueRenderer()
  const app = renderer.createApp(App)
  app.use(pinia).use(router)
  await router.push('/research')
  await router.isReady()
  app.mount(root)
  await nextTick()
  return { auth, router, root, unmounts: () => unmounts, close() { app.unmount(); auth.$dispose() } }
}

test('logout removes visible and cached private pages before another account enters', async () => {
  const view = await mountOwner()
  try {
    assert.match(renderedText(view.root), /owner-a: mount 1/)
    // Exercise the same state transition as logout, without a network request.
    view.auth.setSession(null, '')
    await nextTick()
    assert.doesNotMatch(renderedText(view.root), /owner-a/)
    assert.equal(view.unmounts(), 1)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(view.router.currentRoute.value.name, 'AscHome')
    view.auth.setSession({ id: 'owner-b', username: 'owner-b' }, 'test-token-b')
    await view.router.push('/research')
    await nextTick()
    assert.match(renderedText(view.root), /owner-b: mount 2/)
    assert.doesNotMatch(renderedText(view.root), /owner-a/)
  } finally { view.close() }
})

test('logout evicts inactive KeepAlive workflow pages as well', async () => {
  const view = await mountOwner()
  try {
    await view.router.push('/')
    await nextTick()
    assert.equal(view.unmounts(), 0, 'normal navigation retains the workflow')
    view.auth.setSession(null, '')
    await nextTick()
    assert.equal(view.unmounts(), 1, 'logout also destroys the hidden cached page')
    view.auth.setSession({ id: 'owner-a', username: 'owner-a' }, 'new-test-token-a')
    await view.router.push('/research')
    await nextTick()
    assert.match(renderedText(view.root), /mount 2/)
  } finally { view.close() }
})

test('other-tab storage logout and malformed storage clear in-memory identity', () => {
  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  const data = new Map()
  const handlers = new Map()
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  globalThis.window = { addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name) }
  const auth = useAuthStore(createPinia())
  try {
    auth.setSession({ id: 'owner-a', username: 'owner-a' }, 'test-token-a')
    data.delete(TOKEN_STORAGE_KEY)
    data.delete(USER_STORAGE_KEY)
    handlers.get('storage')({ key: TOKEN_STORAGE_KEY })
    assert.equal(auth.isLoggedIn, false)
    assert.equal(auth.currentUser, null)
    assert.equal(auth.token, '')
    data.set(USER_STORAGE_KEY, JSON.stringify({ id: 'owner-b', username: 'owner-b' }))
    handlers.get('storage')({ key: USER_STORAGE_KEY })
    assert.equal(auth.isLoggedIn, false)
    assert.ok(data.has(USER_STORAGE_KEY), 'partial cross-tab login must not be erased')
    data.set(TOKEN_STORAGE_KEY, 'test-token-b')
    handlers.get('storage')({ key: TOKEN_STORAGE_KEY })
    assert.equal(auth.isLoggedIn, true)
    assert.equal(auth.currentUser.id, 'owner-b')
    auth.setSession({ id: 'owner-b', username: 'owner-b' }, 'test-token-b')
    data.set(USER_STORAGE_KEY, 'invalid-json')
    handlers.get('storage')({ key: USER_STORAGE_KEY })
    assert.equal(auth.isLoggedIn, false)
    assert.equal(auth.currentUser, null)
    auth.$dispose()
    assert.equal(handlers.has('storage'), false)
  } finally {
    auth.$dispose()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
