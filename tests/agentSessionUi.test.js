import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { findRenderedNode, mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'

const MODULE = '/src/platform/agent/AgentPanel.vue'
const TOOLS = ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'recipe_optimize', 'web_browse']

const SESSIONS = [
  { sessionId: 's-1', title: '热震稳定性检索', createdAt: '2026-09-16T08:00:00Z', updatedAt: '2026-09-16T09:00:00Z', turns: 2 },
  { sessionId: 's-2', title: '体积密度预测', createdAt: '2026-09-15T08:00:00Z', updatedAt: '2026-09-15T08:00:00Z', turns: 1 }
]

const DETAIL = {
  sessionId: 's-1',
  title: '热震稳定性检索',
  createdAt: '2026-09-16T08:00:00Z',
  updatedAt: '2026-09-16T09:00:00Z',
  messages: [
    { role: 'user', content: '检索热震稳定性' },
    {
      role: 'assistant',
      content: '找到 2 条证据',
      toolCalls: [{ name: 'kg_search', argsSummary: '{"query":"热震"}', ok: true, ms: 1200 }]
    }
  ]
}

const METRICS = {
  turns: 3,
  toolCalls: 5,
  toolErrors: 1,
  avgTurnMs: 4200,
  tokens: { prompt: 1200, completion: 340, total: 1540, reported: true },
  tools: { predict: { calls: 3, errors: 0, avgMs: 900 }, kg_search: { calls: 2, errors: 1, avgMs: 2100 } }
}

function sseResponse(chunks) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function frame(id, payload) {
  return `id: ${id}\ndata: ${JSON.stringify(payload)}\n\n`
}

/** fetch 桩：JSON 端点 + 可编程的 SSE 流（每次 /stream 调用取下一个 responder）。 */
function installFetchStub({ streams = [] } = {}) {
  const calls = []
  let streamIndex = 0
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ url: href, method: init.method || 'GET', body })
    const json = payload => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
    if (href.endsWith('/api/agent/tools')) {
      return json({ tools: TOOLS.map(name => ({ name, description: `${name} 说明` })) })
    }
    if (href.endsWith('/api/agent/metrics')) return json(METRICS)
    if (href.endsWith('/api/agent/sessions?limit=20')) return json(SESSIONS)
    if (href.endsWith('/api/agent/sessions') && (init.method || 'GET') === 'POST') {
      return json({ sessionId: 's-new', title: body?.title || '新会话', createdAt: '2026-09-17T00:00:00Z' })
    }
    if (href.includes('/api/agent/sessions/s-1')) return json(DETAIL)
    if (href.includes('/api/agent/stream')) {
      const responder = streams[Math.min(streamIndex, streams.length - 1)]
      streamIndex += 1
      if (!responder) throw new Error('unstubbed stream')
      return sseResponse(responder(body))
    }
    return new Response('not stubbed', { status: 404 })
  }
  return calls
}

async function waitFor(assertion, message) {
  let lastError
  for (let attempt = 0; attempt < 300; attempt += 1) {
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
  for (const handler of handlers) if (typeof handler === 'function') {
    await handler({ stopPropagation() {}, preventDefault() {} })
  }
  await nextTick()
}

async function clickNode(node) {
  const handlers = Array.isArray(node?.props?.onClick) ? node.props.onClick : [node?.props?.onClick]
  for (const handler of handlers) if (typeof handler === 'function') {
    await handler({ stopPropagation() {}, preventDefault() {} })
  }
  await nextTick()
}

/** v-model 在内存渲染器里就是 onUpdate:modelValue 回调。 */
async function type(root, value) {
  const textarea = findRenderedNode(root, node => node?.type === 'textarea')
  assert.ok(textarea, 'the composer textarea must exist')
  const handlers = Array.isArray(textarea.props['onUpdate:modelValue'])
    ? textarea.props['onUpdate:modelValue']
    : [textarea.props['onUpdate:modelValue']]
  for (const handler of handlers) if (typeof handler === 'function') handler(value)
  await nextTick()
}

async function submit(root) {
  const form = findRenderedNode(root, node => node?.type === 'form')
  assert.ok(form, 'the composer form must exist')
  const handlers = Array.isArray(form.props.onSubmit) ? form.props.onSubmit : [form.props.onSubmit]
  for (const handler of handlers) if (typeof handler === 'function') {
    await handler({ preventDefault() {}, stopPropagation() {} })
  }
}

/** 记住并接管全局 fetch/localStorage，返回还原函数。 */
function installStorage() {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)) },
    removeItem: key => { values.delete(key) }
  }
  return () => {
    globalThis.fetch = previousFetch
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
}

test('会话历史 opens a past session, replays its messages and continues on the same sessionId', async () => {
  const restore = installStorage()
  const calls = installFetchStub({
    streams: [() => [
      frame(1, { type: 'message_delta', text: '继续检索' }),
      frame(2, { type: 'final', text: '续答完成' }),
      frame(3, { type: 'done', steps: 1, sessionId: 's-1', turnIndex: 2 })
    ]]
  })
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')

    await click(root, '会话历史')
    await waitFor(() => assert.match(renderedText(root), /热震稳定性检索/), 'session list never rendered')
    assert.ok(calls.some(call => call.url.endsWith('/api/agent/sessions?limit=20')))
    assert.match(renderedText(root), /2 轮 · /)
    assert.match(renderedText(root), /体积密度预测/)

    // 打开历史会话
    await clickNode(findRenderedNode(root, node => (
      node?.type === 'button' && renderedText(node).includes('热震稳定性检索')
    )))
    await waitFor(() => assert.match(renderedText(root), /找到 2 条证据/), 'history messages never rendered')
    assert.ok(calls.some(call => call.url.endsWith('/api/agent/sessions/s-1')))
    assert.match(renderedText(root), /检索热震稳定性/)
    assert.match(renderedText(root), /kg_search/)
    assert.match(renderedText(root), /会话 s-1/)

    // 在同一会话里继续对话：不应新建会话
    await type(root, '继续检索抗热震证据')
    await submit(root)
    await waitFor(() => assert.match(renderedText(root), /续答完成/), 'the continued answer never rendered')

    const createCalls = calls.filter(call => call.url.endsWith('/api/agent/sessions') && call.method === 'POST')
    assert.equal(createCalls.length, 0, 'an opened session must be reused, not recreated')
    const streamCall = calls.find(call => call.url.endsWith('/api/agent/stream'))
    assert.equal(streamCall.body.sessionId, 's-1')
    assert.equal(streamCall.body.messages.at(-1).content, '继续检索抗热震证据')
  } finally {
    await fixture.close()
    restore()
  }
})

test('the first question lazily creates a session before streaming', async () => {
  const restore = installStorage()
  const calls = installFetchStub({
    streams: [() => [
      frame(1, { type: 'message_delta', text: '预测中' }),
      frame(2, { type: 'final', text: '体积密度 3.12' }),
      frame(3, { type: 'done', steps: 1, sessionId: 's-new', turnIndex: 0 })
    ]]
  })
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')
    await type(root, '用 X_comp=[[61,70]] 预测体积密度')
    await submit(root)
    await waitFor(() => assert.match(renderedText(root), /体积密度 3.12/), 'the answer never rendered')

    const createCall = calls.find(call => call.url.endsWith('/api/agent/sessions') && call.method === 'POST')
    assert.ok(createCall, 'the panel must create a session before the first turn')
    // 标题建议按 24 字截断，保持头部会话标签紧凑
    assert.equal(createCall.body.title, '用 X_comp=[[61,70]] 预测体积…')
    assert.equal(calls.find(call => call.url.endsWith('/api/agent/stream')).body.sessionId, 's-new')
    assert.match(renderedText(root), /会话 s-new/)
  } finally {
    await fixture.close()
    restore()
  }
})

test('运行指标 shows the aggregated line, token usage and per-tool breakdown', async () => {
  const restore = installStorage()
  const calls = installFetchStub()
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')
    assert.ok(!calls.some(call => call.url.endsWith('/api/agent/metrics')), 'metrics must be lazy')

    await click(root, '运行指标')
    await waitFor(() => assert.match(renderedText(root), /轮次 3 · 工具调用 5 · 失败 1 · 平均 4.2s/), 'metrics never rendered')
    assert.match(renderedText(root), /tokens 提示 1.2k · 生成 340 · 合计 1.5k/)
    assert.match(renderedText(root), /predict/)
    assert.match(renderedText(root), /3 次/)
    assert.match(renderedText(root), /平均 900ms/)
    assert.match(renderedText(root), /失败 1（50%）/)

    const panel = findRenderedNode(root, node => node?.props?.id === 'agent-metrics')
    assert.equal(panel.props['aria-label'], '运行指标')
    assert.equal(findButton(root, '运行指标').props['aria-expanded'], true)
  } finally {
    await fixture.close()
    restore()
  }
})

test('a timed-out turn offers 从断点续传 and resumes from the last frame id', async () => {
  const restore = installStorage()
  const calls = installFetchStub({
    streams: [
      () => [
        frame(1, { type: 'message_delta', text: '正在检索' }),
        frame(2, { type: 'tool_call', id: 't1', name: 'kg_search', args: { query: '热震' } }),
        frame(3, { type: 'error', message: '整轮超过 300000ms 上限', code: 'turn_timeout' }),
        frame(4, { type: 'done', steps: 1, sessionId: 's-r', turnIndex: 0 })
      ],
      () => [
        frame(5, { type: 'message_delta', text: '补齐' }),
        frame(6, { type: 'final', text: '续传后的结论' }),
        frame(7, { type: 'done', steps: 1, sessionId: 's-r', turnIndex: 0 })
      ]
    ]
  })
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')
    await type(root, '检索热震稳定性证据')
    await submit(root)

    await waitFor(() => assert.match(renderedText(root), /整轮超过 300000ms 上限/), 'the timeout never surfaced')
    await waitFor(() => assert.ok(findButton(root, '从断点续传')), 'no resume affordance')
    assert.match(renderedText(root), /续传点：事件 #4/)

    await click(root, '从断点续传')
    await waitFor(() => assert.match(renderedText(root), /续传后的结论/), 'the resumed answer never rendered')

    const streams = calls.filter(call => call.url.endsWith('/api/agent/stream'))
    assert.equal(streams.length, 2)
    assert.deepEqual(streams[1].body, {
      messages: [],
      context: { projectId: 'p1' },
      options: {},
      sessionId: 's-r',
      resumeFromEventId: 4
    })
    assert.ok(!renderedText(root).includes('整轮超过 300000ms 上限'), 'the promise of a resume clears the error')
    assert.equal(findButton(root, '从断点续传'), null)
  } finally {
    await fixture.close()
    restore()
  }
})

test('删除 asks for confirmation and only then hits the API', async () => {
  const restore = installStorage()
  const calls = installFetchStub()
  const removed = []
  const previousFetch = globalThis.fetch
  const inner = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/api/agent/sessions/s-2') && (init.method || 'GET') === 'DELETE') {
      removed.push('s-2')
      return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 })
    }
    if (String(url).endsWith('/api/agent/sessions?limit=20')) {
      const left = SESSIONS.filter(session => !removed.includes(session.sessionId))
      return new Response(JSON.stringify(left), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return inner(url, init)
  }
  calls.length = 0
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')
    await click(root, '会话历史')
    await waitFor(() => assert.match(renderedText(root), /体积密度预测/), 'session list never rendered')

    const deleteButton = findRenderedNode(root, node => (
      node?.type === 'button' && node.props['aria-label'] === '删除会话 体积密度预测'
    ))
    assert.ok(deleteButton, 'each session row needs a delete control')
    await clickNode(deleteButton)
    assert.ok(findButton(root, '确认删除'), 'deleting must require a second click')
    assert.ok(findButton(root, '取消'))
    assert.equal(removed.length, 0, 'nothing may be deleted before confirmation')

    await click(root, '取消')
    assert.equal(findButton(root, '确认删除'), null)
    assert.equal(removed.length, 0)

    await clickNode(findRenderedNode(root, node => (
      node?.type === 'button' && node.props['aria-label'] === '删除会话 体积密度预测'
    )))
    await click(root, '确认删除')
    await waitFor(() => assert.equal(removed.length, 1), 'the confirmed delete never reached the API')
    await waitFor(() => assert.ok(!renderedText(root).includes('体积密度预测')), 'the deleted session stayed in the list')
  } finally {
    await fixture.close()
    restore()
  }
})

test('新建会话 creates a server session and clears the log', async () => {
  const restore = installStorage()
  const calls = installFetchStub({
    streams: [
      () => [
        frame(1, { type: 'final', text: '第一次回答' }),
        frame(2, { type: 'done', steps: 1, sessionId: 's-x', turnIndex: 0 })
      ],
      () => [
        frame(1, { type: 'final', text: '新会话回答' }),
        frame(2, { type: 'done', steps: 1, sessionId: 's-new', turnIndex: 0 })
      ]
    ]
  })
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { projectId: 'p1' })
  const { root } = fixture
  try {
    await waitFor(() => assert.match(renderedText(root), /已启用 7\/7/), 'tools never loaded')
    await type(root, '第一问')
    await submit(root)
    await waitFor(() => assert.match(renderedText(root), /第一次回答/), 'the first answer never rendered')

    await click(root, '新建会话')
    await waitFor(() => assert.match(renderedText(root), /会话 s-new/), 'the new session id never appeared')
    assert.ok(!renderedText(root).includes('第一次回答'), 'a new session starts from an empty log')
    assert.match(renderedText(root), /从一次真实的工具调用开始/)
    // 第一轮惰性建了会话，点“新建会话”又建了一条
    assert.equal(calls.filter(call => call.url.endsWith('/api/agent/sessions') && call.method === 'POST').length, 2)
  } finally {
    await fixture.close()
    restore()
  }
})
