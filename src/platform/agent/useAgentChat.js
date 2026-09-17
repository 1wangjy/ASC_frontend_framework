/**
 * 智能体多轮对话状态（可组合式，等价于一个轻量 store）。
 * 仅依赖 vue 与 ./api.js —— 删除本目录即可完全移除该能力。
 */

import { computed, ref, shallowRef } from 'vue'
import { getAgentTools, streamAgent } from './api.js'
import { sessionMessagesToChat } from './sessions.js'

let sequence = 0
function nextId(prefix) {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

/** 工具入参压缩为一行摘要，避免把大数组铺满气泡。 */
export function summarizeToolArgs(args, maxLength = 150) {
  if (args === undefined || args === null) return ''
  let text
  try {
    text = JSON.stringify(args)
  } catch (_error) {
    text = String(args)
  }
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function toolStatusLabel(tool) {
  if (tool.status === 'running') return '执行中'
  if (tool.status === 'error') return '失败'
  return '完成'
}

/** 断点续传（T11）提示文案：只描述契约保证的行为。 */
export const RETRY_HINT = '连接中断或整轮超时：服务端重放断点之后的缓冲帧，再继续本轮。'

/**
 * @param {Object} [options]
 * @param {() => ({projectId?:string})} [options.getContext]
 * @param {() => ({maxSteps?:number, allowTools?:string[]})} [options.getRequestOptions]
 * @param {string} [options.baseUrl] 覆盖后端 base（联调/测试用）
 */
export function useAgentChat(options = {}) {
  const messages = ref([])
  const streaming = ref(false)
  const error = ref('')
  const errorCode = ref('')
  const steps = ref(0)
  const tools = ref([])
  const toolsError = ref('')
  const sessionId = ref('')
  const turnIndex = ref(null)
  /** 已收到的最大事件 id（SSE `id:` 行），续传时作为 resumeFromEventId。 */
  const lastEventId = ref(null)
  /** 可续传的断点：{ lastEventId, assistantId }；null 表示无可续传的失败。 */
  const resumePoint = ref(null)
  const requestController = shallowRef(null)

  const canSend = computed(() => !streaming.value)
  // 续传必须绑定会话（后端从会话环形缓冲重放），没有 sessionId 就没有断点可续。
  const canRetry = computed(() => Boolean(resumePoint.value && sessionId.value && !streaming.value))

  function currentAssistant() {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.role === 'assistant') return message
    }
    return null
  }

  function handleEvent(event, assistant) {
    if (!event || !assistant) return
    // `id:` 单调递增。续传时服务端只重放 id 更大的帧，但客户端仍要容忍重叠重放：
    // 已经见过的帧直接丢弃，否则文本与工具卡片会被重复追加。
    if (event.eventId !== undefined && event.eventId !== null) {
      if (lastEventId.value !== null && event.eventId <= lastEventId.value) return
      lastEventId.value = event.eventId
    }
    switch (event.type) {
      case 'message_delta':
        if (typeof event.text === 'string') assistant.content += event.text
        break
      case 'tool_call':
        assistant.toolCalls.push({
          id: event.id || nextId('call'),
          name: event.name || 'unknown',
          args: event.args ?? {},
          summary: summarizeToolArgs(event.args),
          status: 'running',
          ok: null,
          resultSummary: '',
          data: null
        })
        break
      case 'tool_result': {
        const tool = assistant.toolCalls.find(item => item.id === event.id)
          || assistant.toolCalls.find(item => item.name === event.name && item.status === 'running')
        if (tool) {
          tool.status = event.ok ? 'ok' : 'error'
          tool.ok = Boolean(event.ok)
          tool.resultSummary = event.summary || ''
          tool.data = event.data ?? null
        } else {
          assistant.toolCalls.push({
            id: event.id || nextId('call'),
            name: event.name || 'unknown',
            args: {},
            summary: '',
            status: event.ok ? 'ok' : 'error',
            ok: Boolean(event.ok),
            resultSummary: event.summary || '',
            data: event.data ?? null
          })
        }
        break
      }
      case 'final':
        if (typeof event.text === 'string' && event.text.trim()) assistant.content = event.text
        break
      case 'error':
        assistant.error = event.message || '智能体执行出错'
        error.value = assistant.error
        errorCode.value = typeof event.code === 'string' ? event.code : ''
        // 超时/中断后整轮已停在服务端；只要持有会话就能从缓冲断点续传。
        resumePoint.value = { lastEventId: lastEventId.value ?? 0, assistantId: assistant.id }
        break
      case 'done':
        if (Number.isFinite(event.steps)) steps.value = event.steps
        if (typeof event.sessionId === 'string' && event.sessionId) sessionId.value = event.sessionId
        if (Number.isFinite(event.turnIndex)) turnIndex.value = event.turnIndex
        // 本轮正常收尾：断点作废（出错后到达的 done 会保留断点，见 error 分支）。
        if (!assistant.error) resumePoint.value = null
        break
      default:
        break
    }
  }

  /**
   * 驱动器：把一次请求的帧写进指定 assistant 消息，并统一处理中断/失败。
   * `send()` 与 `retry()` 共用。
   */
  async function runTurn({ assistant, request }) {
    const controller = new AbortController()
    requestController.value = controller
    streaming.value = true
    try {
      await streamAgent({
        ...request,
        signal: controller.signal,
        baseUrl: options.baseUrl || '',
        onEvent: event => handleEvent(event, assistant)
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistant.stopped = true
      } else if (err?.status === 404) {
        // 会话已不存在（被删除或后端重启后未持久化）：解除绑定，续传不可能。
        const message = '会话已失效（服务端未找到），后续提问将自动新建会话。'
        adoptSession('')
        error.value = message
        errorCode.value = 'session_missing'
        assistant.error = message
      } else if (err?.status === 409) {
        // 该会话已有一轮在跑：立即续传只会再次 409，不提供续传按钮。
        const message = '该会话正在执行上一轮，请稍候再试。'
        error.value = message
        errorCode.value = 'turn_in_progress'
        assistant.error = message
      } else {
        const message = err?.message || '智能体连接失败'
        error.value = message
        errorCode.value = 'stream_dropped'
        assistant.error = message
        // 流被掐断时服务端可能仍在推进：从最后一个事件 id 续传即可补齐。
        resumePoint.value = { lastEventId: lastEventId.value ?? 0, assistantId: assistant.id }
      }
    } finally {
      assistant.streaming = false
      streaming.value = false
      requestController.value = null
    }
  }

  async function send(text) {
    const content = String(text || '').trim()
    if (!content || streaming.value) return

    error.value = ''
    errorCode.value = ''
    resumePoint.value = null
    const history = messages.value
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .filter(message => message.content.trim())
      .map(message => ({ role: message.role, content: message.content }))

    messages.value.push({ id: nextId('user'), role: 'user', content, toolCalls: [] })
    const assistant = {
      id: nextId('assistant'),
      role: 'assistant',
      content: '',
      toolCalls: [],
      streaming: true,
      stopped: false,
      error: ''
    }
    messages.value.push(assistant)

    await runTurn({
      assistant,
      request: {
        messages: [...history, { role: 'user', content }],
        context: options.getContext?.(),
        options: options.getRequestOptions?.(),
        sessionId: sessionId.value || undefined
      }
    })
  }

  /**
   * 断点续传：用 {sessionId, resumeFromEventId} 重连，服务端重放缓冲帧后继续/收尾。
   * 复用同一条 assistant 消息，避免重复气泡与重复文本。
   */
  async function retry() {
    const point = resumePoint.value
    if (!point || streaming.value) return false
    const id = sessionId.value
    if (!id) return false
    const assistant = messages.value.find(message => message.id === point.assistantId)
    if (!assistant) {
      resumePoint.value = null
      return false
    }

    resumePoint.value = null
    error.value = ''
    errorCode.value = ''
    assistant.error = ''
    assistant.stopped = false
    assistant.streaming = true

    // 断点取“目前见过的最大事件 id”：出错后仍可能收到收尾帧，快照会落后。
    const resumeFromEventId = lastEventId.value ?? point.lastEventId ?? 0
    await runTurn({
      assistant,
      request: {
        // 续传不需要重发历史：后端从会话存储重放缓冲帧后继续。
        messages: [],
        context: options.getContext?.(),
        options: options.getRequestOptions?.(),
        sessionId: id,
        resumeFromEventId
      }
    })
    return true
  }

  /** 认领一条会话（不清空消息）：后续提问与续传都绑定到它。 */
  function adoptSession(id) {
    sessionId.value = typeof id === 'string' ? id : ''
    turnIndex.value = null
    lastEventId.value = null
    resumePoint.value = null
  }

  /** 载入一条历史会话：消息回填并把后续提问接到同一个 sessionId 上。 */
  function loadSession(detail) {
    stop()
    messages.value = sessionMessagesToChat(detail?.messages)
    adoptSession(typeof detail?.sessionId === 'string' ? detail.sessionId : '')
    error.value = ''
    errorCode.value = ''
    steps.value = 0
  }

  /** 开始一条（服务端已创建的）会话：清空本地消息，后续提问写入该会话。 */
  function startSession(id) {
    stop()
    messages.value = []
    adoptSession(id)
    error.value = ''
    errorCode.value = ''
    steps.value = 0
  }

  function stop() {
    requestController.value?.abort()
    requestController.value = null
  }

  function reset() {
    startSession('')
  }

  async function loadTools() {
    toolsError.value = ''
    try {
      tools.value = await getAgentTools({ baseUrl: options.baseUrl || '' })
    } catch (err) {
      tools.value = []
      toolsError.value = err?.message || '工具清单不可用'
    }
  }

  return {
    messages,
    streaming,
    error,
    errorCode,
    steps,
    tools,
    toolsError,
    sessionId,
    turnIndex,
    lastEventId,
    canRetry,
    canSend,
    send,
    retry,
    stop,
    reset,
    loadSession,
    startSession,
    adoptSession,
    loadTools,
    toolStatusLabel
  }
}
