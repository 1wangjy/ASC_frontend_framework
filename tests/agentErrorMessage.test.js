import test from 'node:test'
import assert from 'node:assert/strict'
import { agentErrorMessage } from '../src/platform/agent/errorMessage.js'

test('model 503 errors display a concise busy message', () => {
  for (const error of [
    'LLM request failed (HTTP 503): {"error":{"message":"Service is too busy.","code":"service_unavailable_error"}}',
    'LLM request failed (HTTP 503): upstream unavailable',
    'LLM request failed: service_unavailable_error',
    'Model request failed: Service is too busy'
  ]) assert.equal(agentErrorMessage(error), '模型服务繁忙，请稍后重试')
})

test('other errors keep their original explanation', () => {
  for (const error of ['LLM request failed (HTTP 401): invalid key',
    'LLM request failed (HTTP 400): invalid parameter',
    '知识服务 HTTP 503', '本回合已超时（300000 ms），已停止工具调用。', '已停止', '']) {
    assert.equal(agentErrorMessage(error), error)
  }
})
