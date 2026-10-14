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

// The permissions editor is intentionally hidden by the simplified UI.
// Stored permission enforcement remains covered by toolPrefs tests and this blocked-send check.
test('hidden permission controls keep the registry loaded and persisted restrictions intact', async () => {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  const calls = installFetchStub()
  const stored = installStorage({
    [AGENT_TOOL_PREFS_KEY]: JSON.stringify({ disabled: TOOLS, readOnly: true })
  })
  const fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', { projectId: 'p1' })
  try {
    await waitFor(() => assert.match(renderedText(fixture.root), /已禁用全部可用工具，无法发送/), 'stored restrictions not loaded')
    assert.equal(findButton(fixture.root, '工具权限'), null)
    assert.equal(findRenderedNode(fixture.root, node => node.props?.id === 'agent-tool-auth'), null)
    assert.equal(findButton(fixture.root, '发送').props.disabled, true)
    assert.equal(calls.filter(call => call.url.endsWith('/api/agent/tools')).length, 1)
    assert.deepEqual(JSON.parse(stored.get(AGENT_TOOL_PREFS_KEY)), { disabled: TOOLS, readOnly: true })
  } finally {
    await fixture.close()
    globalThis.fetch = previousFetch
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
