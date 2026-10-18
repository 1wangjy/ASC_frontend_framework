import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

// Explicit, read-only integration: no model requests, new sessions or deletes.
test('live Vite proxy and primary Agent UI reopen the actual two-turn session', { skip: !process.env.AGENT_LIVE_SESSION_ID }, async () => {
  const id = process.env.AGENT_LIVE_SESSION_ID
  const base = process.env.AGENT_LIVE_UI_URL || 'http://127.0.0.1:3005'
  const original = globalThis.fetch
  const detail = await (await original(`${base}/api/agent/sessions/${id}`)).json()
  const scope = detail.researchState?.scope
  assert.ok(scope?.projectId && scope.graphId)
  globalThis.fetch = (url, init) => original(String(url).startsWith('/') ? base + url : url, init)
  let fixture
  try {
    fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', {
      embedded: true, projectId: scope.projectId, graphId: scope.graphId, initialSessionId: id,
    })
    for (let i = 0; i < 100 && !renderedText(fixture.root).includes(id.slice(0, 8)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await nextTick()
    }
    const output = renderedText(fixture.root)
    assert.ok(output.includes(id.slice(0, 8)), 'the reopened session ID must match, not just its duplicated title')
    const assistants = detail.messages.filter((m) => m.role === 'assistant')
    assert.equal(assistants.length, 2)
    for (const user of detail.messages.filter((m) => m.role === 'user')) assert.ok(output.includes(user.content))
    for (const message of assistants) {
      assert.ok(output.includes(message.content.split('\n')[0]))
      for (const citation of message.citations || []) {
        const evidence = message.evidence.find((item) => item.evidence_id === citation.evidence_id)
        assert.ok(output.includes(evidence.text.slice(0, 60)))
      }
      if (message.answer_check?.status === 'incomplete') assert.ok(output.includes('回答未完成'))
    }
    const latestCheck = assistants.at(-1).answer_check?.status
    const labels = { incomplete: '回答未完成', blocked: '引用检查未通过', citations_valid_support_unverified: '待核验草稿已生成' }
    if (labels[latestCheck]) assert.ok(output.includes(labels[latestCheck]))
    console.log(JSON.stringify({ session_id: id, saved_turns: 2, restored_citations: assistants.reduce((n, m) => n + (m.citations || []).length, 0),
      restored_via_link: true, mode: 'memory-renderer-live-API; not browser visual QA' }))
  } finally {
    if (fixture) await fixture.close()
    globalThis.fetch = original
  }
})
