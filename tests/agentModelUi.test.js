import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

test('Agent model selection reaches the wire, unavailable models cannot be selected, actual model is displayed', async (t) => {
  const previous = globalThis.fetch
  const bodies = []
  globalThis.fetch = async (url, init = {}) => {
    const p = String(url)
    let payload
    if (p.endsWith('/models')) payload = { default_id: 'default', models: [
      { id: 'default', label: '默认', model: 'flash-fixture', configured: true },
      { id: 'local-ft', label: '本地微调', model: 'ft-fixture', configured: true },
      { id: 'pending', label: '待部署', model: 'unknown', configured: false }] }
    else if (p.endsWith('/tools')) payload = { tools: [{ name: 'read_evidence' }] }
    else if (p.endsWith('/stream')) {
      const body = JSON.parse(init.body); bodies.push(body)
      const model = body.modelId === 'local-ft' ? 'ft-fixture' : 'flash-fixture'
      return new Response([
        { type: 'model_selected', modelId: body.modelId, model },
        { type: 'final', text: '测试草稿' }, { type: 'done', steps: 1, sessionId: 'ui-model' }]
        .map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    } else payload = { sessionId: 'ui-model' }
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = previous })
  const fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', { embedded: true, projectId: 'p1', graphId: 'g1' })
  const invoke = async (node, prop, event) => {
    assert.ok(node)
    for (const handler of [].concat(node.props[prop] || [])) if (typeof handler === 'function') await handler(event)
    await nextTick()
  }
  try {
    for (let i = 0; i < 100 && !renderedText(fixture.root).includes('ft-fixture'); i++) await new Promise((r) => setTimeout(r, 10))
    await nextTick()
    const select = findRenderedNode(fixture.root, (n) => n.type === 'select' && n.props['aria-label'] === 'Agent模型')
    const input = findRenderedNode(fixture.root, (n) => n.type === 'textarea')
    const send = async () => {
      await invoke(input, 'onUpdate:modelValue', '测试模型切换')
      await invoke(findRenderedNode(fixture.root, (n) => n.type === 'form'), 'onSubmit', { preventDefault() {}, stopPropagation() {} })
    }
    await invoke(select, 'onChange', { target: { value: 'local-ft' } })
    await send()
    assert.equal(bodies[0].modelId, 'local-ft')
    assert.ok(!Object.hasOwn(bodies[0], 'apiKey') && !Object.hasOwn(bodies[0], 'apiUrl'))
    assert.match(renderedText(fixture.root), /实际模型：ft-fixture/)
    await invoke(select, 'onChange', { target: { value: 'pending' } })
    assert.equal(select.props.value, 'local-ft')
    await invoke(select, 'onChange', { target: { value: 'default' } })
    await send()
    assert.equal(bodies[1].modelId, 'default')
    assert.match(renderedText(fixture.root), /实际模型：flash-fixture/)
    const config = findRenderedNode(fixture.root, (n) => n.type === 'button' && renderedText(n).trim() === '本地模型配置')
    await invoke(config, 'onClick', { preventDefault() {}, stopPropagation() {} })
    assert.match(renderedText(fixture.root), /部署本身尚未完成/)
    assert.match(renderedText(fixture.root), /keyEnv/)
  } finally { await fixture.close() }
})
