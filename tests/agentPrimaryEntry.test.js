import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { sessionMessagesToChat } from '../src/platform/agent/sessions.js'

const MODULE = '/src/platform/agent/AgentPanel.vue'
const ev = { evidence_id: 'ev_' + 'a'.repeat(24), text: 'API完整片段：温度为1500℃。',
  title: '原文标题', source_id: 'paper1', locator: { page: 3 }, citation_eligible: true }
const check = { status: 'citations_valid_support_unverified', semantic_support_verified: false }
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`
async function invoke(node, name, value) {
  assert.ok(node, `missing ${name} target`)
  const handlers = Array.isArray(node.props[name]) ? node.props[name] : [node.props[name]]
  for (const handler of handlers) if (typeof handler === 'function') await handler(value)
  await nextTick()
}
const event = { preventDefault() {}, stopPropagation() {} }

test('smart conversation defaults to Agent on the main workspace, legacy and deep research retained', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  assert.match(source, /const useLegacyDiscussion = ref\(false\)/)
  assert.match(source, /<AgentPanel\s+v-else\s+ref="multiDiscussionPanel"/)
  assert.match(source, /:graph-id="activeProject\?\.graphId/)
  assert.match(source, /<MultiDiscussionPanel\s+v-if="useLegacyDiscussion"/)
  assert.match(source, /<QuestionComposer\s+v-if="useLegacyDiscussion"/)
  assert.match(source, /if \(!useLegacyDiscussion\.value\)[\s\S]*?submitExternal\(payload\)/)
  assert.match(source, /<section v-else-if="showQaHome"/)
})

test('composer uses real Agent wire contract and restores citations and full quote after history reload', async (t) => {
  const previous = globalThis.fetch
  const requests = []
  const saved = { sessionId: 'ui-session', researchState: { scope: { projectId: 'p1', graphId: 'g1' } },
    messages: [{ role: 'user', content: '温度条件？' }, { role: 'assistant', content: `待核验 [${ev.evidence_id}]`,
      answer_check: check, citations: [ev], evidence: [ev] }] }
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url)
    if (path.endsWith('/stream')) {
      requests.push(JSON.parse(init.body))
      return new Response([
        frame({ type: 'tool_call', id: 'r1', name: 'read_evidence', args: { evidence_id: ev.evidence_id } }),
        frame({ type: 'tool_result', id: 'r1', name: 'read_evidence', ok: true, data: ev, ms: 123 }),
        frame({ type: 'final', text: `待核验 [${ev.evidence_id}]`, answer_check: check, citations: [ev] }),
        frame({ type: 'done', steps: 2, sessionId: 'ui-session' })].join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const data = path.endsWith('/tools') ? { tools: [{ name: 'read_evidence' }] }
      : init.method === 'POST' ? { sessionId: 'ui-session' }
        : path.includes('/sessions?') ? [{ sessionId: 'ui-session', title: '历史温度讨论', turns: 1 }] : saved
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = previous })
  // 会话历史入口只在独立面板存在（嵌入态由页面右侧目录管理），故此处用非嵌入挂载
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { embedded: false, projectId: 'p1', graphId: 'g1' })
  try {
    const input = findRenderedNode(fixture.root, (n) => n.type === 'textarea')
    await invoke(input, 'onUpdate:modelValue', '温度条件？')
    await invoke(findRenderedNode(fixture.root, (n) => n.type === 'form'), 'onSubmit', event)
    assert.deepEqual(requests[0].context, { projectId: 'p1', graphId: 'g1' })
    assert.equal(requests[0].sessionId, 'ui-session')
    assert.match(renderedText(fixture.root), /原文支持度尚未核验/)
    assert.match(renderedText(fixture.root), /API完整片段/)
    assert.match(renderedText(fixture.root), /0\.1 秒/)
    const button = (label) => findRenderedNode(fixture.root, (n) => n.type === 'button' && renderedText(n).trim() === label)
    await invoke(button('会话历史'), 'onClick', event)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await nextTick()
    await invoke(findRenderedNode(fixture.root, (n) => n.type === 'button' && renderedText(n).includes('历史温度讨论')), 'onClick', event)
    assert.match(renderedText(fixture.root), /API完整片段/)
    assert.equal(requests.length, 1, 'history opening does not regenerate an answer')
    saved.researchState.scope.graphId = 'other-graph'
    await invoke(button('会话历史'), 'onClick', event)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await nextTick()
    await invoke(findRenderedNode(fixture.root, (n) => n.type === 'button' && renderedText(n).includes('历史温度讨论')), 'onClick', event)
    assert.match(renderedText(fixture.root), /不属于当前图谱/)
    assert.equal(requests.length, 1)
  } finally { await fixture.close() }
})

test('historical check and full evidence survive view model mapping', () => {
  const [message] = sessionMessagesToChat([{ role: 'assistant', content: '回答', answer_check: check, citations: [ev], evidence: [ev] }])
  assert.deepEqual(message.answer_check, check)
  assert.deepEqual(message.evidence, [ev])
  assert.deepEqual(message.citations, [ev])
})

test('embedded Agent without selected graph disables its primary composer', async (t) => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ tools: [] }))
  t.after(() => { globalThis.fetch = previous })
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { embedded: true })
  try {
    const input = findRenderedNode(fixture.root, (n) => n.type === 'textarea')
    assert.equal(input.props.disabled, true)
    await invoke(input, 'onUpdate:modelValue', '不能发送')
    await invoke(findRenderedNode(fixture.root, (n) => n.type === 'form'), 'onSubmit', event)
    assert.match(renderedText(fixture.root), /请先选择当前图谱项目/)
  } finally { await fixture.close() }
})
