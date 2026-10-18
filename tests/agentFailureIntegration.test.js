import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { useAgentChat } from '../src/platform/agent/useAgentChat.js'
import { mapSessionDetail, sessionMessagesToChat } from '../src/platform/agent/sessions.js'

const require = createRequire(import.meta.url)
const express = require('../backend_impl/node_modules/express')
const { createRouter } = require('../backend_impl/src/agent/route.js')
const registry = require('../backend_impl/src/agent/tools')
const sessions = require('../backend_impl/src/agent/sessions.js')
const context = { projectId: 'p', graphId: 'g' }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let i = 0; i < 200; i++) { if (check()) return; await pause(10) }
  assert.fail('fixture condition timed out')
}
const serviceResult = { ok: true, data: { service_answer: { text: '知识服务原答案', references: [],
  scope: { project_id: 'p', graph_id: 'g' } } } }

async function fixture(t, tool, timeoutMs = 5000) {
  const root = path.resolve('backend_impl/data/agent/integration/exception-fixtures')
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.mkdtempSync(path.join(root, 'run-'))
  const oldDir = process.env.AGENT_SESSION_DIR, oldMode = process.env.AGENT_ANSWER_MODE
  process.env.AGENT_SESSION_DIR = dir
  process.env.AGENT_ANSWER_MODE = 'knowledge_service'
  let modelCalls = 0, toolCalls = 0
  t.mock.method(registry, 'runTool', async (...args) => { toolCalls++; return tool(...args) })
  const provider = { available: true, async streamChat() {
    modelCalls++
    return modelCalls === 1 ? { tool_calls: [{ id: 'kg1', function: { name: 'kg_search',
      arguments: JSON.stringify({ query: '测试问题', project_id: 'p', graph_id: 'g' }) } }] }
      : { content: '不得发布的模型替代答案' }
  } }
  const app = express(); app.use(express.json()); app.use('/api/agent', createRouter({ provider }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const created = await (await fetch(`${baseUrl}/api/agent/sessions`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()
  const id = created.sessionId
  const makeChat = () => useAgentChat({ baseUrl, getContext: () => context,
    getRequestOptions: () => ({ timeoutMs }) })
  const chat = makeChat(); chat.adoptSession(id)
  const detail = async () => mapSessionDetail(await (await fetch(`${baseUrl}/api/agent/sessions/${id}`)).json())
  t.after(async () => {
    chat.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    sessions.resetRuntime(id)
    if (oldDir === undefined) delete process.env.AGENT_SESSION_DIR; else process.env.AGENT_SESSION_DIR = oldDir
    if (oldMode === undefined) delete process.env.AGENT_ANSWER_MODE; else process.env.AGENT_ANSWER_MODE = oldMode
  })
  return { chat, makeChat, id, detail, baseUrl, counts: () => ({ modelCalls, toolCalls }) }
}

for (const [name, result, status] of [
  ['no result', { ok: true, data: { evidence: [] }, summary: '未检索到结果' }, 'ok'],
  ['knowledge service unavailable', { ok: false, data: { code: 'upstream_unavailable' }, summary: '知识服务不可用' }, 'error']
]) test(`${name}: terminal status, input recovery, no invented answer`, async t => {
  const f = await fixture(t, async () => result)
  await f.chat.send('测试问题')
  const answer = f.chat.messages.value.at(-1)
  assert.equal(answer.answer_check.status, 'no_service_answer')
  assert.equal(answer.toolCalls[0].status, status)
  assert.ok(!answer.content.includes('不得发布'))
  assert.equal(f.chat.canSend.value, true)
  assert.equal(sessions.isTurnActive(f.id), false)
  assert.equal((await f.detail()).messages.length, 2)
})

test('timeout: ends pending tools and restores error in history', async t => {
  const f = await fixture(t, () => new Promise(() => {}), 150)
  await f.chat.send('测试问题')
  assert.equal(f.chat.errorCode.value, 'turn_timeout')
  assert.equal(f.chat.canSend.value, true)
  assert.ok(f.chat.messages.value.at(-1).toolCalls.every(tool => tool.status !== 'running'))
  const detail = await f.detail()
  assert.equal(detail.messages.at(-1).error.code, 'turn_timeout')
  assert.ok(sessionMessagesToChat(detail.messages).at(-1).error)
  assert.equal(sessions.isTurnActive(f.id), false)
  await f.chat.retry()
  assert.equal(f.chat.errorCode.value, 'turn_timeout')
  assert.ok(f.chat.messages.value.at(-1).error)
  assert.deepEqual(f.counts(), { modelCalls: 1, toolCalls: 1 })
})

test('explicit stop: cancels backend turn, saves stopped state and releases input', async t => {
  const f = await fixture(t, () => new Promise(() => {}))
  const pending = f.chat.send('测试问题')
  await until(() => f.chat.messages.value.at(-1)?.toolCalls.length === 1)
  await f.chat.requestStop(); await pending
  await until(() => !sessions.isTurnActive(f.id))
  assert.equal(f.chat.messages.value.at(-1).stopped, true)
  assert.equal(f.chat.canSend.value, true)
  assert.equal(f.chat.canRetry.value, false)
  const detail = await f.detail()
  assert.equal(detail.messages.at(-1).stopped, true)
  assert.equal(sessionMessagesToChat(detail.messages).at(-1).stopped, true)
  assert.equal(detail.messages.at(-1).toolCalls[0].stopped, true)
  assert.deepEqual(f.chat.messages.value.at(-1).timing, detail.messages.at(-1).timing,
    'stop receives terminal timings without requiring a refresh')
  assert.ok(f.chat.messages.value.at(-1).toolCalls[0].ms >= 0)
  assert.equal(sessionMessagesToChat(detail.messages).at(-1).toolCalls[0].status, 'stopped')
  const again = await (await fetch(`${f.baseUrl}/api/agent/sessions/${f.id}/stop`, { method: 'POST' })).json()
  assert.equal(again.stopping, false)
  assert.deepEqual(f.counts(), { modelCalls: 1, toolCalls: 1 })
})

test('refresh: reconnects same active turn without old frames or duplicate execution', async t => {
  let complete
  const f = await fixture(t, () => new Promise(resolve => { complete = resolve }))
  // Previous turn frames must not be replayed into the new active turn.
  sessions.publish(f.id, { type: 'message_delta', text: '上一轮不应出现' })
  sessions.publish(f.id, { type: 'done', steps: 1 })
  const pending = f.chat.send('测试问题')
  await until(() => f.chat.messages.value.at(-1)?.toolCalls.length === 1)
  f.chat.stop(); await pending // refresh disconnects, not a server-side stop
  assert.equal(sessions.isTurnActive(f.id), true)
  const detail = await f.detail()
  assert.equal(detail.activeTurn.question, '测试问题')
  assert.deepEqual(detail.activeTurn.scope, context)
  assert.equal(detail.activeTurn.fromEventId, 2)
  const restored = f.makeChat(); restored.loadSession(detail)
  const resumed = restored.restoreActiveTurn(detail)
  await until(() => restored.messages.value.at(-1)?.toolCalls.length === 1)
  complete(serviceResult); await resumed
  assert.equal(restored.messages.value.length, 2)
  assert.equal(restored.messages.value.at(-1).content, '知识服务原答案')
  assert.equal(restored.canSend.value, true)
  // 正常循环：首次选择工具、收到结果后再次决策；刷新没有重跑工具。
  assert.deepEqual(f.counts(), { modelCalls: 2, toolCalls: 1 })
  assert.equal((await f.detail()).messages.length, 2)
})
