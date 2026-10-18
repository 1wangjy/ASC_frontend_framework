import test from 'node:test'
import assert from 'node:assert/strict'
import axios from 'axios'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

test('actual research workspace switches Tabs, locks navigation during Agent execution, stops and changes scope', async () => {
  const original = { fetch: globalThis.fetch, storage: globalThis.localStorage, adapter: axios.defaults.adapter }
  const stored = new Map()
  globalThis.localStorage = { getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }
  const projects = [{ project_id: 'p1', graph_id: 'g1', project_name: '项目一', status: 'graph_completed', graph_build_stage: 'professional' },
    { project_id: 'p2', graph_id: 'g2', project_name: '项目二', status: 'graph_completed', graph_build_stage: 'professional' }]
  axios.defaults.adapter = async config => ({ status: 200, statusText: 'OK', config, headers: {},
    data: { success: true, data: config.url.includes('project/list') ? projects : [] } })
  let controller
  let aborted = false
  const requests = []
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/stop')) return Response.json({ ok: true, stopping: true })
    if (String(url).endsWith('/models')) return Response.json({ models: [{ id: 'default', label: '模拟模型', model: 'mock', configured: true }] })
    if (String(url).endsWith('/tools')) return Response.json({ tools: [{ name: 'kg_search' }] })
    if (String(url).endsWith('/sessions')) return Response.json({ sessionId: 'workspace-session' })
    requests.push(JSON.parse(init.body))
    return new Response(new ReadableStream({ start(c) {
      controller = c
      init.signal.addEventListener('abort', () => { aborted = true; c.error(new DOMException('aborted', 'AbortError')) }, { once: true })
    } }), { headers: { 'content-type': 'text/event-stream' } })
  }
  let fixture
  const invoke = async (node, name = 'onClick', value = { preventDefault() {}, stopPropagation() {} }) => {
    assert.ok(node, `missing ${name} target`)
    for (const handler of [node.props[name]].flat()) if (typeof handler === 'function') await handler(value)
    await nextTick()
  }
  const button = label => findRenderedNode(fixture.root, n => n.type === 'button' && renderedText(n).trim() === label)
  const waitFor = async predicate => {
    for (let i = 0; i < 150; i++) {
      await nextTick()
      if (predicate()) return
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error('workspace_state_wait_timeout: ' + renderedText(fixture.root).slice(0, 500))
  }
  try {
    fixture = await mountSfcWithMemoryRouter('/src/views/AscQaView.vue', '/research?mode=multi&projectId=p1')
    await waitFor(() => !!findRenderedNode(fixture.root, n => n.props.id === 'agent-panel-input' && !n.props.disabled))
    assert.ok(renderedText(fixture.root).includes('项目一'))
    await invoke(button('深度研究'))
    assert.ok(renderedText(fixture.root).includes('今天想研究什么'))
    assert.equal(findRenderedNode(fixture.root, n => n.props.id === 'agent-panel-input'), null)
    const countModeGroups = node => (node.props?.['aria-label'] === '问答模式' ? 1 : 0)
      + (node.children || []).reduce((count, child) => count + countModeGroups(child), 0)
    assert.equal(countModeGroups(fixture.root), 1, 'deep research must not duplicate its shared Tab controls')
    const sharedIntro = () => findRenderedNode(fixture.root, n =>
      typeof n.props.class === 'string' && n.props.class.includes('qa-research-intro'))
    assert.ok(sharedIntro())
    assert.ok(findRenderedNode(sharedIntro(), n => n.props['aria-label'] === '问答模式'))
    await invoke(button('智能会话'))
    await waitFor(() => !!findRenderedNode(fixture.root, n => n.props.id === 'agent-panel-input'))
    assert.equal(countModeGroups(fixture.root), 1)
    assert.ok(findRenderedNode(sharedIntro(), n => n.props['aria-label'] === '问答模式'))
    await invoke(findRenderedNode(fixture.root, n => n.props.id === 'agent-panel-input'), 'onUpdate:modelValue', '项目一问题')
    const pending = invoke(findRenderedNode(fixture.root, n => n.type === 'form'), 'onSubmit')
    await waitFor(() => !!controller)
    await waitFor(() => fixture.router.currentRoute.value.query.agentSession === 'workspace-session')
    assert.deepEqual(requests[0].context, { projectId: 'p1', graphId: 'g1' })
    assert.equal(button('深度研究').props.disabled, true)
    assert.equal(findRenderedNode(fixture.root, n => n.type === 'button' && renderedText(n).includes('原知识对话（兼容入口）')), null)
    const projectButton = findRenderedNode(fixture.root, n => n.type === 'button' && n.parent?.props.class?.includes('qa-project-context'))
    assert.ok(projectButton)
    assert.equal(projectButton.props.disabled, true)
    controller.enqueue(new TextEncoder().encode('data: {"type":"tool_call","id":"t1","name":"kg_search","args":{"query":"材料"}}\n\n'))
    await waitFor(() => renderedText(fixture.root).includes('工具执行中'))
    await invoke(button('停止'))
    await pending
    assert.equal(aborted, true)
    assert.ok(!renderedText(fixture.root).includes('工具执行中'), 'stopped tools must not remain visually running')
    assert.ok(renderedText(fixture.root).includes('已停止'))
    assert.ok(!renderedText(fixture.root).includes('执行失败'), 'user stop is not a service failure')
    assert.equal(button('深度研究').props.disabled, false)
    await invoke(projectButton)
    await waitFor(() => !!findRenderedNode(fixture.root, n => n.type === 'button' && renderedText(n).includes('项目二') && renderedText(n).includes('选择')))
    await invoke(findRenderedNode(fixture.root, n => n.type === 'button' && renderedText(n).includes('项目二') && renderedText(n).includes('选择')))
    await waitFor(() => renderedText(fixture.root).includes('项目二') && !renderedText(fixture.root).includes('项目一问题'))
    await waitFor(() => !fixture.router.currentRoute.value.query.agentSession)
    assert.equal(requests.length, 1, 'scope changes must not resend old messages')
  } finally {
    if (fixture) await fixture.close()
    globalThis.fetch = original.fetch
    axios.defaults.adapter = original.adapter
    if (original.storage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original.storage
  }
})

test('research page history URL selects its project and restores messages without resending', async () => {
  const original = { fetch: globalThis.fetch, adapter: axios.defaults.adapter }
  const calls = []
  let projectRequests = 0
  axios.defaults.adapter = async config => {
    // Browser reload: the monitor's later startup request supersedes the first
    // route request, but returns later. An immediate mock masks this race.
    if (config.url.includes('project/list')) {
      projectRequests++
      await new Promise(resolve => setTimeout(resolve, projectRequests === 1 ? 5 : 80))
    }
    return { status: 200, statusText: 'OK', config, headers: {},
    data: { success: true, data: config.url.includes('project/list')
      ? [{ project_id: 'p1', graph_id: 'g1', project_name: '项目一', status: 'graph_completed', graph_build_stage: 'professional' }] : [] } }
  }
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url).endsWith('/sessions/linked')) return Response.json({ sessionId: 'linked',
      researchState: { scope: { projectId: 'p1', graphId: 'g1' } }, messages: [
        { role: 'user', content: '链接中的历史问题' }, { role: 'assistant', content: '保存的安全提示',
          answer_check: { status: 'blocked' }, model: { id: 'default', name: 'actual-model' } }] })
    if (String(url).endsWith('/models')) return Response.json({ models: [{ id: 'default', model: 'mock', configured: true }] })
    return Response.json({ tools: [{ name: 'kg_search' }] })
  }
  let fixture
  try {
    fixture = await mountSfcWithMemoryRouter('/src/views/AscQaView.vue', '/research?mode=multi&projectId=p1&agentSession=linked')
    for (let i = 0; i < 150 && !renderedText(fixture.root).includes('链接中的历史问题'); i++) {
      await new Promise(resolve => setTimeout(resolve, 20)); await nextTick()
    }
    assert.ok(renderedText(fixture.root).includes('链接中的历史问题'))
    assert.ok(findRenderedNode(fixture.root, n => String(n.props.class || '').includes('qa-multi-page__workspace--agent')))
    assert.ok(findRenderedNode(fixture.root, n => n.type === 'textarea' && n.props.id === 'agent-panel-input' && !n.props.disabled))
    assert.ok(renderedText(fixture.root).includes('引用检查未通过'))
    assert.ok(!calls.some(url => url.endsWith('/stream')))
    assert.equal(fixture.router.currentRoute.value.query.agentSession, 'linked')
  } finally {
    if (fixture) await fixture.close()
    globalThis.fetch = original.fetch
    axios.defaults.adapter = original.adapter
  }
})
