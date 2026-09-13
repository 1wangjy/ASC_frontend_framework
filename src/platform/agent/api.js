/**
 * 智能体（Agent）前端 API 客户端 —— 独立可选模块。
 *
 * 只依赖 `src/api/runtime.js` 的 base URL 解析，不触碰任何其他业务模块，
 * 因此整块 `src/platform/agent/` 目录可以被直接删除而不影响平台其余功能。
 *
 * 契约（与后端 backend_impl/src/agent 严格对齐）：
 *   POST /api/agent/stream  → text/event-stream
 *     { messages:[{role:"user"|"assistant",content:string}],
 *       context?:{projectId?:string},
 *       options?:{maxSteps?:number, allowTools?:string[]} }
 *   帧：`data: <json>\n\n`，心跳 `: ping\n\n`
 *     {"type":"message_delta","text":"…"}
 *     {"type":"tool_call","id":"…","name":"predict","args":{…}}
 *     {"type":"tool_result","id":"…","name":"predict","ok":true,"summary":"…","data":{…}}
 *     {"type":"final","text":"…"}
 *     {"type":"error","message":"…"}
 *     {"type":"done","steps":N}
 *   GET /api/agent/tools → { tools:[{name,description,parameters}] }
 */

import { buildApiUrl } from '../../api/runtime.js'

export const AGENT_API_PATH = '/api/agent'

/**
 * 增量式 SSE 解析器：把任意切分的 chunk 拼装成完整事件块。
 * 显式导出以便单测，不依赖网络。
 */
export function createSseParser() {
  let buffer = ''

  function parseBlock(block) {
    const dataLines = []
    for (const rawLine of block.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!line) continue
      // 心跳 / 注释行（`: ping`）直接丢弃
      if (line.startsWith(':')) continue
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (!dataLines.length) return null
    const payload = dataLines.join('\n')
    try {
      return JSON.parse(payload)
    } catch (_error) {
      return { type: 'invalid', raw: payload }
    }
  }

  return {
    /** 传入一段文本，返回本次解析出的完整事件数组（可能为空）。 */
    push(text) {
      if (!text) return []
      // SSE 允许 CRLF 帧分隔；先归一化，再按 `\n\n` 切块。
      // 跨 chunk 的 `\r` + `\n` 会在下一次 push 时被合并。
      buffer = `${buffer}${text}`.replace(/\r\n/g, '\n')
      const events = []
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseBlock(block)
        if (event) events.push(event)
        boundary = buffer.indexOf('\n\n')
      }
      return events
    },
    /** 流结束后冲刷残留缓冲区（容忍末尾缺少空行）。 */
    flush() {
      const remainder = buffer
      buffer = ''
      if (!remainder.trim()) return []
      const event = parseBlock(remainder)
      return event ? [event] : []
    }
  }
}

/**
 * 发起一次流式对话。
 * @param {Object} params
 * @param {Array<{role:string,content:string}>} params.messages
 * @param {Object} [params.context]
 * @param {Object} [params.options]
 * @param {AbortSignal} [params.signal]
 * @param {(event:Object)=>void} [params.onEvent]
 * @param {string} [params.baseUrl] 覆盖默认 base（测试用）
 * @returns {Promise<void>}
 */
export async function streamAgent({
  messages = [],
  context,
  options,
  signal,
  onEvent,
  baseUrl = ''
} = {}) {
  const url = buildApiUrl(`${AGENT_API_PATH}/stream`, baseUrl)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({ messages, context, options }),
    signal
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const suffix = detail ? `：${detail.slice(0, 300)}` : ''
    throw new Error(`智能体服务返回 ${response.status}${suffix}`)
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应（ReadableStream 不可用）')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = createSseParser()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const events = parser.push(decoder.decode(value, { stream: true }))
      for (const event of events) onEvent?.(event)
    }
    const tail = parser.push(decoder.decode())
    const flushed = [...tail, ...parser.flush()]
    for (const event of flushed) onEvent?.(event)
  } finally {
    reader.releaseLock?.()
  }
}

/**
 * 读取已注册工具清单（deny-by-default 注册表）。
 * @param {Object} [params]
 * @param {string} [params.baseUrl]
 * @returns {Promise<Array<{name:string,description:string,parameters:Object}>>}
 */
export async function getAgentTools({ baseUrl = '' } = {}) {
  const response = await fetch(buildApiUrl(`${AGENT_API_PATH}/tools`, baseUrl), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) {
    throw new Error(`工具清单读取失败（HTTP ${response.status}）`)
  }
  const payload = await response.json().catch(() => null)
  const tools = payload?.tools
  return Array.isArray(tools) ? tools : []
}
