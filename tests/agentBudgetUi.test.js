import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveToolStatus } from '../src/platform/agent/toolStatus.js'
import { sessionToolCallsToChat } from '../src/platform/agent/sessions.js'
import { toolStatusLabel } from '../src/platform/agent/useAgentChat.js'
import { describeRun } from '../src/platform/agent/runStatus.js'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { nextTick } from 'vue'

test('budget denial stays unsuccessful but differs from transport, scope and tool errors', () => {
  assert.equal(resolveToolStatus({ ok: false, data: { retrieval_budget_exhausted: true } }), 'budget_denied')
  assert.equal(resolveToolStatus({ ok: false, data: { quota_exceeded: true } }), 'budget_denied')
  assert.equal(resolveToolStatus({ ok: false, data: { code: 'scope_mismatch' } }), 'error')
  const tools = sessionToolCallsToChat([{ name: 'rag_search', ok: false, budgetDenied: true }, { name: 'kg_graph', ok: false }], 0)
  assert.equal(tools[0].ok, false)
  assert.equal(toolStatusLabel(tools[0]), '预算拒绝')
  assert.equal(toolStatusLabel(tools[1]), '失败')
  assert.deepEqual(describeRun({ message: { toolCalls: tools } }).counts, { total: 2, completed: 0, denied: 1, failed: 1 })
});

test('saved budget denial restores its own label, colour class and count in the actual panel', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async url => String(url).endsWith('/sessions/budget')
    ? Response.json({ sessionId: 'budget', researchState: { scope: { projectId: 'p', graphId: 'g' } }, messages: [
      { role: 'user', content: 'test' }, { role: 'assistant', content: '缺少证据', toolCalls: [
        { name: 'rag_search', ok: false, budgetDenied: true }, { name: 'read_evidence', ok: false, budgetDenied: true }] }] })
    : String(url).endsWith('/models') ? Response.json({ models: [] }) : Response.json({ tools: [] })
  let fixture
  try {
    fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/', { embedded: true, projectId: 'p', graphId: 'g', initialSessionId: 'budget' })
    for (let i = 0; i < 50 && !renderedText(fixture.root).includes('预算拒绝 2 次'); i++) {
      await new Promise(resolve => setTimeout(resolve, 20)); await nextTick()
    }
    assert.ok(renderedText(fixture.root).includes('预算拒绝 2 次 · 调用异常 0 次'))
    assert.ok(findRenderedNode(fixture.root, node => String(node.props.class || '').includes('agent-tool--budget_denied')))
  } finally { if (fixture) await fixture.close(); globalThis.fetch = original }
})
