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
 *       options?:{maxSteps?:number, allowTools?:string[]},
 *       sessionId?:string, resumeFromEventId?:number }
 *   帧：`id: <seq>\ndata: <json>\n\n`，心跳 `: ping\n\n`
 *     {"type":"message_delta","text":"…"}
 *     {"type":"tool_call","id":"…","name":"predict","args":{…}}
 *     {"type":"tool_result","id":"…","name":"predict","ok":true,"summary":"…","data":{…}}
 *     {"type":"final","text":"…"}
 *     {"type":"error","message":"…","code":"turn_timeout"}
 *     {"type":"done","steps":N,"sessionId":"…","turnIndex":N}
 *   `id:` 行在解析结果里体现为 `eventId`（续传用，缺失时不添加该字段）。
 *
 *   GET    /api/agent/tools                              → { tools:[{name,description,parameters}] }
 *   POST   /api/agent/sessions                           → {sessionId,title,createdAt}
 *   GET    /api/agent/sessions?limit=20                  → [{sessionId,title,createdAt,updatedAt,turns}]
 *   GET    /api/agent/sessions/:id                        → {sessionId,title,messages,createdAt,updatedAt}
 *   DELETE /api/agent/sessions/:id                        → {ok:true}
 *   GET    /api/agent/metrics                            → {turns,toolCalls,toolErrors,tokens,avgTurnMs,tools}
 */

import { buildApiUrl } from '../../api/runtime.js'

export const AGENT_API_PATH = '/api/agent'

/**
 * 增量式 SSE 解析器：把任意切分的 chunk 拼装成完整事件块。
 * 显式导出以便单测，不依赖网络。
 */
export function createSseParser() {
  let buffer = ''

  /** `id: 12` → 12；非数字保留原字符串；缺省 null。 */
  function parseEventId(raw) {
    const value = raw.trim()
    if (!value) return null
    return /^\d+$/.test(value) ? Number(value) : value
  }

  function parseBlock(block) {
    const dataLines = []
    let eventId = null
    for (const rawLine of block.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!line) continue
      // 心跳 / 注释行（`: ping`）直接丢弃
      if (line.startsWith(':')) continue
      if (line.startsWith('id:')) {
        eventId = parseEventId(line.slice(3))
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    if (!dataLines.length) return null
    const payload = dataLines.join('\n')
    let event
    try {
      event = JSON.parse(payload)
    } catch (_error) {
      event = { type: 'invalid', raw: payload }
    }
    if (!event || typeof event !== 'object') return event
    // 只有携带 `id:` 的帧才附加 eventId —— 没有 id 的流行为与旧版逐字节一致。
    return eventId === null ? event : { ...event, eventId }
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
 * @param {string} [params.sessionId] 追加到该会话
 * @param {number|string} [params.resumeFromEventId] 只重放 id 大于它的事件帧
 * @param {AbortSignal} [params.signal]
 * @param {(event:Object)=>void} [params.onEvent]
 * @param {string} [params.baseUrl] 覆盖默认 base（测试用）
 * @returns {Promise<void>}
 */
export async function streamAgent({
  messages = [],
  context,
  options,
  sessionId,
  resumeFromEventId,
  signal,
  onEvent,
  baseUrl = ''
} = {}) {
  const url = buildApiUrl(`${AGENT_API_PATH}/stream`, baseUrl)
  // undefined 会被 JSON.stringify 丢弃：未传 sessionId/续传点时请求体与旧版一致。
  const body = { messages, context, options, sessionId, resumeFromEventId }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const suffix = detail ? `：${detail.slice(0, 300)}` : ''
    const failure = new Error(`智能体服务返回 ${response.status}${suffix}`)
    // 调用方需要区分 404（会话不存在）/ 409（该会话已有进行中的一轮）。
    failure.status = response.status
    throw failure
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

/** 统一的 JSON 请求：失败时抛出带中文说明的错误（调用方负责降级展示）。 */
async function requestJson(path, { method = 'GET', body, baseUrl = '', failureLabel = '请求失败' } = {}) {
  const response = await fetch(buildApiUrl(`${AGENT_API_PATH}${path}`, baseUrl), {
    method,
    headers: body === undefined
      ? { Accept: 'application/json' }
      : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const suffix = detail ? `：${detail.slice(0, 200)}` : ''
    const failure = new Error(`${failureLabel}（HTTP ${response.status}）${suffix}`)
    failure.status = response.status
    throw failure
  }
  if (response.status === 204) return null
  return response.json().catch(() => null)
}

/**
 * 新建会话。
 * @param {{title?:string, baseUrl?:string}} [params]
 * @returns {Promise<{sessionId:string,title:string,createdAt:string}>}
 */
export async function createAgentSession({ title, baseUrl = '' } = {}) {
  const payload = await requestJson('/sessions', {
    method: 'POST',
    body: title ? { title } : {},
    baseUrl,
    failureLabel: '新建会话失败'
  })
  if (!payload?.sessionId) throw new Error('新建会话失败：响应缺少 sessionId')
  return payload
}

/**
 * 会话列表（最近的在前）。
 * @param {{limit?:number, baseUrl?:string}} [params]
 * @returns {Promise<Array>} 原始条目数组 —— 映射交给 sessions.js
 */
export async function listAgentSessions({ limit = 20, baseUrl = '' } = {}) {
  const payload = await requestJson(`/sessions?limit=${encodeURIComponent(limit)}`, {
    baseUrl,
    failureLabel: '会话列表读取失败'
  })
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload?.sessions) ? payload.sessions : []
}

/**
 * 会话详情（含历史消息）。
 * @param {string} sessionId
 * @param {{baseUrl?:string}} [params]
 */
export async function getAgentSession(sessionId, { baseUrl = '' } = {}) {
  const id = String(sessionId || '').trim()
  if (!id) throw new Error('会话详情读取失败：缺少 sessionId')
  return requestJson(`/sessions/${encodeURIComponent(id)}`, {
    baseUrl,
    failureLabel: '会话详情读取失败'
  })
}

/**
 * 删除会话。
 * @param {string} sessionId
 * @param {{baseUrl?:string}} [params]
 */
export async function deleteAgentSession(sessionId, { baseUrl = '' } = {}) {
  const id = String(sessionId || '').trim()
  if (!id) throw new Error('会话删除失败：缺少 sessionId')
  return requestJson(`/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    baseUrl,
    failureLabel: '会话删除失败'
  })
}

/**
 * 运行指标。
 * @param {{baseUrl?:string}} [params]
 * @returns {Promise<Object|null>}
 */
export async function getAgentMetrics({ baseUrl = '' } = {}) {
  return requestJson('/metrics', { baseUrl, failureLabel: '运行指标读取失败' })
}
