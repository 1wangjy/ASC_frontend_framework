import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import {
  AGENT_TOOL_PREFS_KEY,
  buildRequestOptions,
  createDefaultToolPrefs,
  loadToolPrefs,
  parseToolPrefs,
  resolveToolSelection,
  saveToolPrefs,
  setReadOnly,
  toggleTool
} from '../src/platform/agent/toolPrefs.js'

const REGISTERED = ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'recipe_optimize', 'web_browse']

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)) },
    removeItem: key => { values.delete(key) },
    dump: () => Object.fromEntries(values)
  }
}

test('the untouched default keeps the request identical (no allowTools)', () => {
  const selection = resolveToolSelection(createDefaultToolPrefs(), REGISTERED)
  assert.equal(selection.total, 7)
  assert.equal(selection.enabled.length, 7)
  assert.equal(selection.blocked, false)
  assert.equal(selection.allowTools, undefined)
  assert.deepEqual(buildRequestOptions(selection), {})
})

test('read-only mode excludes the expensive mutating tool', () => {
  const selection = resolveToolSelection(setReadOnly(createDefaultToolPrefs(), true), REGISTERED)
  assert.deepEqual(selection.readOnlyExcluded, ['recipe_optimize'])
  assert.deepEqual(selection.allowTools, ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'web_browse'])
  assert.deepEqual(buildRequestOptions(selection), {
    allowTools: ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'web_browse']
  })
})

test('disabling chips narrows allowTools to the enabled subset in catalog order', () => {
  let prefs = createDefaultToolPrefs()
  for (const name of REGISTERED) {
    if (name !== 'predict' && name !== 'kg_search') prefs = toggleTool(prefs, name)
  }
  const selection = resolveToolSelection(prefs, REGISTERED)
  assert.deepEqual(selection.enabled, ['kg_search', 'predict'])
  assert.deepEqual(selection.allowTools, ['kg_search', 'predict'])
  assert.deepEqual(buildRequestOptions(selection), { allowTools: ['kg_search', 'predict'] })
})

test('disabling every tool blocks sending, and read-only alone can block a single-tool catalog', () => {
  let prefs = createDefaultToolPrefs()
  for (const name of REGISTERED) prefs = toggleTool(prefs, name)
  const empty = resolveToolSelection(prefs, REGISTERED)
  assert.equal(empty.blocked, true)
  assert.deepEqual(empty.enabled, [])
  assert.deepEqual(empty.allowTools, [])

  const blockedByReadOnly = resolveToolSelection(setReadOnly(createDefaultToolPrefs(), true), ['recipe_optimize'])
  assert.equal(blockedByReadOnly.blocked, true)

  const reEnabled = toggleTool(prefs, 'predict')
  assert.equal(resolveToolSelection(reEnabled, REGISTERED).blocked, false)
})

test('unknown or missing tool names never widen or break the selection', () => {
  const unknown = { disabled: ['nope', 'recipe_optimize'], readOnly: false }
  assert.deepEqual(resolveToolSelection(unknown, REGISTERED).allowTools, REGISTERED.filter(name => name !== 'recipe_optimize'))
  // 工具清单还没加载时，保持默认请求
  const noCatalog = resolveToolSelection(createDefaultToolPrefs(), [])
  assert.equal(noCatalog.allowTools, undefined)
  assert.equal(noCatalog.blocked, false)
})

test('prefs parsing is defensive and toggles stay immutable', () => {
  assert.deepEqual(parseToolPrefs(null), { disabled: [], readOnly: false })
  assert.deepEqual(parseToolPrefs('not json'), { disabled: [], readOnly: false })
  assert.deepEqual(parseToolPrefs([1, 2]), { disabled: [], readOnly: false })
  assert.deepEqual(parseToolPrefs('{"disabled":["predict","predict",7,null," "],"readOnly":"yes"}'), {
    disabled: ['predict'],
    readOnly: false
  })
  assert.deepEqual(parseToolPrefs({ disabled: 'predict', readOnly: true }), { disabled: [], readOnly: true })

  const base = createDefaultToolPrefs()
  const off = toggleTool(base, 'predict')
  assert.deepEqual(base.disabled, [])
  assert.deepEqual(off.disabled, ['predict'])
  assert.deepEqual(toggleTool(off, 'predict').disabled, [])
  assert.deepEqual(setReadOnly(base, true), { disabled: [], readOnly: true })
  assert.deepEqual(base, { disabled: [], readOnly: false })
})

test('selection survives a reload through localStorage, and storage failures are tolerated', () => {
  const storage = fakeStorage()
  const prefs = setReadOnly(toggleTool(createDefaultToolPrefs(), 'web_browse'), true)
  assert.equal(saveToolPrefs(prefs, storage), true)
  assert.deepEqual(loadToolPrefs(storage), { disabled: ['web_browse'], readOnly: true })
  assert.deepEqual(JSON.parse(storage.dump()[AGENT_TOOL_PREFS_KEY]), {
    disabled: ['web_browse'],
    readOnly: true
  })

  storage.setItem(AGENT_TOOL_PREFS_KEY, '{{{')
  assert.deepEqual(loadToolPrefs(storage), { disabled: [], readOnly: false })

  const throwing = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') }
  }
  assert.deepEqual(loadToolPrefs(throwing), { disabled: [], readOnly: false })
  assert.equal(saveToolPrefs(prefs, throwing), false)
  assert.deepEqual(loadToolPrefs(undefined), { disabled: [], readOnly: false })
})

test('the exact options.allowTools reaches the wire for each mode', async () => {
  const bodies = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => {
      bodies.push(JSON.parse(raw))
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write('data: {"type":"final","text":"ok"}\n\n')
      response.write('data: {"type":"done","steps":1}\n\n')
      response.end()
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const { useAgentChat } = await import('../src/platform/agent/useAgentChat.js')

  function chatFor(prefs) {
    return useAgentChat({
      baseUrl,
      getRequestOptions: () => buildRequestOptions(resolveToolSelection(prefs, REGISTERED))
    })
  }

  try {
    await chatFor(createDefaultToolPrefs()).send('默认')
    await chatFor(setReadOnly(createDefaultToolPrefs(), true)).send('只读')
    let narrowed = createDefaultToolPrefs()
    for (const name of REGISTERED) if (name !== 'predict' && name !== 'kg_search') narrowed = toggleTool(narrowed, name)
    await chatFor(narrowed).send('只留两个')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }

  assert.equal(bodies.length, 3)
  assert.equal('allowTools' in bodies[0].options, false)
  assert.deepEqual(bodies[0].options, {})
  assert.deepEqual(bodies[1].options, {
    allowTools: ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'web_browse']
  })
  assert.deepEqual(bodies[2].options, { allowTools: ['kg_search', 'predict'] })
})
