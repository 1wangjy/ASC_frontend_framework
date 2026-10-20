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
    const select = findRenderedNode(fixture.root, (n) => n.type === 'select' && n.props['aria-label'] === '主模型')
    const auxiliary = findRenderedNode(fixture.root, (n) => n.type === 'select' && n.props['aria-label'] === '辅助模型')
    assert.ok(auxiliary)
    assert.equal(auxiliary.props.value, '')
    assert.doesNotMatch(renderedText(fixture.root), /本轮模型/)
    for (const name of ['JEV', 'LLaVA']) {
      const pending = findRenderedNode(auxiliary, (n) => n.type === 'option' && renderedText(n).includes(name))
      assert.ok(Object.hasOwn(pending.props, 'disabled') && pending.props.disabled !== false)
    }
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
    const configEvent = { target: { value: '__local_config' } }
    await invoke(select, 'onChange', configEvent)
    assert.equal(configEvent.target.value, 'default')
    assert.match(renderedText(fixture.root), /部署本身尚未完成/)
    assert.match(renderedText(fixture.root), /keyEnv/)
    await invoke(select, 'onChange', { target: { value: '__cloud_config' } })
    assert.match(renderedText(fixture.root), /自定义云模型由管理员登记/)
    const auxiliaryEvent = { target: { value: '__auxiliary_config' } }
    await invoke(auxiliary, 'onChange', auxiliaryEvent)
    assert.equal(auxiliaryEvent.target.value, '')
    assert.match(renderedText(fixture.root), /目前尚未接入辅助模型调用/)
    assert.equal(bodies.length, 2, 'opening configuration must not invoke the model')
    await send()
    assert.equal(bodies[2].modelId, 'default', 'configuration actions never replace the main provider')
    assert.ok(!Object.hasOwn(bodies[2], 'auxiliaryModelId'), 'unconfigured auxiliary model stays unused')
  } finally { await fixture.close() }
})
