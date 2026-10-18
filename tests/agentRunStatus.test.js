import test from 'node:test'
import assert from 'node:assert/strict'
import { describeRun } from '../src/platform/agent/runStatus.js'
test('service passthrough has an origin label, not a verified-science label', () => {
  const state = describeRun({ message: { answer_check: { status: 'knowledge_service_answer' } } })
  assert.equal(state.title, '知识服务回答已返回')
  assert.ok(state.detail.includes('未二次改写'))
  assert.equal(describeRun({ message: { answer_check: { status: 'no_service_answer' } } }).tone, 'warning')
})

test('run status derives creation, model waiting and actual tool execution without percentages', () => {
  assert.equal(describeRun({ creating: true }).title, '正在创建会话')
  assert.equal(describeRun({ streaming: true }).title, '模型处理中')
  const state = describeRun({ streaming: true, message: { toolCalls: [{ name: 'kg_search', status: 'running' }] } })
  assert.equal(state.title, '工具执行中')
  assert.ok(state.detail.includes('kg_search'))
  assert.ok(!/\d+%/.test(state.detail))
})
test('valid citations do not become scientific acceptance; blocked checks have a visible failure state', () => {
  const state = describeRun({ message: { answer_check: { status: 'citations_valid_support_unverified' } } })
  assert.equal(state.title, '待核验草稿已生成')
  assert.equal(state.tone, 'warning')
  assert.ok(state.detail.includes('仍需核验'))
  assert.equal(describeRun({ message: { answer_check: { status: 'blocked' } } }).title, '引用检查未通过')
  assert.equal(describeRun({ message: { content: '安全提示', answer_check: { status: 'incomplete' } } }).title, '回答未完成')
})
test('stop and errors override stale tool states and counts never pretend rejected calls succeeded', () => {
  const tools = [{ status: 'ok' }, { status: 'error' }, { status: 'stopped' }]
  const state = describeRun({ message: { stopped: true, toolCalls: tools } })
  assert.equal(state.title, '已停止')
  assert.deepEqual(state.counts, { total: 3, completed: 1, failed: 1, denied: 0 })
  assert.equal(describeRun({ message: { error: 'timeout' } }).title, '执行异常')
})
