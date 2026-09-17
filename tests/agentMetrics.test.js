import test from 'node:test'
import assert from 'node:assert/strict'

import { describeMetrics, formatCount, formatDuration } from '../src/platform/agent/metrics.js'

const PAYLOAD = {
  turns: 3,
  toolCalls: 5,
  toolErrors: 1,
  avgTurnMs: 4200,
  tokens: { prompt: 1200, completion: 340, total: 1540, reported: true },
  tools: {
    predict: { calls: 3, errors: 0, avgMs: 900 },
    kg_search: { calls: 2, errors: 1, avgMs: 2100 }
  }
}

test('describeMetrics renders the one-line summary and token line', () => {
  const metrics = describeMetrics(PAYLOAD)

  assert.equal(metrics.ok, true)
  assert.equal(metrics.empty, false)
  assert.equal(metrics.line, '轮次 3 · 工具调用 5 · 失败 1 · 平均 4.2s')
  assert.equal(metrics.tokensLine, 'tokens 提示 1.2k · 生成 340 · 合计 1.5k')
  assert.equal(metrics.hasTokens, true)
  assert.deepEqual(metrics.totals, { turns: 3, toolCalls: 5, toolErrors: 1, avgTurnMs: 4200 })
})

test('per-tool aggregates are sorted by volume and expose their error rate', () => {
  const metrics = describeMetrics(PAYLOAD)
  assert.deepEqual(metrics.tools.map(tool => tool.name), ['predict', 'kg_search'])
  assert.deepEqual(metrics.tools[0], {
    name: 'predict',
    calls: 3,
    errors: 0,
    avgMs: 900,
    avgLabel: '900ms',
    errorRate: ''
  })
  assert.equal(metrics.tools[1].errorRate, '50%')
  assert.equal(metrics.tools[1].avgLabel, '2.1s')
})

test('tools of equal volume fall back to name order for stable rendering', () => {
  const metrics = describeMetrics({
    tools: { web_browse: { calls: 1, errors: 1 }, kg_list: { calls: 1 } }
  })
  assert.deepEqual(metrics.tools.map(tool => tool.name), ['kg_list', 'web_browse'])
  assert.equal(metrics.tools[1].errorRate, '100%')
})

test('missing upstream token usage is reported as such, never as zero', () => {
  const metrics = describeMetrics({
    turns: 2,
    toolCalls: 0,
    toolErrors: 0,
    avgTurnMs: 0,
    tokens: { prompt: 0, completion: 0, total: 0, reported: false },
    tools: {}
  })
  assert.equal(metrics.hasTokens, false)
  assert.equal(metrics.tokensLine, 'tokens 上游未返回用量')
  assert.equal(metrics.line, '轮次 2 · 工具调用 0 · 失败 0 · 平均 0ms')
})

test('garbage payloads degrade instead of throwing', () => {
  for (const value of [null, undefined, 'nope', 42, [], { turns: 'NaN', tools: 'nope' }]) {
    const metrics = describeMetrics(value)
    assert.equal(metrics.ok, false)
    assert.equal(metrics.empty, true)
    assert.equal(metrics.line, '暂无指标')
    assert.deepEqual(metrics.tools, [])
    assert.deepEqual(metrics.totals, { turns: 0, toolCalls: 0, toolErrors: 0, avgTurnMs: 0 })
  }
})

test('an empty but valid payload is flagged as empty rather than failed', () => {
  const metrics = describeMetrics({ turns: 0, toolCalls: 0, toolErrors: 0, avgTurnMs: 0, tokens: {}, tools: {} })
  assert.equal(metrics.ok, true)
  assert.equal(metrics.empty, true)
  assert.deepEqual(metrics.tools, [])
})

test('duration and count formatting stay compact', () => {
  assert.equal(formatDuration(0), '0ms')
  assert.equal(formatDuration(840), '840ms')
  assert.equal(formatDuration(4200), '4.2s')
  assert.equal(formatDuration(45000), '45s')
  assert.equal(formatDuration(90500), '1m31s')
  assert.equal(formatDuration(null), '—')
  assert.equal(formatDuration(-5), '—')

  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(999), '999')
  assert.equal(formatCount(1234), '1.2k')
  assert.equal(formatCount(12345), '12k')
  assert.equal(formatCount(1234567), '1.2M')
})
