import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

const records = [
  { sessionId: 'a', title: 'SiC 空气 1500℃', updatedAt: '2026-10-20T02:00:00Z', turns: 3, workspace: { projectId: 'p1', graphId: 'g1' } },
  { sessionId: 'b', title: '旧图谱 氮气对照', updatedAt: '2026-10-18T02:00:00Z', turns: 1, workspace: { projectId: 'p2', graphId: 'g2' } },
  { sessionId: 'c', title: '早期未指定项目', updatedAt: '2026-10-08T02:00:00Z', turns: 2 },
]
const byLabel = (root, label) => findRenderedNode(root, n => n.props?.['aria-label'] === label)
const button = (root, text) => findRenderedNode(root, n => n.type === 'button' && renderedText(n).trim() === text)
async function invoke(node, key = 'onClick', event = {}) {
  assert.ok(node, `missing node for ${key}`)
  for (const fn of [].concat(node.props[key] || [])) if (typeof fn === 'function') await fn(event)
  await nextTick()
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)) }
  assert.ok(fn(), 'fixture did not finish loading')
}
async function mount(t, props = {}, options = {}) {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window, originalObserver = globalThis.ResizeObserver
  const calls = [], events = [], widthListeners = new Map()
  let confirm = false
  let resize, disconnected = false
  if (options.observe) globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback }
    observe() { resize([{ contentRect: { width: options.width || 1500 } }]) }
    disconnect() { disconnected = true }
  }
  globalThis.window = { confirm: () => confirm, matchMedia: () => ({ matches: !!options.narrow,
    addEventListener: (key, fn) => widthListeners.set(key, fn), removeEventListener: key => widthListeners.delete(key) }) }
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' })
    if (options.fetch) return options.fetch(url, init, calls)
    return new Response(JSON.stringify(init.method === 'DELETE' ? { ok: true } : { sessions: records }), { headers: { 'content-type': 'application/json' } })
  }
  const view = await mountSfcWithMemoryRouter('/src/platform/agent/QaSessionToc.vue', '/', {
    activeSessionId: 'a', activeProjectId: 'p1', projects: [{ projectId: 'p1', name: '当前图谱' }, { projectId: 'p2', name: '旧图谱' }],
    onOpen: payload => events.push(['open', payload]), onCreate: () => events.push(['create']), onDeleted: id => events.push(['deleted', id]), ...props,
  })
  t.after(async () => { await view.close(); globalThis.fetch = originalFetch; globalThis.window = originalWindow; globalThis.ResizeObserver = originalObserver; if (options.observe) assert.equal(disconnected, true) })
  await waitFor(() => calls.length > 0)
  return { ...view, calls, events, widthListeners, resize: width => resize([{ contentRect: { width } }]), confirm: value => { confirm = value } }
}

test('available content width controls the drawer even with a wide viewport; resizing preserves search and sessions', async t => {
  const v = await mount(t, {}, { observe: true, width: 1100 })
  assert.ok(byLabel(v.root, '展开会话历史'))
  await invoke(byLabel(v.root, '展开会话历史'))
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  assert.ok(byLabel(v.root, '关闭会话历史'))
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '空气')
  v.resize(1600)
  await nextTick()
  assert.equal(byLabel(v.root, '关闭会话历史'), null)
  assert.match(renderedText(v.root), /找到 1 个会话/)
  v.resize(1200)
  await nextTick()
  assert.ok(byLabel(v.root, '展开会话历史'))
  await invoke(byLabel(v.root, '展开会话历史'))
  assert.match(renderedText(v.root), /找到 1 个会话/)
  assert.equal(v.calls.length, 1)
})

test('history preserves all graph groups, active highlight and scoped opening; search reveals folded legacy records', async t => {
  const v = await mount(t)
  await waitFor(() => !!button(v.root, 'SiC 空气 1500℃3 轮') || renderedText(v.root).includes('SiC 空气 1500℃'))
  assert.match(v.calls[0].url, /limit=100&mode=agent/)
  assert.match(renderedText(v.root), /旧图谱/)
  assert.match(renderedText(v.root), /未指定图谱/)
  const current = findRenderedNode(v.root, n => n.props?.['aria-current'] === 'true')
  assert.equal(current.props.title, records[0].title)
  await invoke(current)
  assert.deepEqual(v.events[0], ['open', { sessionId: 'a', projectId: 'p1', graphId: 'g1' }])
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '旧图谱')
  assert.match(renderedText(v.root), /旧图谱 氮气对照/)
  assert.doesNotMatch(renderedText(v.root), /SiC 空气/)
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '早期未指定')
  assert.match(renderedText(v.root), /早期未指定项目/)
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '不存在的会话')
  assert.match(renderedText(v.root), /未找到匹配/)
  await invoke(byLabel(v.root, '清空会话搜索'))
  assert.match(renderedText(v.root), /SiC 空气/)
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', 'ｓｉｃ')
  assert.match(renderedText(v.root), /SiC 空气/)
  assert.equal(v.calls.length, 1, 'search does not request other accounts or new model calls')
})

test('collapsing keeps search state and does not create or lose a conversation', async t => {
  const v = await mount(t)
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '空气')
  await invoke(byLabel(v.root, '收起会话历史'))
  assert.ok(byLabel(v.root, '展开会话历史'))
  assert.equal(byLabel(v.root, '搜索会话'), null)
  await invoke(byLabel(v.root, '展开会话历史'))
  assert.match(renderedText(v.root), /找到 1 个会话/)
  assert.match(renderedText(v.root), /SiC 空气/)
  assert.doesNotMatch(renderedText(v.root), /旧图谱 氮气对照/)
  await invoke(button(v.root, '＋ 新建会话'))
  assert.deepEqual(v.events, [['create']])
  assert.equal(v.calls.length, 1)
})

test('more menu needs confirmation; cancellation preserves the row and confirmed deletion retains other sessions', async t => {
  const v = await mount(t)
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  assert.equal(button(v.root, '删除会话'), null)
  await invoke(byLabel(v.root, `更多操作：${records[0].title}`), 'onClick', { stopPropagation() {} })
  await invoke(button(v.root, '删除会话'))
  assert.equal(v.calls.filter(c => c.method === 'DELETE').length, 0)
  assert.match(renderedText(v.root), /SiC 空气/)
  v.confirm(true)
  await invoke(button(v.root, '删除会话'))
  assert.equal(v.calls.filter(c => c.method === 'DELETE').length, 1)
  assert.deepEqual(v.events, [['deleted', 'a']])
  assert.doesNotMatch(renderedText(v.root), /SiC 空气/)
  assert.match(renderedText(v.root), /旧图谱/)
})

test('running lock disables navigation and mutation while keeping history searchable', async t => {
  const v = await mount(t, { locked: true, mode: 'single' })
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  assert.match(v.calls[0].url, /mode=single/)
  assert.equal(button(v.root, '＋ 新建会话').props.disabled, true)
  assert.equal(findRenderedNode(v.root, n => n.props?.['aria-current'] === 'true').props.disabled, true)
  assert.equal(byLabel(v.root, `更多操作：${records[0].title}`).props.disabled, true)
  await invoke(button(v.root, '＋ 新建会话'))
  assert.equal(v.events.length, 0)
  await invoke(byLabel(v.root, '搜索会话'), 'onUpdate:modelValue', '空气')
  assert.match(renderedText(v.root), /SiC 空气/)
})

test('narrow viewport defaults to a drawer and opening a past session closes it without extra requests', async t => {
  const v = await mount(t, {}, { narrow: true })
  await invoke(byLabel(v.root, '展开会话历史'))
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  assert.ok(byLabel(v.root, '关闭会话历史'))
  await invoke(findRenderedNode(v.root, n => n.props?.['aria-current'] === 'true'))
  assert.ok(byLabel(v.root, '展开会话历史'))
  assert.equal(v.events[0][0], 'open')
  assert.equal(v.calls.length, 1)
})

test('list errors are shown with a working retry, not misreported as lost history', async t => {
  const v = await mount(t, {}, { fetch: (url, init, calls) => new Response(JSON.stringify(calls.length === 1 ? { message: 'temporary failure' } : { sessions: records }), {
    status: calls.length === 1 ? 503 : 200, headers: { 'content-type': 'application/json' },
  }) })
  await waitFor(() => !!byLabel(v.root, '刷新会话列表') && renderedText(v.root).includes('temporary failure'))
  await invoke(byLabel(v.root, '刷新会话列表'))
  await waitFor(() => renderedText(v.root).includes('SiC 空气'))
  assert.equal(v.calls.length, 2)
})
