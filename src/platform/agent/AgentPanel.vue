<template>
  <section class="agent-panel" :class="{ 'agent-panel--embedded': embedded }" aria-label="智能体 Agent">
    <header class="agent-panel__head">
      <div class="agent-panel__heading">
        <span class="agent-panel__badge" aria-hidden="true">AI</span>
        <div>
          <h2 class="agent-panel__title">智能体 Agent<span class="agent-panel__beta">Beta</span></h2>
        </div>
      </div>
      <!-- 嵌入到「智能会话」页时，会话由页面右侧目录管理；独立面板仍保留按钮 -->
      <div v-if="!embedded" class="agent-panel__head-actions">
        <button
          type="button"
          class="agent-panel__ghost"
          aria-controls="agent-sessions"
          :aria-expanded="sessionsOpen"
          @click="toggleSessions"
        >
          会话历史
        </button>
        <button
          type="button"
          class="agent-panel__ghost agent-panel__primary"
          :disabled="sending"
          @click="newSession"
        >
          新建会话
        </button>
        <button
          type="button"
          class="agent-panel__ghost"
          aria-label="关闭智能体面板"
          v-if="!embedded"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>
    </header>
    <div class="agent-model-bar">
      <label>本轮模型
        <select :value="selectedModelId" aria-label="Agent模型" :disabled="sending" @change="selectModel($event.target.value)">
          <option v-for="model in modelOptions" :key="model.id" :value="model.id" :disabled="!model.configured">
            {{ model.label }} · {{ model.model }}{{ model.configured ? '' : '（不可用/待配置）' }}
          </option>
        </select>
      </label>
      <button type="button" class="agent-panel__ghost" :disabled="sending" @click="loadModels">刷新模型</button>
      <button type="button" class="agent-panel__ghost" @click="modelConfigOpen = !modelConfigOpen">本地模型配置</button>
      <p v-if="modelsError" role="status">{{ modelsError }}；仅可使用服务端默认模型，发送时由后端再次校验。</p>
    </div>
    <details v-if="modelConfigOpen" open class="agent-model-guide">
      <summary>服务端模型配置与部署说明</summary>
      <p>由服务端管理员配置 backend_impl/config/agent-models.json，并在 backend_impl/.env 中设置 AGENT_MODELS_FILE 的绝对路径。页面不接收密钥或任意模型服务地址。</p>
      <p>本地模型需先部署支持流式 chat/completions 和工具调用的服务，再登记 id、label、kind=local、model、apiUrl、authMode 和 enabled。需要鉴权时只填写 keyEnv 环境变量名，密钥留在本地 .env；无鉴权服务明确使用 authMode=none。</p>
      <p>地址与模型 ID 需与部署同学确认，部署本身尚未完成。“配置可用”不代表工具调用、流式和回答效果已经验证。修改配置后刷新模型名单；修改环境变量后重启后端。</p>
    </details>

    <section v-if="authOpen" id="agent-tool-auth" class="agent-auth" aria-label="工具权限">
      <div class="agent-auth__row">
        <span class="agent-auth__title">工具权限</span>
        <span class="agent-auth__count">已启用 {{ selection.enabled.length }}/{{ selection.total }}</span>
        <button
          type="button"
          role="switch"
          class="agent-auth__switch"
          :class="{ 'agent-auth__switch--on': prefs.readOnly }"
          :aria-checked="prefs.readOnly"
          @click="applyReadOnly(!prefs.readOnly)"
        >
          只读模式
        </button>
      </div>

      <p v-if="prefs.readOnly" class="agent-auth__note">{{ readOnlyNote }}</p>
      <p v-if="toolsError" class="agent-auth__note">{{ toolsError }}</p>
      <p v-else-if="!tools.length" class="agent-auth__note">工具清单尚未加载，暂时无法调整。</p>
      <ul v-else class="agent-auth__chips">
        <li v-for="tool in tools" :key="tool.name">
          <button
            type="button"
            class="agent-chip"
            :class="{
              'agent-chip--on': isToolOn(tool.name),
              'agent-chip--locked': isLocked(tool.name)
            }"
            :aria-pressed="isToolOn(tool.name)"
            :disabled="isLocked(tool.name)"
            :title="isLocked(tool.name) ? '只读模式下不可用' : (tool.description || tool.name)"
            @click="toggleToolChip(tool.name)"
          >
            {{ tool.name }}
          </button>
        </li>
      </ul>

      <p v-if="selection.blocked" class="agent-auth__warning" role="alert">
        已禁用全部可用工具，请至少启用一个工具再发送。
      </p>
    </section>

    <section v-if="metricsOpen" id="agent-metrics" class="agent-meta" aria-label="运行指标">
      <div class="agent-meta__row">
        <span class="agent-meta__title">运行指标</span>
        <span v-if="metricsLoading" class="agent-meta__note">加载中…</span>
        <span v-else-if="metrics.ok" class="agent-meta__line">{{ metrics.line }}</span>
        <span v-else class="agent-meta__note">{{ metricsError || '暂无指标' }}</span>
        <button
          type="button"
          class="agent-meta__refresh"
          :disabled="metricsLoading"
          @click="refreshMetrics"
        >
          刷新
        </button>
      </div>
      <p v-if="metrics.ok" class="agent-meta__note">{{ metrics.tokensLine }}</p>
      <ul v-if="metrics.tools.length" class="agent-meta__tools">
        <li v-for="tool in metrics.tools" :key="tool.name">
          <code>{{ tool.name }}</code>
          <span>{{ tool.calls }} 次</span>
          <span v-if="tool.errors" class="agent-meta__errors">失败 {{ tool.errors }}（{{ tool.errorRate }}）</span>
          <span>平均 {{ tool.avgLabel }}</span>
        </li>
      </ul>
    </section>

    <section v-if="!embedded && sessionsOpen" id="agent-sessions" class="agent-meta" aria-label="会话历史">
      <div class="agent-meta__row">
        <span class="agent-meta__title">会话历史</span>
        <span class="agent-meta__note">{{ sessions.length }} 条</span>
        <button type="button" class="agent-meta__refresh" @click="sessionsOpen = false">收起</button>
        <button
          type="button"
          class="agent-meta__refresh"
          :disabled="sessionsLoading"
          @click="refreshSessions"
        >
          {{ sessionsLoading ? '加载中…' : '刷新' }}
        </button>
      </div>


      <p v-if="!sessions.length && !sessionsLoading" class="agent-meta__note">
        还没有历史会话：发送一条提问会自动保存，之后可在这里打开并继续。
      </p>
      <ul v-else class="agent-sessions__list">
        <li v-for="session in sessions" :key="session.sessionId" class="agent-sessions__item">
          <button
            type="button"
            class="agent-session"
            :class="{ 'agent-session--active': session.sessionId === sessionId }"
            :aria-current="session.sessionId === sessionId ? 'true' : undefined"
            :disabled="sending || sessionsLoading"
            :title="`打开会话：${session.title}`"
            @click="openSession(session.sessionId)"
          >
            <span class="agent-session__title">{{ session.title }}</span>
            <span class="agent-session__meta">
              {{ session.turns }} 轮 · {{ formatSessionTime(session.updatedAt) }}
            </span>
          </button>
          <template v-if="pendingDeleteId === session.sessionId">
            <button
              type="button"
              class="agent-session__delete agent-session__delete--confirm"
              :disabled="sending"
              :aria-label="`确认删除会话 ${session.title}`"
              @click="removeSession(session.sessionId)"
            >
              确认删除
            </button>
            <button
              type="button"
              class="agent-session__delete"
              :aria-label="`取消删除会话 ${session.title}`"
              @click="pendingDeleteId = ''"
            >
              取消
            </button>
          </template>
          <button
            v-else
            type="button"
            class="agent-session__delete"
            :disabled="sending"
            :aria-label="`删除会话 ${session.title}`"
            @click="pendingDeleteId = session.sessionId"
          >
            删除
          </button>
        </li>
      </ul>
    </section>

    <p v-if="sessionError" class="agent-panel__banner" role="alert">{{ sessionError }}</p>
    <p v-if="sessionPersistWarning" class="agent-panel__banner">{{ sessionPersistWarning }}</p>
    <div ref="logElement" class="agent-panel__log" role="log" aria-live="polite" aria-relevant="additions text">
      <div v-if="!messages.length" class="agent-panel__empty">
        <p class="agent-panel__empty-title">从一次真实的工具调用开始</p>
        <p class="agent-panel__empty-text">
          智能体只会调用已注册的工具，无法读取本地文件或数据库。试试下面的问题：
        </p>
        <ul class="agent-panel__examples">
          <li v-for="example in examples" :key="example">
            <button type="button" @click="useExample(example)">{{ example }}</button>
          </li>
        </ul>
      </div>

      <article
        v-for="message in messages"
        :key="message.id"
        class="agent-message"
        :class="`agent-message--${message.role}`"
      >
        <div class="agent-message__avatar" aria-hidden="true">
          {{ message.role === 'user' ? '你' : '智' }}
        </div>
        <component :is="message.role === 'assistant' ? 'details' : 'div'"
          class="agent-message__body" :class="{ 'agent-answer': message.role === 'assistant' }"
          :open="message.role === 'assistant' && (message.streaming || !!message.error)">
          <summary v-if="message.role === 'assistant'" class="agent-answer__summary">
            <strong>智能体回答</strong>
            <span>{{ message.streaming ? '执行中 · 实时更新' : message.error ? '执行异常 · 查看详情' : '展开查看回答与执行过程' }}</span>
            <span v-if="message.toolCalls?.length">{{ message.toolCalls.length }} 次工具调用</span>
          </summary>
          <div class="agent-message__meta">
            <strong>{{ message.role === 'user' ? '用户' : '智能体' }}</strong>
            <span v-if="message.model">实际模型：{{ message.model.name }}</span>
            <span v-if="message.stopped">已停止</span>
          </div>

          <details v-if="message.reasoning || message.toolCalls?.length || message.streaming" class="agent-execution" :open="message.streaming">
            <summary>执行过程 · {{ message.streaming ? '实时更新' : '已结束' }}</summary>
            <details v-if="message.reasoning" class="agent-reasoning" :open="message.streaming">
              <summary class="agent-reasoning__summary">
                <span class="agent-reasoning__label">模型返回的推理内容（非核验结论）</span>
                <span class="agent-reasoning__meta">{{ reasoningMeta(message) }}</span>
              </summary>
              <div class="agent-reasoning__body">{{ message.reasoning }}</div>
            </details>
            <p v-else-if="message.streaming" class="agent-tool__result">{{ message.toolCalls?.some(tool => tool.status === 'running') ? '工具执行中，等待服务返回；暂未收到新的模型推理文本。' : '模型处理中，等待实际返回的推理或工具调用。' }}</p>
          <div v-if="message.toolCalls?.length" class="agent-tools">
            <details
              v-for="tool in message.toolCalls"
              :key="tool.id"
              class="agent-tool"
              :class="`agent-tool--${tool.status}`"
              :open="tool.status === 'running'"
            >
              <summary class="agent-tool__summary">
                <span class="agent-tool__dot" aria-hidden="true"></span>
                <span class="agent-tool__name">{{ tool.name }}</span>
                <span class="agent-tool__args">{{ tool.summary || '无参数' }}</span>
                <span class="agent-tool__state">{{ toolStatusLabel(tool) }}</span>
                <span v-if="Number.isFinite(tool.ms)" class="agent-tool__state">{{ (tool.ms / 1000).toFixed(1) }} 秒</span>
                <span v-else-if="tool.status === 'running'" class="agent-tool__state">{{ elapsedLabel(tool.startedAt, clockNow) }}</span>
              </summary>
              <div class="agent-tool__detail">
                <p v-if="tool.status === 'running'" class="agent-tool__result">{{ waitingDetail(tool, clockNow) }}</p>
                <p v-if="tool.resultSummary" class="agent-tool__result">{{ tool.resultSummary }}</p>
                <ToolEvidence :tool="tool" />
                <details v-if="tool.data || Object.keys(tool.args || {}).length" class="agent-tool__technical">
                  <summary>调用参数与返回数据</summary>
                  <pre class="agent-tool__code" tabindex="0">{{ toolPayload(tool) }}</pre>
                </details>
              </div>
            </details>
          </div>

          </details>

          <p
            v-if="message.content && message.role === 'user'"
            class="agent-message__text"
          >{{ message.content }}</p>
          <div
            v-else-if="message.content"
            class="agent-message__text agent-message__markdown asc-md"
            v-html="renderMessageMarkdown(message)"
          ></div>
          <span v-if="message.streaming && !message.content && !message.reasoning" class="agent-message__pending">
            正在执行工具，等待知识服务返回回答<span aria-hidden="true">…</span>
          </span>
          <span v-if="message.streaming && message.content" class="agent-message__caret" aria-hidden="true"></span>
          <p v-if="message.answer_check" class="agent-check" role="status">
            {{ message.answer_check.status === 'knowledge_service_answer'
              ? '知识服务原答案 · Agent 未二次改写'
              : message.answer_check.status === 'no_service_answer'
                ? '知识工具未返回成文答案'
              : message.answer_check.status === 'blocked'
                ? '引用检查未通过'
              : message.answer_check.status === 'citations_valid_support_unverified'
              ? '引用完整性已检查 · 原文支持度尚未核验'
              : message.answer_check.status === 'incomplete'
                ? '回答未完成 · 本轮未发布已完成草稿'
                : `回答检查：${message.answer_check.status}（不代表科学结论已验证）` }}
          </p>
          <details v-for="item in citationEvidence(message)" :key="item.evidence_id" class="agent-reasoning">
            <summary>{{ item.evidence_id }} · {{ item.title || item.source_id || 'API原文片段' }}</summary>
            <div class="agent-reasoning__body">
              <p>来源：{{ item.source_id }} · 定位：{{ JSON.stringify(item.locator || {}) }} · 文档版本：{{ item.source_revision || '未知' }}</p>
              <p>{{ item.text }}</p>
            </div>
          </details>

          <div v-if="message.error" class="agent-message__error" role="alert">
            <p class="agent-message__error-text">{{ agentErrorMessage(message.error) }}</p>
            <details v-if="agentErrorMessage(message.error) !== message.error" class="agent-tool__technical">
              <summary>错误详情</summary>
              <pre class="agent-tool__code">{{ message.error }}</pre>
            </details>
            <p v-if="canRetry && message.id === lastAssistantId" class="agent-message__retry">
              <button type="button" class="agent-btn agent-btn--retry" @click="retryTurn">
                从断点续传
              </button>
              <span class="agent-message__retry-hint">{{ retryHint }}</span>
            </p>
          </div>
        </component>
      </article>
    </div>

    <p v-if="error && (!messages.length || streaming)" class="agent-panel__banner" role="alert">{{ agentErrorMessage(error) }}</p>

    <form class="agent-panel__composer" @submit.prevent="submit">
      <label class="sr-only" for="agent-panel-input">向智能体提问</label>
      <textarea
        id="agent-panel-input"
        ref="inputElement"
        v-model="draft"
        class="agent-panel__input"
        rows="5"
        :disabled="sending || (embedded && (!projectId || !graphId))"
        placeholder="围绕当前图谱提问，例如：SiC 与抗氧化性能有什么关联？追问可补充温度、气氛等条件。"
        @keydown.enter.exact.prevent="submit"
      ></textarea>
      <div class="agent-panel__composer-foot">
        <span class="agent-panel__hint">
          {{ selection.blocked ? '已禁用全部可用工具，无法发送' : 'Enter 发送 · Shift+Enter 换行' }}
        </span>
        <button
          v-if="streaming"
          type="button"
          class="agent-btn agent-btn--stop"
          @click="requestStop"
        >
          停止
        </button>
        <button
          v-else
          type="submit"
          class="agent-btn agent-btn--send"
          :disabled="sending || !draft.trim() || selection.blocked || (embedded && (!projectId || !graphId))"
        >
          发送
        </button>
      </div>
    </form>
  </section>
</template>

<script setup>
defineOptions({ name: 'AgentPanel' })

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RETRY_HINT, useAgentChat } from './useAgentChat.js'
import { describeRun } from './runStatus.js'
import { elapsedLabel, waitingDetail, timingLabel } from './executionTiming.js'
import ToolEvidence from './ToolEvidence.vue'
import { agentErrorMessage } from './errorMessage.js'
import { renderChatMarkdown } from '../../features/markdown/chatMarkdown.js'
import {
  createAgentSession,
  deleteAgentSession,
  getAgentMetrics,
  getAgentModels,
  getAgentSession,
  listAgentSessions
} from './api.js'
import { describeMetrics } from './metrics.js'
import {
  formatSessionTime,
  mapSessionDetail,
  mapSessionList,
  shortSessionId,
  suggestSessionTitle
} from './sessions.js'
import {
  MUTATING_TOOLS,
  buildRequestOptions,
  createDefaultToolPrefs,
  isToolEnabled,
  loadToolPrefs,
  resolveToolSelection,
  saveToolPrefs,
  setReadOnly,
  toggleTool
} from './toolPrefs.js'

const props = defineProps({
  initialSessionId: { type: String, default: '' },
  embedded: { type: Boolean, default: false },
  graphId: { type: String, default: '' },
  projectId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'history-change', 'session-change'])

const examples = [
  'SiC 与 ASC 耐火材料的抗氧化性能有哪些关联？请查找原文依据。',
  '在 1500℃ 空气气氛下，上面的结论是否仍然适用？',
  '比较两种材料性能时，哪些实验条件必须保持一致？'
]

const {
  messages,
  streaming,
  error,
  steps,
  tools,
  toolsError,
  sessionId,
  lastEventId,
  canRetry,
  send,
  retry,
  stop,
  requestStop,
  restoreActiveTurn,
  loadSession,
  startSession,
  adoptSession,
  loadTools,
  toolStatusLabel
} = useAgentChat({
  getModelId: () => selectedModelId.value,
  getContext: () => ({ ...(props.projectId ? { projectId: props.projectId } : {}), ...(props.graphId ? { graphId: props.graphId } : {}) }),
  // `selection` 在下方定义；箭头函数只在发送时求值，默认（全开）返回空对象。
  getRequestOptions: () => props.embedded ? { ...buildRequestOptions(selection.value), maxSteps: 6, maxTools: 8, timeoutMs: 300000 }
    : buildRequestOptions(selection.value)
})

const draft = ref('')
const creatingSession = ref(false)
const sending = computed(() => creatingSession.value || streaming.value)
let componentActive = true
const logElement = ref(null)
const inputElement = ref(null)
const authOpen = ref(false)
const prefs = ref(createDefaultToolPrefs())
const selectedModelId = ref('default')
const modelOptions = ref([{ id: 'default', label: '服务端默认', model: '由后端确认', configured: true }])
const modelsError = ref('')
const modelConfigOpen = ref(false)
const lastAssistant = computed(() => messages.value.findLast(message => message.role === 'assistant'))
const clockNow = ref(Date.now())
let clockTimer = null
watch(streaming, (active) => {
  clearInterval(clockTimer)
  clockTimer = null
  clockNow.value = Date.now()
  if (active) clockTimer = setInterval(() => { clockNow.value = Date.now() }, 1000)
})
const runStatus = computed(() => describeRun({ message: lastAssistant.value,
  streaming: streaming.value, creating: creatingSession.value, now: clockNow.value }))

function selectModel(id) {
  if (!sending.value && modelOptions.value.some((item) => item.id === id && item.configured)) selectedModelId.value = id
}

async function loadModels() {
  modelsError.value = ''
  try {
    const payload = await getAgentModels()
    modelOptions.value = payload.models
    if (!payload.models.some((item) => item.id === selectedModelId.value && item.configured)) selectedModelId.value = payload.default_id || 'default'
  } catch (err) {
    modelsError.value = err?.message || '模型名单读取失败'
    selectedModelId.value = 'default'
    modelOptions.value = [{ id: 'default', label: '服务端默认', model: '由后端确认', configured: true }]
  }
}

const toolNames = computed(() => tools.value.map(tool => tool.name))
const selection = computed(() => resolveToolSelection(prefs.value, toolNames.value))

function isToolOn(name) {
  return isToolEnabled(prefs.value, name)
}

function isLocked(name) {
  return prefs.value.readOnly && MUTATING_TOOLS.includes(name)
}

function toggleToolChip(name) {
  if (isLocked(name)) return
  prefs.value = toggleTool(prefs.value, name)
}

function applyReadOnly(value) {
  prefs.value = setReadOnly(prefs.value, value)
}

watch(prefs, value => { saveToolPrefs(value) }, { deep: true })

const readOnlyNote = computed(() => `只读：禁用配方优化（${MUTATING_TOOLS.join('、')}）`)

const statusText = computed(() => {
  if (creatingSession.value) return '正在创建会话'
  if (streaming.value) return '正在执行'
  if (lastAssistant.value?.stopped) return '已停止'
  if (error.value) return '执行失败'
  if (steps.value) return `上次执行 ${steps.value} 步`
  return '就绪'
})

const toolsHint = computed(() => {
  if (toolsError.value) return toolsError.value
  if (!tools.value.length) return '工具清单加载中…'
  return `已启用 ${selection.value.enabled.length}/${selection.value.total}`
})

const toolsHintTitle = computed(() => tools.value.map(tool => tool.name).join('、') || toolsError.value)

/* --- T9 运行指标（GET /api/agent/metrics） -------------------------------- */

const metricsOpen = ref(false)
const metricsLoading = ref(false)
const metricsError = ref('')
const metricsRaw = ref(null)
const metrics = computed(() => describeMetrics(metricsRaw.value))

async function refreshMetrics() {
  metricsLoading.value = true
  metricsError.value = ''
  try {
    metricsRaw.value = await getAgentMetrics()
  } catch (err) {
    metricsRaw.value = null
    metricsError.value = err?.message || '运行指标读取失败'
  } finally {
    metricsLoading.value = false
  }
}

function toggleMetrics() {
  metricsOpen.value = !metricsOpen.value
  if (metricsOpen.value) void refreshMetrics()
}

/* --- T3 会话历史（/api/agent/sessions） ---------------------------------- */

const sessionsOpen = ref(false)
const sessionsLoading = ref(false)
const sessions = ref([])
const sessionError = ref('')
/** 待确认删除的会话 id：删除历史不可撤销，必须二次确认。 */
const pendingDeleteId = ref('')
/** 会话存储不可用时的降级说明（提问照常，只是不落库/不能续传）。 */
const sessionPersistWarning = ref('')

async function refreshSessions() {
  sessionsLoading.value = true
  sessionError.value = ''
  try {
    sessions.value = mapSessionList(await listAgentSessions({ limit: 20 }))
  } catch (err) {
    sessions.value = []
    sessionError.value = err?.message || '会话列表读取失败'
  } finally {
    sessionsLoading.value = false
  }
}

function toggleSessions() {
  sessionsOpen.value = !sessionsOpen.value
  if (sessionsOpen.value) void refreshSessions()
}

/** 新建会话；服务端建失败时退回本地会话（不阻塞提问）。 */
async function newSession() {
  if (sending.value || !componentActive) return
  creatingSession.value = true
  sessionError.value = ''
  sessionPersistWarning.value = ''
  try {
    const created = await createAgentSession({ workspace: { projectId: props.projectId, graphId: props.graphId } })
    if (!componentActive) return
    startSession(created.sessionId)
    if (sessionsOpen.value) await refreshSessions()
  } catch (err) {
    if (!componentActive) return
    startSession('')
    sessionPersistWarning.value = `${err?.message || '新建会话失败'}：已切换为本地会话（不保存历史，也无法断点续传）。`
  } finally { creatingSession.value = false }
}

/** 打开历史会话：回填消息，并把后续提问接到同一个 sessionId 上。 */
async function openSession(id) {
  if (sending.value || !componentActive) return
  sessionError.value = ''
  sessionsLoading.value = true
  try {
    const detail = mapSessionDetail(await getAgentSession(id))
    if (!componentActive) return
    if (!detail) throw new Error('会话详情缺少 sessionId')
    const scope = detail.activeTurn?.scope || detail.researchState?.scope
    // 只要调用方给了范围（嵌入页或独立使用），就按范围守卫；未给范围则不做限制。
    const scopeMismatch = (props.projectId && scope?.projectId !== props.projectId)
      || (props.graphId && scope?.graphId !== props.graphId)
    if (scopeMismatch) throw new Error('该历史会话不属于当前图谱，请先选择对应项目；未记录范围的旧会话也不能直接续问。')
    loadSession(detail)
    sessionsOpen.value = false
    if (detail.activeTurn) void restoreActiveTurn(detail)
  } catch (err) {
    sessionError.value = err?.message || '会话详情读取失败'
  } finally {
    sessionsLoading.value = false
  }
}

async function removeSession(id) {
  if (sending.value || !componentActive) return
  pendingDeleteId.value = ''
  sessionError.value = ''
  try {
    await deleteAgentSession(id)
    if (id === sessionId.value) {
      startSession('')
      sessionPersistWarning.value = '当前会话已删除，下一次提问会自动新建会话。'
    }
    await refreshSessions()
  } catch (err) {
    sessionError.value = err?.message || '会话删除失败'
  }
}

/** 首次提问时惰性建会话：历史可回看、失败可续传；建失败也不阻塞提问。 */
async function ensureSession(text) {
  if (sessionId.value) return true
  sessionPersistWarning.value = ''
  try {
    const created = await createAgentSession({ title: suggestSessionTitle(text), workspace: { projectId: props.projectId, graphId: props.graphId } })
    if (!componentActive) return false
    adoptSession(created.sessionId)
  } catch (err) {
    if (!componentActive) return false
    sessionPersistWarning.value = `${err?.message || '会话创建失败'}：本轮不会保存，也无法断点续传。`
  }
  return true
}

/* --- T11 断点续传 --------------------------------------------------------- */

/** 折叠标题右侧的提示：流式且尚无正文时说明仍在思考，结束后只给字数。 */
function reasoningMeta(message) {
  const text = String(message?.reasoning || '')
  if (!text) return ''
  if (message?.streaming && message?.modelStatus?.status === 'running') return `模型响应中 · ${text.length} 字`
  return `${text.length} 字`
}

// 智能体输出按 markdown 渲染（渲染器先整体剥离/转义 HTML，模型文本不可执行）。
// 缓存按"内容本身"做键：流式增量是追加，但 final 帧会用等长的新文本替换内容，
// 只按长度缓存会命中陈旧结果（界面停在旧文本）。
const renderedMarkdownCache = new Map()
function renderMessageMarkdown(message) {
  const content = String(message?.content || '')
  const key = `${message?.id}\u0000${content}`
  const cached = renderedMarkdownCache.get(key)
  if (cached !== undefined) return cached
  if (renderedMarkdownCache.size > 300) renderedMarkdownCache.clear()
  const html = renderChatMarkdown(content)
  renderedMarkdownCache.set(key, html)
  return html
}

const lastAssistantId = computed(() => messages.value[messages.value.length - 1]?.id || '')
const retryHint = computed(() => `${RETRY_HINT}（续传点：事件 #${lastEventId.value ?? 0}）`)

async function retryTurn() {
  await retry()
}

// 一轮结束后刷新已展开的历史/指标，让轮次与统计跟上（关闭时不发请求）。
watch(streaming, (isStreaming, wasStreaming) => {
  if (isStreaming || !wasStreaming) return
  if (sessionsOpen.value) void refreshSessions()
  if (metricsOpen.value) void refreshMetrics()
})

function toolPayload(tool) {
  const payload = { args: tool.args, result: tool.data }
  try {
    return JSON.stringify(payload, null, 2)
  } catch (_error) {
    return String(tool.resultSummary || '')
  }
}

function useExample(example) {
  draft.value = example
  inputElement.value?.focus()
}

async function submit() {
  if (props.embedded && (!props.projectId || !props.graphId)) {
    sessionError.value = '请先选择当前图谱项目。'
    return false
  }
  const value = draft.value
  if (!value.trim() || sending.value || !componentActive || selection.value.blocked) return false
  draft.value = ''
  let ready
  creatingSession.value = true
  try { ready = await ensureSession(value.trim()) }
  finally { creatingSession.value = false }
  if (!ready || !componentActive) return false
  await send(value)
  return true
}

function scrollToLatest() {
  const element = logElement.value
  if (element) element.scrollTop = element.scrollHeight
}

async function submitExternal(payload) {
  if (payload?.image || payload?.enableMultimodalResponse) {
    sessionError.value = '当前 Agent 文本链路尚未接入图片；请使用原知识对话兼容入口，图片不会被静默忽略。'
    return false
  }
  if (sending.value || !componentActive || !payload?.question?.trim()) return false
  draft.value = payload.question
  return await submit()
}

function citationEvidence(message) {
  return (message.citations || []).map((citation) => ({ ...citation,
    ...((message.evidence || []).find((item) => item.evidence_id === citation.evidence_id) || {}),
    text: (message.evidence || []).find((item) => item.evidence_id === citation.evidence_id)?.text
      || citation.text || citation.quote
      || '当前流未返回该完整片段；本轮保存后可从会话历史回看完整 API 片段。' }))
}

watch(() => messages.value.length, (count) => emit('history-change', count > 0), { immediate: true })
watch(sessionId, id => emit('session-change', id))
watch(() => [props.initialSessionId, props.projectId, props.graphId], ([id]) => {
  if (!id || id === sessionId.value || (props.embedded && (!props.projectId || !props.graphId))) return
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    sessionError.value = '历史会话链接无效，请从会话历史入口打开。'
    return
  }
  void openSession(id)
}, { immediate: true })

watch(
  () => {
    const last = messages.value[messages.value.length - 1]
    return `${messages.value.length}:${last?.content?.length ?? 0}:${last?.toolCalls?.length ?? 0}`
  },
  () => { void nextTick(scrollToLatest) }
)

onMounted(() => {
  prefs.value = loadToolPrefs()
  void loadTools()
  void loadModels()
})
onUnmounted(() => { componentActive = false; clearInterval(clockTimer); stop() })

defineExpose({ messages, streaming, sending, steps, sessionId, submitExternal, startNewDiscussion: newSession })
</script>

<style scoped>
.agent-run { margin: 14px 16px; padding: 14px 16px; border: 1px solid var(--asc-border, #cbd5e1); border-left: 4px solid #94a3b8; border-radius: 10px; background: var(--asc-surface-soft, #f8fafc); color: var(--asc-text, #334155); }
.agent-run--live { border-left-color: #0874b9; background: #eef7ff; }
.agent-run--warning { border-left-color: #b87913; background: #fff9ed; }
.agent-run--error { border-left-color: #bf4040; background: #fff2f2; }
.agent-run__heading { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.agent-run__eyebrow { font-size: 11px; letter-spacing: .08em; color: var(--asc-muted, #64748b); }
.agent-run__heading strong { font-size: 16px; }
.agent-run p { margin: 8px 0 0; font-size: 13px; line-height: 1.6; }
.agent-run__scope { display: flex; gap: 6px 20px; flex-wrap: wrap; font-size: 12px; margin-top: 10px; overflow-wrap: anywhere; }
.agent-run__counts, .agent-run__model { font-size: 12px; }
.agent-run__counts { margin-top: 8px; }
.agent-run .agent-run__note { font-size: 11px; color: var(--asc-muted, #64748b); }
@media (max-width: 560px) { .agent-run { margin: 10px 8px; padding: 12px; } .agent-run__scope { flex-direction: column; } }
.agent-model-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--asc-border); }
.agent-model-bar select { min-height: var(--agent-ctl-h); max-width: 100%; padding: 0 var(--agent-space-2); border: 1px solid var(--agent-border-color); border-radius: var(--agent-ctl-radius); background: var(--agent-surface); color: var(--agent-ink); font: inherit; font-size: var(--agent-font-sm); }
.agent-model-bar label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.agent-model-bar p, .agent-model-guide { font-size: 12px; overflow-wrap: anywhere; }
.agent-model-guide { padding: 12px 16px; background: var(--asc-surface-soft); }
.agent-panel--embedded { width: 100%; border-radius: var(--qa-radius-card, 12px); }
.agent-check { font-size: 12px; color: var(--qa-text, #334155); padding: 8px; background: var(--qa-surface-soft, #f1f5f9); }
.agent-panel {
  /* 面板内的次要文本：由设计令牌派生，保证 11.5px 下仍满足 AA 对比度 */
  --agent-muted: color-mix(in srgb, var(--asc-muted) 82%, var(--asc-heading));
  /* 嵌入问题研究页面时对齐 QA 控件网格 / 面板语言；独立使用时回落到平台令牌 */
  --agent-ctl-h: var(--qa-control-h, var(--pl-ctl-h, 32px));
  --agent-ctl-h-sm: var(--qa-control-h-sm, 28px);
  --agent-chip-h: var(--qa-chip-h, 24px);
  --agent-ctl-radius: var(--qa-radius-control, var(--asc-control-radius));
  --agent-card-radius: var(--qa-radius-card, var(--pl-card-radius, 12px));
  --agent-container-radius: var(--qa-radius-container, var(--pl-card-radius, 12px));
  --agent-chip-radius: var(--qa-radius-chip, 999px);
  --agent-border-color: var(--qa-border-color, var(--asc-border));
  --agent-surface: var(--qa-surface, var(--asc-surface));
  --agent-surface-soft: var(--qa-surface-soft, var(--asc-surface-soft));
  --agent-ink: var(--qa-text, var(--asc-text));
  --agent-heading: var(--qa-heading, var(--asc-heading));
  --agent-font-xs: var(--qa-font-xs, 11px);
  --agent-font-sm: var(--qa-font-sm, 12px);
  --agent-font-md: var(--qa-font-md, 14px);
  --agent-font-lg: var(--qa-font-lg, 15px);
  --agent-title-size: var(--qa-title-size, 15px);
  --agent-space-1: var(--qa-space-1, 4px);
  --agent-space-2: var(--qa-space-2, 8px);
  --agent-space-3: var(--qa-space-3, 12px);
  --agent-space-4: var(--qa-space-4, 16px);
  --agent-space-5: var(--qa-space-5, 20px);
  --agent-shadow-card: var(--qa-shadow-card, 0 1px 2px rgba(16, 42, 67, 0.05));
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-container-radius);
  background: var(--agent-surface);
  box-shadow: var(--agent-shadow-card);
  overflow: hidden;
}

.agent-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--agent-space-2);
  padding: var(--agent-space-3) var(--agent-space-4);
  border-bottom: 1px solid var(--agent-border-color);
  background: var(--agent-surface-soft);
}

.agent-panel__heading {
  display: flex;
  align-items: center;
  gap: var(--agent-space-2);
  min-width: 0;
}

.agent-panel__badge {
  display: grid;
  place-items: center;
  width: var(--agent-ctl-h);
  height: var(--agent-ctl-h);
  flex: 0 0 auto;
  border-radius: var(--agent-ctl-radius);
  background: var(--asc-primary);
  color: #fff;
  font-size: var(--agent-font-xs);
  font-weight: 800;
  letter-spacing: 0.04em;
}

.agent-panel__title {
  margin: 0;
  color: var(--agent-heading);
  font-size: var(--agent-title-size);
  font-weight: 800;
  line-height: 1.3;
}

.agent-panel__beta {
  min-height: var(--agent-chip-h);
  display: inline-flex;
  align-items: center;
  margin-left: var(--agent-space-1);
  padding: 0 var(--agent-space-2);
  border-radius: var(--agent-chip-radius);
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
  font-size: var(--agent-font-xs);
  font-weight: 800;
}

.agent-panel__subtitle {
  margin: 2px 0 0;
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
}

.agent-panel__head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--agent-space-2);
  flex: 0 1 auto;
  flex-wrap: wrap;
}

.agent-panel__status {
  display: inline-flex;
  align-items: center;
  gap: var(--agent-space-1);
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  font-weight: var(--qa-weight-semibold, 650);
  white-space: nowrap;
}

.agent-panel__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--asc-border-strong);
}

.agent-panel__status-dot--live {
  background: var(--asc-primary);
  animation: agent-pulse 1.2s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.agent-panel__tools-hint {
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
  white-space: nowrap;
}

.agent-panel__session {
  min-height: var(--agent-chip-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-chip-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--agent-font-xs);
  font-weight: 650;
  white-space: nowrap;
}

.agent-panel__ghost {
  min-height: var(--agent-ctl-h);
  padding: 0 var(--agent-space-3);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  font-weight: 650;
  cursor: pointer;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.agent-panel__ghost:hover:not(:disabled) {
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
}

.agent-panel__ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-auth {
  display: grid;
  gap: var(--agent-space-2);
  padding: var(--agent-space-2) var(--agent-space-4) var(--agent-space-3);
  border-bottom: 1px solid var(--agent-border-color);
  background: var(--agent-surface-soft);
}

.agent-auth__row {
  display: flex;
  align-items: center;
  gap: var(--agent-space-2);
  flex-wrap: wrap;
}

.agent-auth__title {
  color: var(--agent-heading);
  font-size: var(--agent-font-sm);
  font-weight: 800;
}

.agent-auth__count {
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
}

.agent-auth__switch {
  margin-left: auto;
  min-height: var(--agent-ctl-h-sm);
  padding: 0 var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-chip-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  font-weight: 700;
  cursor: pointer;
}

.agent-auth__switch--on {
  border-color: var(--asc-warning);
  background: var(--asc-warning-soft);
  color: #7d520a;
}

.agent-auth__note {
  margin: 0;
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
  line-height: 1.6;
}

.agent-auth__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--agent-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-chip {
  min-height: var(--agent-chip-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-chip-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--agent-font-xs);
  font-weight: 650;
  transition: border-color var(--asc-transition), background var(--asc-transition);
}

.agent-chip--on {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
}

.agent-chip--locked {
  border-style: dashed;
  opacity: 0.62;
  text-decoration: line-through;
}

.agent-chip--locked:disabled {
  cursor: not-allowed;
}

.agent-auth__warning {
  margin: 0;
  padding: var(--agent-space-1) var(--agent-space-2);
  border-left: 3px solid var(--asc-danger);
  border-radius: var(--agent-space-1);
  background: #fdf1f1;
  color: #8f3232;
  font-size: var(--agent-font-sm);
}

/* 会话历史 / 运行指标：同一个折叠区骨架，避免两套外观 */
.agent-meta {
  display: grid;
  gap: var(--agent-space-2);
  padding: var(--agent-space-2) var(--agent-space-4) var(--agent-space-3);
  border-bottom: 1px solid var(--agent-border-color);
  background: var(--agent-surface-soft);
}

.agent-meta__row {
  display: flex;
  align-items: center;
  gap: var(--agent-space-2);
  flex-wrap: wrap;
}

.agent-meta__title {
  color: var(--agent-heading);
  font-size: var(--agent-font-sm);
  font-weight: 800;
}

.agent-meta__line {
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.agent-meta__note {
  margin: 0;
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
  line-height: 1.6;
}

.agent-meta__warning {
  margin: 0;
  padding: var(--agent-space-1) var(--agent-space-2);
  border-left: 3px solid var(--asc-danger);
  border-radius: var(--agent-space-1);
  background: #fdf1f1;
  color: #8f3232;
  font-size: var(--agent-font-sm);
  line-height: 1.6;
}

.agent-meta__refresh {
  margin-left: auto;
  min-height: var(--agent-ctl-h-sm);
  padding: 0 var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  font-weight: 650;
  cursor: pointer;
}

.agent-meta__refresh:hover:not(:disabled) {
  border-color: var(--asc-primary);
  color: var(--asc-primary-hover);
}

.agent-meta__refresh:disabled {
  opacity: 0.6;
  cursor: progress;
}

.agent-meta__tools {
  display: grid;
  gap: var(--agent-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-meta__tools li {
  display: flex;
  align-items: baseline;
  gap: var(--agent-space-2);
  flex-wrap: wrap;
  color: var(--agent-ink);
  font-size: var(--agent-font-xs);
  font-variant-numeric: tabular-nums;
}

.agent-meta__tools code {
  color: var(--agent-heading);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
}

.agent-meta__errors {
  color: var(--asc-danger);
  font-weight: 650;
}

.agent-sessions__list {
  max-height: 240px;
  overflow-y: auto;
  display: grid;
  gap: var(--agent-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-panel__primary {
  background: var(--asc-primary, #086cac);
  color: white;
  border-color: var(--asc-primary, #086cac);
}

.agent-answer__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
  color: var(--asc-primary, #086cac);
  list-style: none;
}

.agent-answer__summary::before { content: '▸'; }
.agent-answer[open] > .agent-answer__summary::before { content: '▾'; }
.agent-answer__summary span { font-size: 12px; font-weight: 400; }
.agent-answer:not([open]) { padding-top: 0; padding-bottom: 0; }
.agent-execution {
  margin: 8px 0 12px;
  padding: 10px;
  border: 1px solid var(--asc-border, #d1dfed);
  border-radius: 8px;
  background: var(--asc-surface-muted, #f5f9fd);
}
.agent-execution > summary,
.agent-tool__technical > summary { cursor: pointer; font-size: 12px; }
.agent-execution > summary { font-weight: 600; margin-bottom: 8px; }
.agent-tool__technical { margin-top: 8px; }

.agent-sessions__item {
  display: flex;
  align-items: stretch;
  gap: var(--agent-space-1);
  min-width: 0;
}

.agent-session {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--agent-space-2);
  flex: 1;
  min-width: 0;
  min-height: var(--agent-ctl-h-sm);
  padding: var(--agent-space-1) var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--asc-transition), background var(--asc-transition);
}

.agent-session:hover:not(:disabled) {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
}

.agent-session--active {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
}

.agent-session:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-session__title {
  min-width: 0;
  overflow: hidden;
  color: var(--agent-heading);
  font-size: var(--agent-font-sm);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-session__meta {
  flex: 0 0 auto;
  color: var(--agent-muted);
  font-size: var(--agent-font-xs);
  font-variant-numeric: tabular-nums;
}

.agent-session__delete {
  flex: 0 0 auto;
  min-height: var(--agent-ctl-h-sm);
  padding: 0 var(--agent-space-2);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--asc-muted);
  font-size: var(--agent-font-xs);
  font-weight: 650;
  cursor: pointer;
}

.agent-session__delete:hover:not(:disabled) {
  border-color: var(--asc-danger);
  color: var(--asc-danger);
}

.agent-session__delete--confirm {
  border-color: var(--asc-danger);
  background: #fdf1f1;
  color: #8f3232;
  font-weight: 700;
}

.agent-session__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-panel__log {
  flex: 1;
  min-height: clamp(320px, 38vh, 480px);
  max-height: min(56vh, 640px);
  overflow-y: auto;
  padding: var(--agent-space-4);
  background: var(--asc-canvas);
}

.agent-panel__empty {
  display: grid;
  gap: var(--agent-space-2);
  justify-items: start;
  padding: var(--agent-space-2) var(--agent-space-1);
}

.agent-panel__empty-title {
  margin: 0;
  color: var(--agent-heading);
  font-size: var(--agent-font-md);
  font-weight: 800;
}

.agent-panel__empty-text {
  margin: 0;
  max-width: 60ch;
  color: var(--agent-ink);
  font-size: var(--agent-font-md);
  line-height: 1.7;
}

.agent-panel__examples {
  display: grid;
  gap: var(--agent-space-1);
  width: 100%;
  margin: var(--agent-space-1) 0 0;
  padding: 0;
  list-style: none;
}

.agent-panel__examples button {
  width: 100%;
  min-height: var(--agent-ctl-h);
  padding: var(--agent-space-1) var(--agent-space-3);
  border: 1px dashed var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-size: var(--agent-font-md);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--asc-transition), background var(--asc-transition);
}

.agent-panel__examples button:hover {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
}

.agent-message {
  display: grid;
  grid-template-columns: var(--agent-ctl-h-sm) minmax(0, 1fr);
  gap: var(--agent-space-2);
  margin-bottom: var(--agent-space-3);
}

.agent-message--user {
  grid-template-columns: minmax(0, 1fr) var(--agent-ctl-h-sm);
}

.agent-message__avatar {
  display: grid;
  place-items: center;
  width: var(--agent-ctl-h-sm);
  height: var(--agent-ctl-h-sm);
  border-radius: var(--agent-chip-radius);
  background: var(--asc-primary);
  color: #fff;
  font-size: var(--agent-font-xs);
  font-weight: 800;
}

.agent-message--user .agent-message__avatar {
  grid-column: 2;
  grid-row: 1;
  background: #5b5bd6;
}

.agent-message__body {
  min-width: 0;
  padding: var(--agent-space-2) var(--agent-space-3);
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-card-radius);
  background: var(--agent-surface);
}

.agent-message--user .agent-message__body {
  grid-column: 1;
  grid-row: 1;
  border-color: #c9cdf7;
  background: #eef0fe;
}

.agent-message__meta {
  display: flex;
  gap: var(--agent-space-2);
  align-items: baseline;
  margin-bottom: var(--agent-space-1);
  color: var(--asc-muted);
  font-size: var(--agent-font-xs);
}

.agent-message__meta strong {
  color: var(--agent-heading);
  font-size: var(--agent-font-sm);
  font-weight: 800;
}

.agent-message__text {
  margin: 0;
  color: var(--agent-ink);
  font-size: var(--agent-font-md);
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* markdown 容器不能沿用 pre-wrap：渲染块之间的换行会被显示成多余空行 */
.agent-message__markdown {
  white-space: normal;
}

/* 思考过程：默认收起，点击展开；流式期间左侧加一条活动指示 */
.agent-reasoning {
  margin: 0 0 8px;
  border: 1px solid var(--asc-border, rgba(15, 42, 70, 0.12));
  border-radius: 8px;
  background: rgba(15, 42, 70, 0.03);
  font-size: calc(var(--agent-font-md) - 1px);
}

.agent-reasoning__summary {
  display: flex;
  overflow-wrap: anywhere;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--asc-muted, #5b7591);
  font-weight: 600;
  list-style: none;
}

.agent-reasoning__summary::-webkit-details-marker {
  display: none;
}

.agent-reasoning__summary::before {
  content: '▸';
  font-size: 11px;
  transition: transform 0.15s ease;
}

.agent-reasoning[open] .agent-reasoning__summary::before {
  transform: rotate(90deg);
}

.agent-reasoning--live .agent-reasoning__label::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: agent-reasoning-pulse 1.1s ease-in-out infinite;
}

@keyframes agent-reasoning-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

.agent-reasoning__meta {
  margin-left: auto;
  font-weight: 500;
  opacity: 0.8;
}

.agent-reasoning__body {
  max-height: 260px;
  overflow: auto;
  padding: 0 10px 10px;
  border-top: 1px solid rgba(15, 42, 70, 0.08);
  margin-top: 2px;
  padding-top: 8px;
  color: var(--asc-muted, #5b7591);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.agent-message__pending {
  color: var(--asc-muted);
  font-size: var(--agent-font-md);
}

.agent-message__caret {
  display: inline-block;
  width: 7px;
  height: 13px;
  margin-left: 2px;
  background: var(--asc-primary);
  vertical-align: -2px;
  animation: agent-caret 1s steps(2, end) infinite;
}

@keyframes agent-caret {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.agent-message__error {
  margin: var(--agent-space-1) 0 0;
  padding: var(--agent-space-1) var(--agent-space-2);
  border-left: 3px solid var(--asc-danger);
  border-radius: var(--agent-space-1);
  background: #fdf1f1;
  color: #8f3232;
  font-size: var(--agent-font-sm);
}

.agent-message__error-text {
  margin: 0;
}

.agent-message__retry {
  display: flex;
  align-items: center;
  gap: var(--agent-space-2);
  flex-wrap: wrap;
  margin: var(--agent-space-2) 0 0;
}

.agent-message__retry-hint {
  color: #8f3232;
  font-size: var(--agent-font-xs);
  line-height: 1.5;
}

.agent-btn--retry {
  min-height: var(--agent-ctl-h-sm);
  padding: 0 var(--agent-space-3);
  border: 1px solid #e3b6b6;
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--asc-danger);
  font-size: var(--agent-font-sm);
  cursor: pointer;
}

.agent-btn--retry:hover {
  border-color: var(--asc-danger);
  background: #fff6f6;
}

.agent-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--agent-space-1);
  margin: 0 0 var(--agent-space-2);
}

.agent-tool {
  min-width: 0;
  border: 1px solid var(--agent-border-color);
  border-left: 3px solid var(--asc-muted);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface-soft);
}

.agent-tool--running { border-left-color: var(--asc-primary); }
.agent-tool--ok { border-left-color: var(--asc-success); }
.agent-tool--error { border-left-color: var(--asc-danger); }
.agent-tool--budget_denied { border-left-color: #b7791f; }

.agent-tool__summary {
  display: flex;
  align-items: center;
  gap: var(--agent-space-2);
  padding: var(--agent-space-1) var(--agent-space-2);
  cursor: pointer;
  list-style: none;
  font-size: var(--agent-font-sm);
}

.agent-tool__summary::-webkit-details-marker { display: none; }

.agent-tool__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--asc-muted);
}

.agent-tool--running .agent-tool__dot { background: var(--asc-primary); }
.agent-tool--ok .agent-tool__dot { background: var(--asc-success); }
.agent-tool--error .agent-tool__dot { background: var(--asc-danger); }
.agent-tool--budget_denied .agent-tool__dot { background: #b7791f; }

.agent-tool__name {
  flex: 0 0 auto;
  color: var(--asc-heading);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
}

.agent-tool__args {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--asc-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--agent-font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-tool__state {
  flex: 0 0 auto;
  color: var(--asc-muted);
  font-size: var(--agent-font-xs);
  font-weight: 700;
}

.agent-tool--ok .agent-tool__state { color: var(--asc-success); }
.agent-tool--error .agent-tool__state { color: var(--asc-danger); }
.agent-tool--budget_denied .agent-tool__state { color: #946200; }

.agent-tool__detail {
  padding: 0 var(--agent-space-2) var(--agent-space-2);
}

.agent-tool__result {
  margin: 0 0 var(--agent-space-1);
  color: var(--agent-ink);
  font-size: var(--agent-font-sm);
  line-height: 1.6;
}

.agent-tool__code {
  max-width: 100%;
  max-height: 180px;
  margin: 0;
  padding: var(--agent-space-2);
  overflow: auto;
  border-radius: var(--agent-ctl-radius);
  background: var(--qa-surface-muted, #f2f5f9);
  color: #33445c;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--agent-font-xs);
  line-height: 1.55;
}

.agent-panel__banner {
  margin: 0;
  padding: var(--agent-space-2) var(--agent-space-4);
  border-top: 1px solid var(--agent-border-color);
  background: #fdf1f1;
  color: #8f3232;
  font-size: var(--agent-font-sm);
}

.agent-panel__composer {
  display: grid;
  gap: var(--agent-space-2);
  padding: var(--agent-space-4);
  border-top: 1px solid var(--agent-border-color);
  background: var(--agent-surface);
}

.agent-panel__input {
  width: 100%;
  min-height: 128px;
  box-sizing: border-box;
  padding: var(--agent-space-3) var(--agent-space-4);
  border: 1px solid var(--asc-border-strong);
  border-radius: var(--agent-ctl-radius);
  background: var(--agent-surface);
  color: var(--agent-ink);
  font-size: 16px;
  line-height: 1.6;
  resize: vertical;
}

.agent-panel__input:focus-visible {
  border-color: var(--asc-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(8, 105, 173, 0.18);
}

.agent-panel__input:disabled {
  background: #f4f7fa;
  cursor: not-allowed;
}

.agent-panel__composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--agent-space-2);
}

.agent-panel__hint {
  color: var(--agent-muted);
  font-size: var(--agent-font-sm);
}

.agent-btn {
  min-height: var(--agent-ctl-h);
  padding: 0 var(--agent-space-4);
  border: none;
  border-radius: var(--agent-ctl-radius);
  font-size: var(--agent-font-md);
  font-weight: var(--qa-weight-bold, 750);
  cursor: pointer;
  transition: background var(--asc-transition), transform var(--asc-transition);
}

.agent-btn--send {
  background: var(--asc-primary);
  color: #fff;
}

.agent-btn--send:hover:not(:disabled) {
  background: var(--asc-primary-hover);
}

.agent-btn--send:disabled {
  background: #dee2e6;
  color: #6c757d;
  cursor: not-allowed;
}

.agent-btn--stop {
  background: #fff;
  color: var(--asc-danger);
  border: 1px solid #e3b6b6;
}

.agent-btn--stop:hover {
  background: #fdf1f1;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .agent-panel__head {
    flex-direction: column;
    align-items: stretch;
  }

  .agent-panel__head-actions {
    justify-content: flex-end;
  }

  .agent-panel__log {
    min-height: 260px;
    max-height: 60vh;
  }

  .agent-panel__composer {
    padding: var(--agent-space-3);
  }

  .agent-panel__input {
    min-height: 112px;
  }
}
</style>
