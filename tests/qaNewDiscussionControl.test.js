import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { findRenderedNode, mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'

const source = file => readFile(new URL(file, import.meta.url), 'utf8')

test('legacy utility rail does not duplicate session or mode actions', async () => {
  const fixture = await mountSfcWithMemoryRouter('/src/features/qa/RecentConversationsPanel.vue', '/')
  try {
    assert.equal(findRenderedNode(fixture.root, node => node?.type === 'button' && /新建讨论|退出多轮|会话历史|示例问题/.test(renderedText(node))), null)
  } finally {
    await fixture.close()
  }
})

test('QA topbar holds only page info/status and graph scope (no action buttons)', async () => {
  // 2026-10-18：页头按要求精简为「左侧页面信息/状态 + 右侧图谱选择」；
  // 图谱项目/报告中心/新建会话 不再出现在 QA 页头（入口在侧边栏与 Agent 面板）。
  const view = await source('../src/views/AscQaView.vue')
  const headerStart = view.indexOf('<header class="qa-topbar">')
  const headerEnd = view.indexOf('</header>', headerStart)
  const header = view.slice(headerStart, headerEnd)
  assert.ok(headerStart >= 0 && headerEnd > headerStart, '未找到 QA 页头')
  assert.ok(!/qa-topbar__action/.test(header), 'QA 页头不应再包含操作按钮')
  assert.match(header, /qa-topbar__info/)
  assert.match(header, /qa-project-context/)
  const fixture = await mountSfcWithMemoryRouter('/src/features/qa/RecentConversationsPanel.vue', '/', { mode: 'single' })
  try {
    assert.equal(findRenderedNode(fixture.root, node => ['button', 'a'].includes(node?.type) && /图谱项目|报告中心|新建讨论|退出多轮/.test(renderedText(node))), null)
  } finally {
    await fixture.close()
  }
})

test('primary Agent workspace omits the legacy utility rail', async () => {
  const view = await source('../src/views/AscQaView.vue')
  assert.ok(view.includes('v-if="!qaState.evidenceOpen && (qaState.mode !== \'multi\' || useLegacyDiscussion)"'))
  assert.match(view, /<AgentPanel/)
})

test('Agent owns history and new-session entries', async () => {
  const panel = await source('../src/platform/agent/AgentPanel.vue')
  assert.match(panel, /会话历史/)
  assert.match(panel, /新建会话/)
  assert.match(panel, /newSession/)
  // Running locks and history restore are exercised in agentWorkspaceUi.test.js and agentSessionUi.test.js.
})

test('legacy rail does not reserve a fixed column from the QA page', async () => {
  const view = await source('../src/views/AscQaView.vue')
  assert.match(view, /\.qa-layout--recent\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s)
  assert.doesNotMatch(view, /\.qa-layout--recent\s*\{[^}]*176px/s)
})

test('switching mode does not clear saved graph discussion history', async () => {
  const view = await source('../src/views/AscQaView.vue')
  const handler = view.slice(view.indexOf('async function updateMode(mode)'), view.indexOf('function chooseCitation'))
  assert.ok(handler)
  assert.doesNotMatch(handler, /clearSavedMultiDiscussion|startNewDiscussion/)
  assert.match(handler, /selectQaMode/)
})
