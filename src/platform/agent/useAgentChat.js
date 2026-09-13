/**
 * 智能体多轮对话状态（可组合式，等价于一个轻量 store）。
 * 仅依赖 vue 与 ./api.js —— 删除本目录即可完全移除该能力。
 */

import { computed, ref, shallowRef } from 'vue'
import { getAgentTools, streamAgent } from './api.js'

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
  const steps = ref(0)
  const tools = ref([])
  const toolsError = ref('')
  const requestController = shallowRef(null)

  const canSend = computed(() => !streaming.value)

  function currentAssistant() {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.role === 'assistant') return message
    }
    return null
  }

  function handleEvent(event, assistant) {
    if (!event || !assistant) return
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
        break
      case 'done':
        if (Number.isFinite(event.steps)) steps.value = event.steps
        break
      default:
        break
    }
  }

  async function send(text) {
    const content = String(text || '').trim()
    if (!content || streaming.value) return

    error.value = ''
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

    const controller = new AbortController()
    requestController.value = controller
    streaming.value = true

    try {
      await streamAgent({
        messages: [...history, { role: 'user', content }],
        context: options.getContext?.(),
        options: options.getRequestOptions?.(),
        signal: controller.signal,
        baseUrl: options.baseUrl || '',
        onEvent: event => handleEvent(event, assistant)
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistant.stopped = true
      } else {
        const message = err?.message || '智能体连接失败'
        error.value = message
        assistant.error = message
      }
    } finally {
      assistant.streaming = false
      streaming.value = false
      requestController.value = null
    }
  }

  function stop() {
    requestController.value?.abort()
    requestController.value = null
  }

  function reset() {
    stop()
    messages.value = []
    error.value = ''
    steps.value = 0
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
    steps,
    tools,
    toolsError,
    canSend,
    send,
    stop,
    reset,
    loadTools,
    toolStatusLabel
  }
}
