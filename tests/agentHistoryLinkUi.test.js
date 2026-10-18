import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

test('history deep link restores a saved turn and visible check state without generating a new answer', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url).endsWith('/sessions/linked')) return Response.json({ sessionId: 'linked',
      researchState: { scope: { projectId: 'p1', graphId: 'g1' } }, messages: [
        { role: 'user', content: '真实历史问题' }, { role: 'assistant', content: '安全提示',
          answer_check: { status: 'blocked' }, model: { id: 'default', name: 'actual-model' } }] })
    if (String(url).endsWith('/models')) return Response.json({ models: [{ id: 'default', model: 'mock', configured: true }] })
    return Response.json({ tools: [{ name: 'kg_search' }] })
  }
  let fixture
  try {
    fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/',
      { embedded: true, projectId: 'p1', graphId: 'g1', initialSessionId: 'linked' })
    for (let i = 0; i < 50 && !renderedText(fixture.root).includes('真实历史问题'); i++) {
      await new Promise(resolve => setTimeout(resolve, 20)); await nextTick()
    }
    const text = renderedText(fixture.root)
    assert.ok(text.includes('真实历史问题'))
    assert.ok(text.includes('引用检查未通过'))
    assert.ok(text.includes('actual-model'))
    assert.equal(calls.filter(url => url.endsWith('/sessions/linked')).length, 1)
    assert.ok(!calls.some(url => url.endsWith('/stream')))
  } finally { if (fixture) await fixture.close(); globalThis.fetch = original }
})
