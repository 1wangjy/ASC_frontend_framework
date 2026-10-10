import test from 'node:test'
import assert from 'node:assert/strict'
import { elapsedLabel, waitingDetail, timingLabel } from '../src/platform/agent/executionTiming.js'
import { describeRun } from '../src/platform/agent/runStatus.js'
import { sessionMessagesToChat } from '../src/platform/agent/sessions.js'

test('waiting shows elapsed time without percentage or invented stage; legacy dates remain unknown', () => {
  assert.equal(elapsedLabel(undefined, 50000), '等待时长未知')
  assert.equal(elapsedLabel(50000, 40000), '已等待 0 秒')
  const message = { toolCalls: [{ name: 'kg_search', status: 'running', startedAt: 10000 }] }
  const state = describeRun({ message, streaming: true, now: 59000 })
  assert.match(state.detail, /已等待 49 秒/)
  assert.match(state.detail, /远端计算是否取消未知/)
  assert.doesNotMatch(state.detail, /%|正在分解|正在验证/)
  assert.match(waitingDetail({ name: 'predict', startedAt: 10000 }, 11000), /工具 predict/)
})

test('history keeps server timings and interrupted tools, never fabricates timings for old history', () => {
  const timing = { schema: 'agent.timing.v1', totalMs: 1000, modelMs: 200, knowledgeToolMs: 700, otherToolMs: 0, otherMs: 100 }
  const [message, legacy] = sessionMessagesToChat([{ role: 'assistant', timing,
    toolCalls: [{ name: 'kg_search', argsSummary: { query: 'SiC' }, startedAt: 10000, finishedAt: 10700, ms: 700, ok: false, stopped: true }] },
    { role: 'assistant', content: '旧记录' }])
  assert.deepEqual(message.timing, timing)
  assert.equal(message.toolCalls[0].status, 'stopped')
  assert.equal(message.toolCalls[0].startedAt, 10000)
  assert.equal(message.toolCalls[0].summary, '{"query":"SiC"}')
  assert.equal(legacy.timing, null)
  assert.match(timingLabel(timing), /模型决策\/生成 0.2 秒/)
  assert.equal(timingLabel(null), '')
})
