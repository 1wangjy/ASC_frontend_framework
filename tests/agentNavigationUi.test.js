import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

async function invoke(node, name, value) {
  for (const handler of [node.props[name]].flat()) if (typeof handler === 'function') await handler(value)
  await nextTick()
}
async function setup() {
  const original = globalThis.fetch
  let release
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith('/sessions') && init.method === 'POST') {
      return new Promise(resolve => { release = () => resolve(Response.json({ sessionId: 'pending-session' })) })
    }
    if (String(url).endsWith('/stream')) {
      return new Response('data: {"type":"final","text":"回答"}\n\ndata: {"type":"done","steps":1}\n\n')
    }
    if (String(url).endsWith('/models')) return Response.json({ models: [{ id: 'default', model: 'mock', configured: true }] })
    return Response.json({ tools: [{ name: 'kg_search' }] })
  }
  const fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/',
    { embedded: true, projectId: 'p1', graphId: 'g1' })
  await invoke(findRenderedNode(fixture.root, n => n.type === 'textarea'), 'onUpdate:modelValue', '材料问题')
  const pending = invoke(findRenderedNode(fixture.root, n => n.type === 'form'), 'onSubmit', { preventDefault() {} })
  await nextTick()
  return { fixture, pending, calls, release: () => release(), restore: () => { globalThis.fetch = original } }
}

test('session creation locks input, model and exposed parent navigation before streaming starts', async () => {
  const state = await setup()
  try {
    assert.equal(findRenderedNode(state.fixture.root, n => n.type === 'textarea').props.disabled, true)
    assert.equal(findRenderedNode(state.fixture.root, n => n.type === 'select').props.disabled, true)
    assert.equal(state.fixture.app._instance.exposed.sending.value, true)
    // 嵌入模式下会话管理在页面右侧目录（QaSessionToc），面板头部不再放会话按钮
    assert.equal(findRenderedNode(state.fixture.root, n => n.type === 'button' && /新建会话|会话历史/.test(renderedText(n))), null)
    state.release()
    await state.pending
    assert.equal(state.calls.filter(call => call.url.endsWith('/stream')).length, 1)
  } finally {
    state.release()
    await state.pending
    await state.fixture.close()
    state.restore()
  }
})

test('leaving the component during session creation never starts a late model request', async () => {
  const state = await setup()
  try {
    await state.fixture.close()
    state.release()
    await state.pending
    assert.equal(state.calls.filter(call => call.url.endsWith('/stream')).length, 0)
  } finally {
    state.restore()
  }
})
