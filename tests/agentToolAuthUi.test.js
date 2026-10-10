import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import { renderedText } from './helpers/createMemoryVueRenderer.js'
import {
  findRenderedNode,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import { AGENT_TOOL_PREFS_KEY } from '../src/platform/agent/toolPrefs.js'

const TOOLS = ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'recipe_optimize', 'web_browse']

function installFetchStub() {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ url: href, method: init.method || 'GET', body: init.body })
    if (href.endsWith('/api/agent/tools')) {
      return new Response(
        JSON.stringify({ tools: TOOLS.map(name => ({ name, description: `${name} 说明` })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response('not stubbed', { status: 404 })
  }
  return calls
}

function installStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)) },
    removeItem: key => { values.delete(key) }
  }
  return values
}

async function waitFor(assertion, message) {
  let lastError
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 10))
    await nextTick()
  }
  throw new Error(`${message}: ${lastError?.message}`)
}

function findButton(root, label) {
  return findRenderedNode(
    root,
    node => node?.type === 'button' && renderedText(node).trim() === label
  )
}

async function click(root, label) {
  const button = findButton(root, label)
  assert.ok(button, `expected a button labelled ${label}`)
  const handlers = Array.isArray(button.props.onClick) ? button.props.onClick : [button.props.onClick]
  for (const handler of handlers) if (typeof handler === 'function') await handler({ stopPropagation() {} })
  await nextTick()
}

test('tool authorization chips default to all-on, then narrow and persist', async () => {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  const calls = installFetchStub()
  const stored = installStorage()
  const fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', { projectId: 'p1' })
  const { root } = fixture

  try {
    await waitFor(
      () => assert.match(renderedText(root), /已启用 7\/7/),
      'the header hint never reflected the loaded catalog'
    )
    const toolCalls = calls.filter(call => call.url.endsWith('/api/agent/tools'))
    assert.equal(toolCalls.length, 1)
    assert.ok(calls.some(call => call.url.endsWith('/api/agent/models')))

    const toggle = findButton(root, '工具权限')
    assert.equal(toggle.props['aria-expanded'], false)
    assert.equal(toggle.props['aria-controls'], 'agent-tool-auth')

    await click(root, '工具权限')
    const auth = findRenderedNode(root, node => node?.props?.id === 'agent-tool-auth')
    assert.ok(auth, 'the authorization section did not open')
    assert.match(renderedText(auth), /已启用 7\/7/)

    const chips = TOOLS.map(name => findButton(root, name))
    chips.forEach(chip => assert.equal(chip.props['aria-pressed'], true))
    assert.equal(findButton(root, '只读模式').props['aria-checked'], false)

    await click(root, 'recipe_optimize')
    assert.equal(findButton(root, 'recipe_optimize').props['aria-pressed'], false)
    assert.match(renderedText(root), /已启用 6\/7/)

    await click(root, '只读模式')
    assert.match(renderedText(root), /只读：禁用配方优化（recipe_optimize）/)
    const locked = findButton(root, 'recipe_optimize')
    assert.equal(locked.props['aria-pressed'], false)
    assert.equal(locked.props.disabled, true)
    assert.match(renderedText(root), /已启用 6\/7/)

    assert.ok(stored.get(AGENT_TOOL_PREFS_KEY), 'selection was not persisted')
    assert.deepEqual(JSON.parse(stored.get(AGENT_TOOL_PREFS_KEY)), {
      disabled: ['recipe_optimize'],
      readOnly: true
    })

    await click(root, '只读模式')
    assert.equal(findButton(root, 'recipe_optimize').props.disabled, false)
    for (const name of TOOLS) {
      if (findButton(root, name).props['aria-pressed'] === true) await click(root, name)
    }
    assert.match(renderedText(root), /已启用 0\/7/)
    assert.match(renderedText(root), /已禁用全部可用工具，请至少启用一个工具再发送/)
    assert.match(renderedText(root), /已禁用全部可用工具，无法发送/)
    assert.equal(findButton(root, '发送').props.disabled, true)
  } finally {
    await fixture.close()
    globalThis.fetch = previousFetch
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})

test('a persisted selection is restored and reflected in the chips', async () => {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  installFetchStub()
  installStorage({
    [AGENT_TOOL_PREFS_KEY]: JSON.stringify({ disabled: ['predict', 'web_browse'], readOnly: true })
  })
  const fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', { projectId: 'p1' })
  const { root } = fixture

  try {
    await waitFor(
      () => assert.match(renderedText(root), /已启用 4\/7/),
      'the persisted selection was not restored'
    )
    await click(root, '工具权限')
    assert.match(renderedText(root), /只读：禁用配方优化/)
    assert.equal(findButton(root, 'predict').props['aria-pressed'], false)
    assert.equal(findButton(root, 'web_browse').props['aria-pressed'], false)
    assert.equal(findButton(root, 'recipe_optimize').props.disabled, true)
    assert.equal(findButton(root, 'kg_search').props['aria-pressed'], true)
  } finally {
    await fixture.close()
    globalThis.fetch = previousFetch
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
