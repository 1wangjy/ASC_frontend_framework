/**
 * 会话（T3）模型：后端 payload → 面板视图模型（纯逻辑，无网络、无 Vue）。
 *
 * 契约：
 *   GET /api/agent/sessions        → [{sessionId,title,createdAt,updatedAt,turns}]
 *   GET /api/agent/sessions/:id    → {sessionId,title,messages:[{role,content,toolCalls?}],createdAt,updatedAt}
 *   POST /api/agent/sessions       → {sessionId,title,createdAt}
 *   toolCalls 条目形如 {name,argsSummary,ok,ms}
 *
 * 历史消息没有 result 数据（后端只持久化摘要），因此转成对话消息时
 * `data` 为 null —— 引用/证据卡片只在“本轮实时流”里出现。
 */

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function role(value) {
  return value === 'assistant' ? 'assistant' : 'user'
}

/** 历史工具调用 → 面板工具条目。 */
export function sessionToolCallsToChat(toolCalls, messageIndex) {
  return (Array.isArray(toolCalls) ? toolCalls : []).map((call, index) => {
    const ok = call?.ok === undefined ? null : call.ok === true
    return {
      id: `history-${messageIndex}-${index}-${text(call?.name, 'tool')}`,
      name: text(call?.name, 'unknown'),
      args: {},
      summary: text(call?.argsSummary),
      status: ok === null ? 'ok' : (ok ? 'ok' : 'error'),
      ok,
      resultSummary: '',
      data: null,
      ms: typeof call?.ms === 'number' && Number.isFinite(call.ms) ? call.ms : null
    }
  })
}

/** 会话详情里的消息 → useAgentChat 的 messages 结构（离线可用、可单测）。 */
export function sessionMessagesToChat(messages) {
  return (Array.isArray(messages) ? messages : []).map((message, index) => ({
    id: `history-${index}`,
    role: role(message?.role),
    content: text(message?.content),
    reasoning: text(message?.reasoning),
    toolCalls: sessionToolCallsToChat(message?.toolCalls, index),
    streaming: false,
    stopped: false,
    error: ''
  }))
}

/** 列表条目：容错 + 稳定排序字段。 */
export function mapSessionSummary(raw) {
  const sessionId = text(raw?.sessionId || raw?.session_id || raw?.id)
  if (!sessionId) return null
  const turns = Number(raw?.turns)
  return {
    sessionId,
    title: text(raw?.title, '未命名会话'),
    createdAt: text(raw?.createdAt || raw?.created_at),
    updatedAt: text(raw?.updatedAt || raw?.updated_at || raw?.createdAt || raw?.created_at),
    turns: Number.isFinite(turns) && turns > 0 ? Math.floor(turns) : 0
  }
}

/** GET /api/agent/sessions 的响应：接受裸数组或 {sessions:[…]}。 */
export function mapSessionList(payload) {
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.sessions) ? payload.sessions : [])
  return list.map(mapSessionSummary).filter(Boolean)
}

export function mapSessionDetail(payload) {
  const sessionId = text(payload?.sessionId || payload?.session_id || payload?.id)
  if (!sessionId) return null
  return {
    sessionId,
    title: text(payload?.title, '未命名会话'),
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    createdAt: text(payload?.createdAt || payload?.created_at),
    updatedAt: text(payload?.updatedAt || payload?.updated_at)
  }
}

/** 会话 id 的短标签（头部状态位用）。 */
export function shortSessionId(sessionId, length = 8) {
  const value = text(sessionId)
  return value ? value.slice(0, length) : ''
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 时间标签：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-09-01。
 * `now` 可注入，便于离线单测；非法时间返回空串。
 */
export function formatSessionTime(value, now = Date.now()) {
  const stamp = Date.parse(value)
  if (!Number.isFinite(stamp)) return ''
  const delta = now - stamp
  if (delta < MINUTE) return '刚刚'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`
  if (delta < DAY) return `${Math.floor(delta / HOUR)} 小时前`
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)} 天前`
  const date = new Date(stamp)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 用第一条用户消息生成新会话标题（后端也可自己命名，这只是提交时的建议标题）。 */
export function suggestSessionTitle(text_, maxLength = 24) {
  const value = text(text_).replace(/\s+/g, ' ')
  if (!value) return '新会话'
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}
