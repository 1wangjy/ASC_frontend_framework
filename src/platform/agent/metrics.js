/**
 * 运行指标（T9）模型：GET /api/agent/metrics 响应 → 展示用文案（纯逻辑）。
 *
 * 契约：{turns, toolCalls, toolErrors, tokens:{prompt,completion,total}, avgTurnMs,
 *        tools:{<name>:{calls,errors,avgMs}}}
 * 上游没有 usage 时 tokens 全为 0（后端同时给 `reported:false`）—— 此时明确显示
 * “上游未返回 token 用量”，而不是把 0 当成真实统计。
 */

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function readNumber(source, keys) {
  for (const key of keys) {
    if (typeof source?.[key] === 'number' && Number.isFinite(source[key])) return source[key]
  }
  return null
}

/** 840 → `840ms`；4200 → `4.2s`；90500 → `1m31s`；非法 → `—`。 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m${String(seconds).padStart(2, '0')}s`
}

/** 1234 → `1.2k`；1234567 → `1.2M`；小数值原样。 */
export function formatCount(value) {
  const number = num(value)
  if (number < 1000) return String(Math.round(number))
  if (number < 1000000) return `${(number / 1000).toFixed(number < 10000 ? 1 : 0)}k`
  return `${(number / 1000000).toFixed(1)}M`
}

/**
 * @param {Object|null} payload
 * @returns {{ok:boolean, empty:boolean, line:string, tokensLine:string,
 *            hasTokens:boolean, tools:Array<{name,calls,errors,avgMs,avgLabel,errorRate:string}>,
 *            totals:{turns:number,toolCalls:number,toolErrors:number,avgTurnMs:number}}}
 */
export function describeMetrics(payload) {
  const empty = {
    ok: false,
    empty: true,
    line: '暂无指标',
    tokensLine: '',
    hasTokens: false,
    tools: [],
    totals: { turns: 0, toolCalls: 0, toolErrors: 0, avgTurnMs: 0 }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return empty

  // 至少要有一个可信的数值字段，否则视为“不是指标响应”，而不是全 0 的统计。
  const shape = ['turns', 'turnCount', 'turn_count', 'toolCalls', 'tool_call_count',
    'toolErrors', 'tool_error_count', 'avgTurnMs', 'avg_turn_ms']
  const numericIn = (source, keys) => Boolean(source) && typeof source === 'object'
    && !Array.isArray(source)
    && keys.some(key => typeof source[key] === 'number' && Number.isFinite(source[key]))
  const hasShape = shape.some(key => typeof payload[key] === 'number' && Number.isFinite(payload[key]))
    || numericIn(payload.tokens, ['prompt', 'completion', 'total'])
    || (payload.tools && typeof payload.tools === 'object' && !Array.isArray(payload.tools)
      && Object.values(payload.tools).some(entry => numericIn(entry, ['calls', 'errors', 'avgMs', 'avg_ms'])))
  if (!hasShape) return empty

  const turns = num(readNumber(payload, ['turns', 'turnCount', 'turn_count']) ?? 0)
  const toolCalls = num(readNumber(payload, ['toolCalls', 'tool_call_count']) ?? 0)
  const toolErrors = num(readNumber(payload, ['toolErrors', 'tool_error_count']) ?? 0)
  const avgTurnMs = num(readNumber(payload, ['avgTurnMs', 'avg_turn_ms']) ?? 0)

  const tokens = payload.tokens && typeof payload.tokens === 'object' ? payload.tokens : {}
  const prompt = num(readNumber(tokens, ['prompt', 'prompt_tokens']) ?? 0)
  const completion = num(readNumber(tokens, ['completion', 'completion_tokens']) ?? 0)
  const total = num(readNumber(tokens, ['total', 'total_tokens']) ?? 0) || prompt + completion
  // `reported:false` 是后端明确的“上游没有返回 usage”；此时 0 不是真实统计。
  const hasTokens = tokens.reported === false ? false : total > 0

  const tools = Object.entries(payload.tools && typeof payload.tools === 'object' ? payload.tools : {})
    .map(([name, entry]) => {
      const calls = num(readNumber(entry, ['calls']) ?? 0)
      const errors = num(readNumber(entry, ['errors']) ?? 0)
      const toolAvg = num(readNumber(entry, ['avgMs', 'avg_ms']) ?? 0)
      return {
        name,
        calls,
        errors,
        avgMs: toolAvg,
        avgLabel: formatDuration(toolAvg),
        errorRate: calls > 0 && errors > 0 ? `${Math.round((errors / calls) * 100)}%` : ''
      }
    })
    .sort((left, right) => right.calls - left.calls || left.name.localeCompare(right.name))

  const line = [
    `轮次 ${formatCount(turns)}`,
    `工具调用 ${formatCount(toolCalls)}`,
    `失败 ${formatCount(toolErrors)}`,
    `平均 ${formatDuration(avgTurnMs)}`
  ].join(' · ')

  const tokensLine = hasTokens
    ? `tokens 提示 ${formatCount(prompt)} · 生成 ${formatCount(completion)} · 合计 ${formatCount(total)}`
    : 'tokens 上游未返回用量'

  return {
    ok: true,
    empty: turns === 0 && toolCalls === 0,
    line,
    tokensLine,
    hasTokens,
    tools,
    totals: { turns, toolCalls, toolErrors, avgTurnMs }
  }
}
