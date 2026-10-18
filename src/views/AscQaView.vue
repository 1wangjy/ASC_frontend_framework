<template>
  <div
    class="qa-layout"
    :class="{
      'qa-layout--recent': qaState.mode === 'multi' && useLegacyDiscussion && !qaState.evidenceOpen,
      'qa-layout--evidence': qaState.evidenceOpen || qualityOpen
    }"
  >
    <main class="qa-main">
      <header class="qa-topbar">
        <!-- 左：页面信息 + 任务状态（不再放任何操作按钮） -->
        <div class="qa-topbar__info">
          <strong v-if="qaState.phase === 'empty'">问题研究</strong>
          <strong v-else>研究答疑 / 热震稳定性</strong>
        </div>
        <!-- 右：图谱选择（唯一操作入口） -->
        <div
          class="qa-project-context"
          :class="{ 'qa-project-context--required': projectRequired, 'qa-project-context--error': !!projectError }"
          :title="projectUnavailableMessage || '当前问答所依据的图谱项目'"
        >
          <span>当前图谱</span>
          <strong>{{ activeProject ? projectLabel(activeProject) : '未选择项目' }}</strong>
          <button
            type="button"
            :disabled="multiNavigationLocked || projectsLoading"
            :class="{ 'qa-project-context__action--required': projectRequired }"
            @click="onProjectAction"
          >
            {{ projectActionLabel }}
          </button>
        </div>
      </header>

      <section
        v-if="qaState.mode === 'multi'"
        class="qa-multi-page"
        :class="multiHasHistory ? 'qa-multi-page--history' : 'qa-multi-page--empty'"
      >
        <div class="qa-empty__intro qa-research-intro qa-multi-page__intro">
          <QaModeSwitcher
            mode="multi"
            :disabled="multiNavigationLocked"
            @update:mode="updateMode"
          />
          <QaIntroHero :open="heroOpen" @toggle="toggleHero" />
        </div>


        <div class="qa-stage">
          <div class="qa-stage__left">
            <GraphStatusOrb :project-id="activeProject?.projectId || ''" />
          </div>

          <div
            class="qa-multi-page__workspace qa-stage__main"
          :class="[multiHasHistory
            ? 'qa-multi-page__workspace--history'
            : 'qa-multi-page__workspace--empty',
            { 'qa-multi-page__workspace--agent': !useLegacyDiscussion }]"
        >
          <div class="qa-multi-page__discussion">
            <MultiDiscussionPanel
              v-if="useLegacyDiscussion"
              ref="multiDiscussionPanel"
              :key="activeProject?.graphId"
              embedded
              :graph-options="multiGraphOptions"
              :selected-graph-id="activeProject?.graphId || ''"
              @history-change="onMultiHistoryChange"
              @select-prompt="draft = $event"
            />
            <AgentPanel
              v-else
              ref="multiDiscussionPanel"
              :key="`agent-${activeProject?.projectId || ''}-${activeProject?.graphId || ''}`"
              embedded
              :project-id="activeProject?.projectId || ''"
              :graph-id="activeProject?.graphId || ''"
              :initial-session-id="typeof route.query.agentSession === 'string' ? route.query.agentSession : ''"
              @session-change="onAgentSessionChange"
              @history-change="onMultiHistoryChange"
            />
          </div>

          <QuestionComposer
            v-if="useLegacyDiscussion"
            v-model="draft"
            compact
            :disabled="multiSending || !activeProject"
            mode="multi"
            :settings="qaState.settings"
            :model-options="composerModelOptions"
            @update:settings="updateSettings"
            @submit="sendQuestion"
          />
        </div>

          <!-- 右侧会话目录：顶部"+ 新建对话"，其下按 workspace 折叠分组的历史会话 -->
          <QaSessionToc
            v-if="showSessionToc"
            class="qa-stage__toc"
            :active-session-id="typeof route.query.agentSession === 'string' ? route.query.agentSession : ''"
            :projects="projects"
            :active-project-id="activeProjectId"
            :locked="multiNavigationLocked"
            :refresh-key="tocRefreshKey"
            @create="newMultiDiscussion"
            @open="openSessionFromToc"
            @deleted="onSessionDeleted"
          />
        </div>

      </section>

      <section v-else class="qa-single-page">
        <div class="qa-empty__intro qa-research-intro">
          <QaModeSwitcher
            :mode="qaState.mode"
            :disabled="qaState.phase === 'loading'"
            @update:mode="updateMode"
          />
          <QaIntroHero :open="heroOpen" @toggle="toggleHero" />
        </div>

        <div class="qa-stage qa-stage--narrow">
          <div class="qa-stage__left">
            <GraphStatusOrb :project-id="activeProject?.projectId || ''" />
          </div>

          <div class="qa-stage__main">
            <div v-if="showQaHome" class="qa-empty">
              <QuestionComposer
                v-model="draft"
                :show-mode-switcher="false"
                :disabled="projectsLoading || !activeProject"
                :mode="qaState.mode"
                :mode-disabled="qaState.phase === 'loading'"
                :settings="qaState.settings"
                :model-options="composerModelOptions"
                @update:mode="updateMode"
                @update:settings="updateSettings"
                @submit="sendQuestion"
              />

              <TaskShortcuts
                :guides="questionGuides"
                @select="draft = $event"
                @refresh="refreshGuide"
              />
            </div>

            <div v-else class="qa-session">
              <div class="qa-session__scroll">
              <header class="qa-result-context">
                <div class="qa-result-context__summary">
                  <span class="qa-result-context__label">
                    <span class="qa-result-context__label-icon" aria-hidden="true">▣</span>
                    问题摘要
                  </span>
                  <strong class="qa-result-context__question">{{ qaState.question }}</strong>
                </div>
                <div class="qa-result-context__mode">
                  <span>当前问答模式</span>
                  <strong class="qa-result-context__mode-badge">{{ qaModeLabel }}</strong>
                </div>
              </header>

              <ConversationPanel
                :state="qaState"
                :evaluation-enabled="evaluationEnabled"
                @citation="chooseCitation"
                @open-evidence="openEvidencePanel"
                @open-quality="openQualityPanel"
                @answer-selection="captureEvaluationExcerpt"
                @retry="retryQuestion"
              />

              <AnswerDetailsTabs
                v-if="qaState.phase === 'answered' && qaState.answerDetails?.length"
                :active-tab="answerDetailTab"
                :items="qaState.answerDetails"
                :references="qaState.references"
                :question="qaState.question"
                :result="qaState.qaResult"
                @select="answerDetailTab = $event"
                @citation="chooseCitation"
              />
              </div>

              <QuestionComposer
                v-model="draft"
                compact
                :disabled="qaState.phase === 'loading' || !activeProject"
                :mode="qaState.mode"
                :mode-disabled="qaState.phase === 'loading'"
                :settings="qaState.settings"
                @update:mode="updateMode"
                @update:settings="updateSettings"
                @submit="sendQuestion"
              />
            </div>
          </div>

          <QaSessionToc
            class="qa-stage__toc"
            mode="single"
            :active-session-id="singleSessionId"
            :projects="projects"
            :active-project-id="activeProjectId"
            :locked="qaState.phase === 'loading'"
            :refresh-key="tocRefreshKey"
            @create="startNewSingleSession"
            @open="openSingleSession"
            @deleted="onSingleSessionDeleted"
          />
        </div>
      </section>
    </main>

    <RecentConversationsPanel
      v-if="!qaState.evidenceOpen && qaState.mode === 'multi' && useLegacyDiscussion"
      :mode="qaState.mode"
      :disabled="multiNavigationLocked"
    />



    <EvidencePanel
      v-if="qaState.evidenceOpen"
      :references="qaState.references"
      :selected-citation-id="qaState.selectedCitationId"
      @close="qaState = { ...qaState, evidenceOpen: false }"
      @select="chooseCitation"
    />

    <QualityPanel
      v-if="qualityOpen"
      :result="qaState.qaResult"
      :evaluation="qaState.evaluation"
      :evaluation-enabled="evaluationEnabled"
      :answer-summary="evaluationAnswerSummary"
      @close="qualityOpen = false"
      @update:evaluation="patchEvaluation"
      @save-manual="saveManualEvaluation"
      @run-llm="runLlmEvaluation"
      @save-llm="saveLlmEvaluation"
    />

    <QaProjectSelector
      :open="selectorOpen"
      :projects="projects"
      :selected-project-id="activeProjectId"
      :loading="projectsLoading"
      :error="projectError"
      @select="selectQualifiedProject"
      @close="selectorOpen = false"
      @refresh="retryQualifiedProjects"
    />
  </div>
</template>

<script setup>
defineOptions({ name: 'AscQaView' })

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import '../features/qa/qa-ui.css'
import QuestionComposer from '../features/qa/QuestionComposer.vue'
import TaskShortcuts from '../features/qa/TaskShortcuts.vue'
import ConversationPanel from '../features/qa/ConversationPanel.vue'
import { needsModelModeOptions, resolveModelModeSelection } from '../features/qa/qaModelMode.js'
import AnswerDetailsTabs from '../features/qa/AnswerDetailsTabs.vue'
import EvidencePanel from '../features/qa/EvidencePanel.vue'
import QualityPanel from '../features/qa/QualityPanel.vue'
import RecentConversationsPanel from '../features/qa/RecentConversationsPanel.vue'
import QaSessionToc from '../platform/agent/QaSessionToc.vue'
import { appendAgentTurn, createAgentSession, getAgentSession } from '../platform/agent/api'
import QaModeSwitcher from '../features/qa/QaModeSwitcher.vue'
import QaIntroHero from '../features/qa/QaIntroHero.vue'
import QaProjectSelector from '../features/qa/QaProjectSelector.vue'
import MultiDiscussionPanel from '../features/qa/multiDiscussion/MultiDiscussionPanel.vue'
import AgentPanel from '../platform/agent/AgentPanel.vue'
import { getMultiDiscussionCapabilities } from '../features/qa/multiDiscussion/api.js'
import {
  clearSavedMultiDiscussion,
  shouldLockMultiDiscussionNavigation
} from '../features/qa/multiDiscussion/sessionStorage.js'
import {
  codGraphRAGQuery,
  getProject,
  judgeQAWithLLM,
  submitQAFeedback
} from '../api/graph.js'
import { recentConversations } from '../features/navigation/appNavigation.js'
import { findRecentConversation } from '../features/navigation/recentConversationModel.js'
import {
  createAnswerEvaluationService,
  getAnswerEvaluationErrorMessage
} from '../features/qa/answerEvaluationService.js'
import {
  normalizeAnswerExcerpt,
  patchAnswerEvaluation,
  setManualVerdict
} from '../features/qa/answerEvaluationModel.js'
import {
  canEvaluateAnswer,
  completeApiAnswer,
  createQaState,
  domesticModelOptions,
  failApiAnswer,
  resetConversation,
  selectQaMode,
  selectCitation,
  submitQuestion,
  updateAnswerEvaluation,
  updateQaSettings
} from '../features/qa/qaDemoModel.js'
import {
  isInvalidGraphScopeError,
  isInvalidQaEligibilityError,
  requestCodAnswer
} from '../features/qa/qaApiAdapter.js'
import { getBrowserStorage } from '../features/projects/projectContextModel.js'
import { createQaProjectContextController } from '../features/qa/qaProjectContextController.js'
import {
  createQuestionGuideState,
  refreshQuestionGuide
} from '../features/qa/questionGuideModel.js'
import GraphStatusOrb from '../features/graph/GraphStatusOrb.vue'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const route = useRoute()
const router = useRouter()
const graphTaskMonitor = useGraphTaskMonitor()
const browserStorage = getBrowserStorage(globalThis)
const qaState = ref(createQaState())
const draft = ref('')
const multiDiscussionPanel = ref(null)
const multiHasHistory = ref(false)
const useLegacyDiscussion = ref(false)
const multiModelOptions = ref([])
const modelSelectionByMode = ref({
  single: qaState.value.settings.model,
  multi: 'default'
})
const questionGuides = ref(createQuestionGuideState())
const projects = ref([])
const activeProjectId = ref('')
const projectsLoading = ref(true)
const projectError = ref('')
const selectorOpen = ref(false)
const answerDetailTab = ref('cod')
const qualityOpen = ref(false)
const scopeSelectionRequired = ref(false)
const evaluationService = createAnswerEvaluationService({
  mode: 'api',
  api: { judgeQAWithLLM, submitQAFeedback }
})
let requestVersion = 0
let qaRouteConsumptionVersion = 0
let currentProjectsLoad = Promise.resolve()
const unconsumedQaQuery = Symbol('unconsumed-qa-query')
const consumedQaQueryTokens = {
  new: unconsumedQaQuery,
  projectId: unconsumedQaQuery,
  reportId: unconsumedQaQuery,
  conversation: unconsumedQaQuery
}

const activeProject = computed(
  () => projects.value.find((project) => project.projectId === activeProjectId.value) ?? null
)
const evaluationEnabled = computed(() => canEvaluateAnswer(qaState.value))
const evaluationAnswerSummary = computed(() => String(qaState.value.answer?.summary || '').trim())
const qaModeLabel = computed(() => qaState.value.mode === 'multi' ? '智能会话' : '深度研究')
const singleModelOptions = domesticModelOptions.map(value => ({ value, label: value }))
const composerModelOptions = computed(() => (
  qaState.value.mode === 'multi' ? multiModelOptions.value : singleModelOptions
))
const showQaHome = computed(() => qaState.value.phase === 'empty')

// 首页标题区（今天想研究什么）展开/收起：首页默认展开；发送提问或打开历史会话后自动收起。
const heroOpen = ref(true)
function toggleHero() {
  heroOpen.value = !heroOpen.value
}
watch(() => multiHasHistory.value, (hasHistory) => {
  if (qaState.value.mode === 'multi') heroOpen.value = !hasHistory
})
watch(showQaHome, (home) => {
  if (qaState.value.mode === 'single') heroOpen.value = home
})
watch(() => qaState.value.mode, (mode) => {
  heroOpen.value = mode === 'single' ? showQaHome.value : !multiHasHistory.value
})
const multiSending = computed(() => Boolean(multiDiscussionPanel.value?.sending))
const multiNavigationLocked = computed(() => (
  shouldLockMultiDiscussionNavigation(qaState.value.mode, multiSending.value)
))
const multiGraphOptions = computed(() => activeProject.value ? [{
  project_id: activeProject.value.projectId,
  graph_id: activeProject.value.graphId,
  graph_name: activeProject.value.projectName
}] : [])
const projectUnavailableMessage = computed(() => {
  if (projectsLoading.value) return '正在读取可用于问答的知识图谱项目…'
  if (projectError.value) return projectError.value
  if (scopeSelectionRequired.value && projects.value.length) return '原问答项目资格已失效，请重新选择已完成模拟组会的图谱项目。'
  if (!activeProject.value) return '问答需要基于已完成的图谱项目（模拟组会完成或图谱构建完成），请先选择项目。'
  return ''
})

function projectLabel(project) {
  return project.projectName || project.projectId
}

/** 是否"必须选择图谱才能问答"（未选 或 原项目资格失效）。 */
const projectRequired = computed(() => !activeProject.value || scopeSelectionRequired.value)
/** 右上一个按钮承载全部状态：重试 / 加载 / 更换 / 选择。 */
const projectActionLabel = computed(() => {
  if (projectError.value) return '重试'
  if (projectsLoading.value) return '加载中…'
  return activeProject.value ? '更换图谱' : '选择图谱'
})
function onProjectAction() {
  if (projectError.value) return retryQualifiedProjects()
  selectorOpen.value = true
}

const qaProjectContext = createQaProjectContextController({
  refreshProjects: () => graphTaskMonitor.refresh(),
  getProjects: () => graphTaskMonitor.state.items,
  storage: browserStorage,
  onChange(snapshot) {
    projects.value = snapshot.records
    activeProjectId.value = snapshot.selected?.projectId ?? ''
    projectsLoading.value = snapshot.loading
    projectError.value = snapshot.error
  }
})

// 打开选择器即刷新一次，避免挂载时序 / 监视器重试延迟导致列表为空
watch(selectorOpen, (open) => {
  if (open) refreshQualifiedProjects({ requireManualSelection: false })
})

async function refreshQualifiedProjects(options = {}) {
  const requireManualSelection = options?.requireManualSelection === true || scopeSelectionRequired.value
  let finishCurrentLoad
  currentProjectsLoad = new Promise(resolve => { finishCurrentLoad = resolve })
  scopeSelectionRequired.value = requireManualSelection

  try {
    const selectionRequest = requireManualSelection
      ? {}
      : {
          routeProjectId: options.routeProjectId,
          routeReportId: options.routeReportId
        }
    if (requireManualSelection) qaProjectContext.clear()
    await qaProjectContext.refresh(selectionRequest)
  } finally {
    finishCurrentLoad()
  }
}

function retryQualifiedProjects() {
  const snapshot = activeQaQuerySnapshot()
  return refreshQualifiedProjects({
    routeProjectId: snapshot.projectId.value,
    routeReportId: snapshot.reportId.value
  })
}

function selectQualifiedProject(projectId) {
  if (multiNavigationLocked.value) return
  const previousProjectId = activeProjectId.value
  if (!qaProjectContext.select(projectId)) return
  const selected = qaProjectContext.snapshot().selected
  scopeSelectionRequired.value = false
  selectorOpen.value = false

  if (previousProjectId && previousProjectId !== selected.projectId) {
    if (qaState.value.mode === 'multi') {
      draft.value = ''
    } else reset()
  }
  const query = { ...route.query, projectId: selected.projectId }
  if (previousProjectId !== selected.projectId) delete query.agentSession
  delete query.reportId
  delete query.conversation
  consumedQaQueryTokens.projectId = JSON.stringify([selected.projectId])
  consumedQaQueryTokens.reportId = 'absent'
  void router.replace({ path: '/research', query })
}

async function waitForCurrentProjectsLoad() {
  let pendingLoad
  do {
    pendingLoad = currentProjectsLoad
    await pendingLoad
  } while (pendingLoad !== currentProjectsLoad)
}

async function sendQuestion(submission = draft.value) {
  if (!activeProject.value || projectsLoading.value) return
  if (qaState.value.mode === 'multi') {
    const payload = submission && typeof submission === 'object'
      ? submission
      : { question: String(submission || ''), image: null, multiModule: 'inline' }
    if (!payload.question?.trim() && !payload.image) return
    if (!useLegacyDiscussion.value) {
      const accepted = await multiDiscussionPanel.value?.submitExternal(payload)
      if (accepted) draft.value = ''
      return
    }
    draft.value = ''
    const multiMode = await ensureMultiDiscussionModels()
    await multiDiscussionPanel.value?.submitExternal({
      ...payload,
      model: multiMode,
      reasoning: qaState.value.settings.reasoning
    })
    return
  }
  await sendSingleQuestion(typeof submission === 'string' ? submission : draft.value)
}

async function sendSingleQuestion(question = draft.value) {
  if (!activeProject.value || projectsLoading.value) return
  const nextState = submitQuestion(qaState.value, question)
  if (nextState === qaState.value) return

  qualityOpen.value = false
  qaState.value = nextState
  draft.value = ''
  const currentRequest = ++requestVersion

  try {
    const adapted = await requestCodAnswer({ codGraphRAGQuery, getProject }, {
      simulationId: activeProject.value.simulationId,
      question: nextState.question,
      project: {
        ...activeProject.value.project,
        project_id: activeProject.value.projectId,
        graph_id: activeProject.value.graphId
      },
      settings: nextState.settings
    })
    if (currentRequest === requestVersion) {
      qaState.value = completeApiAnswer(qaState.value, adapted)
    }
  } catch (error) {
    if (currentRequest === requestVersion) {
      qaState.value = failApiAnswer(qaState.value, error)
      if (isInvalidGraphScopeError(error) || isInvalidQaEligibilityError(error)) {
        draft.value = qaState.value.question
        await refreshQualifiedProjects({ requireManualSelection: true })
      }
    }
  }
}

function retryQuestion() {
  const question = qaState.value.question
  if (!question) return
  draft.value = question
  sendQuestion(question)
}

function updateSettings(patch) {
  qaState.value = updateQaSettings(qaState.value, patch)
  if (patch.model) modelSelectionByMode.value[qaState.value.mode] = patch.model
}

async function loadMultiDiscussionModels() {
  if (multiModelOptions.value.length) return
  try {
    const response = await getMultiDiscussionCapabilities()
    const modes = Array.isArray(response.data?.model_modes) ? response.data.model_modes : []
    multiModelOptions.value = modes.map(item => ({
      value: item.mode,
      label: [item.label, item.model].filter(Boolean).join(' · ')
    }))
    modelSelectionByMode.value.multi = response.data?.default_model_mode || modes[0]?.mode || 'default'
  } catch (_error) {
    // 能力接口不可用时的兜底：与后端 model_modes 的默认保持一致（deepseek-v4-flash）
    multiModelOptions.value = [{ value: 'default', label: '默认模式 · deepseek-v4-flash' }]
    modelSelectionByMode.value.multi = 'default'
  }
}

/** 确保智能会话的模型模式清单已加载，并把当前选择收敛成合法模式 id。
 *  直接以 ?mode=multi 打开时 updateMode 会被"模式未变化"短路，必须在这里补上，
 *  否则下拉为空、且发送时会带着"深度研究"的模型标签当 model_mode。 */
async function ensureMultiDiscussionModels() {
  if (!useLegacyDiscussion.value) return 'default'
  if (needsModelModeOptions(multiModelOptions.value)) {
    await loadMultiDiscussionModels()
  }
  const resolved = resolveModelModeSelection({
    requested: modelSelectionByMode.value.multi,
    options: multiModelOptions.value,
    fallback: 'default'
  })
  modelSelectionByMode.value.multi = resolved
  if (qaState.value.mode === 'multi') {
    qaState.value = updateQaSettings(qaState.value, { model: resolved })
  }
  return resolved
}

async function updateMode(mode) {
  // URL 与页面模式保持同步：若只切换本地状态，后续任何 router.replace（例如写入
  // agentSession）都会保留旧的 ?mode=...，路由 watcher 又会把页面切回去。
  if ((mode === 'multi' || mode === 'single') && route.query.mode !== mode) {
    void router.replace({ path: route.path, query: { ...route.query, mode } })
  }
  if (mode === qaState.value.mode) {
    if (mode === 'multi') await ensureMultiDiscussionModels()
    return
  }
  modelSelectionByMode.value[qaState.value.mode] = qaState.value.settings.model
  qaState.value = selectQaMode(qaState.value, mode)
  if (mode === 'multi') {
    await ensureMultiDiscussionModels()
    return
  }
  qaState.value = updateQaSettings(qaState.value, { model: modelSelectionByMode.value.single })
}

function chooseCitation(citationId) {
  qualityOpen.value = false
  qaState.value = selectCitation(qaState.value, citationId)
}

function openEvidencePanel() {
  qualityOpen.value = false
  qaState.value = { ...qaState.value, evidenceOpen: true }
}

function openQualityPanel() {
  qaState.value = { ...qaState.value, evidenceOpen: false }
  qualityOpen.value = true
}

function patchEvaluation(patch) {
  if (!evaluationEnabled.value) return
  qaState.value = updateAnswerEvaluation(qaState.value, patch)
}

function captureEvaluationExcerpt(value) {
  if (!evaluationEnabled.value) return
  const selectedExcerpt = normalizeAnswerExcerpt(value)
  if (!selectedExcerpt || !qaState.value.answer) return

  qaState.value = updateAnswerEvaluation(qaState.value, current => {
    const inaccurate = setManualVerdict(current, 'inaccurate')
    return patchAnswerEvaluation(inaccurate, {
      mode: 'manual',
      manual: { selectedExcerpt, saveStatus: 'idle', errorMessage: '' }
    })
  })
  qaState.value = { ...qaState.value, evidenceOpen: false }
  qualityOpen.value = true
}

function getEvaluationContext() {
  if (!evaluationEnabled.value) return null
  const currentAnswer = qaState.value.answer
  if (!currentAnswer) return null

  return {
    question: qaState.value.question,
    answerText: [
      currentAnswer.summary,
      ...currentAnswer.sections.map(section => `${section.title}：${section.body}`)
    ].join('\n'),
    citationIds: [...currentAnswer.citationIds],
    qaRunId: qaState.value.qaRunId,
    qaResult: qaState.value.qaResult
  }
}

async function saveManualEvaluation() {
  const context = getEvaluationContext()
  const manual = qaState.value.evaluation.manual
  if (!context || !manual.verdict || manual.saveStatus === 'saving') return

  patchEvaluation({ manual: { saveStatus: 'saving', errorMessage: '' } })
  try {
    await evaluationService.saveManual(context, manual)
    patchEvaluation({ manual: { saveStatus: 'success', errorMessage: '' } })
  } catch (error) {
    patchEvaluation({
      manual: {
        saveStatus: 'error',
        errorMessage: getAnswerEvaluationErrorMessage(error)
      }
    })
  }
}

async function runLlmEvaluation() {
  const context = getEvaluationContext()
  const llm = qaState.value.evaluation.llm
  if (!context || llm.runStatus === 'loading') return

  patchEvaluation({
    mode: 'llm',
    llm: {
      runStatus: 'loading',
      result: null,
      errorMessage: '',
      saveStatus: 'idle',
      saveErrorMessage: ''
    }
  })
  try {
    const result = await evaluationService.runLlm(context)
    patchEvaluation({ llm: { runStatus: 'success', result, errorMessage: '' } })
  } catch (error) {
    patchEvaluation({
      llm: {
        runStatus: 'error',
        result: null,
        errorMessage: getAnswerEvaluationErrorMessage(error)
      }
    })
  }
}

async function saveLlmEvaluation() {
  const context = getEvaluationContext()
  const llm = qaState.value.evaluation.llm
  if (!context || !llm.result || llm.saveStatus === 'saving') return

  patchEvaluation({ llm: { saveStatus: 'saving', saveErrorMessage: '' } })
  try {
    await evaluationService.saveLlm(context, llm.result)
    patchEvaluation({ llm: { saveStatus: 'success', saveErrorMessage: '' } })
  } catch (error) {
    patchEvaluation({
      llm: {
        saveStatus: 'error',
        saveErrorMessage: getAnswerEvaluationErrorMessage(error)
      }
    })
  }
}

function refreshGuide(categoryId) {
  questionGuides.value = refreshQuestionGuide(questionGuides.value, categoryId)
}

function reset() {
  requestVersion += 1
  qualityOpen.value = false
  const { mode, settings } = qaState.value
  qaState.value = { ...resetConversation(), mode, settings: { ...settings } }
  draft.value = ''
  questionGuides.value = createQuestionGuideState()
}


function newMultiDiscussion() {
  if (qaState.value.mode !== 'multi') return
  if (multiNavigationLocked.value) return
  if (multiDiscussionPanel.value) multiDiscussionPanel.value.startNewDiscussion()
  else clearSavedMultiDiscussion(browserStorage, activeProject.value?.graphId)
  draft.value = ''
  questionGuides.value = createQuestionGuideState()
}

const tocRefreshKey = ref(0)
/** 右侧目录：智能会话（Agent）常显（无历史时也提供「新建对话」入口） */
const showSessionToc = computed(() => !useLegacyDiscussion.value)

/** 会话目录刷新：会话可能在提问时被隐式创建，一轮结束后轮数/时间也会变。 */
function onMultiHistoryChange(hasHistory) {
  multiHasHistory.value = Boolean(hasHistory)
  tocRefreshKey.value += 1
}

/** 从右侧目录打开会话（必要时先切到该会话所属图谱）。 */
function openSessionFromToc({ sessionId, projectId } = {}) {
  if (!sessionId) return
  if (projectId && projectId !== activeProjectId.value) selectQualifiedProject(projectId)
  const query = { ...route.query, agentSession: sessionId }
  void router.replace({ path: route.path, query })
}

function onSessionDeleted(sessionId) {
  if (route.query.agentSession === sessionId) {
    const query = { ...route.query }
    delete query.agentSession
    void router.replace({ path: route.path, query })
  }
  tocRefreshKey.value += 1
}

function onAgentSessionChange(id) {
  tocRefreshKey.value += 1
  if (qaState.value.mode !== 'multi' || useLegacyDiscussion.value) return
  if ((route.query.agentSession || '') === id) return
  const query = { ...route.query }
  if (id) query.agentSession = id
  else delete query.agentSession
  void router.replace({ path: route.path, query })
}

// --- 深度研究（single）：会话持久化与恢复 ----------------------------------
const singleSessionId = ref('')
const singlePersistKey = ref('')

function singleAnswerText(state) {
  if (!state?.answer) return ''
  const parts = []
  if (state.answer.summary) parts.push(String(state.answer.summary))
  for (const section of state.answer.sections || []) {
    if (section?.body) parts.push(`${section.title || ''}\n${section.body}`.trim())
  }
  return parts.join('\n\n').trim()
}

/** 单轮问答完成后写入用户自己的会话（同一问一答只写一次）。 */
async function persistSingleTurn() {
  const state = qaState.value
  if (state.mode !== 'single' || state.phase !== 'answered') return
  const question = String(state.question || '').trim()
  const answer = singleAnswerText(state)
  if (!question || !answer) return
  const key = `${question}\u0000${answer}`
  if (key === singlePersistKey.value) return
  singlePersistKey.value = key
  try {
    let id = singleSessionId.value
    if (!id) {
      const created = await createAgentSession({
        title: question.slice(0, 60),
        mode: 'single',
        workspace: {
          projectId: activeProject.value?.projectId || '',
          graphId: activeProject.value?.graphId || ''
        }
      })
      id = created.sessionId
      singleSessionId.value = id
    }
    await appendAgentTurn(id, {
      user: { role: 'user', content: question },
      assistant: { role: 'assistant', content: answer }
    })
    tocRefreshKey.value += 1
  } catch (error) {
    // 保存失败不阻断问答：下次刷新目录时仍可见已成功的记录
    console.warn('[qa] 保存深度研究会话失败：', error?.message || error)
  }
}

watch(
  () => [qaState.value.mode, qaState.value.phase, qaState.value.question],
  () => { void persistSingleTurn() },
  { flush: 'post' }
)

function startNewSingleSession() {
  requestVersion += 1
  singleSessionId.value = ''
  singlePersistKey.value = ''
  qaState.value = selectQaMode(createQaState(), 'single')
  draft.value = ''
  qualityOpen.value = false
}

async function openSingleSession({ sessionId } = {}) {
  if (!sessionId) return
  try {
    const record = await getAgentSession(sessionId)
    const messages = Array.isArray(record?.messages) ? record.messages : []
    const question = [...messages].reverse().find((message) => message?.role === 'user')?.content || ''
    const answer = [...messages].reverse().find((message) => message?.role === 'assistant')?.content || ''
    if (!question) return
    requestVersion += 1
    singleSessionId.value = sessionId
    singlePersistKey.value = `${question}\u0000${answer}`
    qaState.value = {
      ...selectQaMode(createQaState(), 'single'),
      phase: 'answered',
      question,
      answerSource: 'history',
      errorMessage: '',
      answer: { summary: String(answer || ''), sections: [], citationIds: [] },
      answerDetails: [],
      references: []
    }
    draft.value = ''
    qualityOpen.value = false
  } catch (error) {
    console.warn('[qa] 打开深度研究会话失败：', error?.message || error)
  }
}

function onSingleSessionDeleted(sessionId) {
  if (singleSessionId.value === sessionId) {
    singleSessionId.value = ''
    singlePersistKey.value = ''
  }
  tocRefreshKey.value += 1
}


function loadConversation(conversation) {
  if (qaState.value.mode === 'multi') {
    multiDiscussionPanel.value?.startNewDiscussion()
    draft.value = conversation.question
    void sendQuestion({
      question: conversation.question,
      image: null,
      multiModule: 'inline'
    })
    return
  }
  reset()
  draft.value = conversation.question
  void sendQuestion()
}

function openConversation(conversation) {
  if (route.query.conversation === conversation.id) {
    loadConversation(conversation)
    return
  }

  router.push({
    path: '/research',
    query: {
      projectId: activeProject.value?.projectId,
      conversation: conversation.id
    }
  })
}

function qaQueryDescriptor(key) {
  const query = route.query || {}
  const present = Object.prototype.hasOwnProperty.call(query, key)
  const value = query[key]
  const normalized = Array.isArray(value)
    ? value.map(item => String(item ?? ''))
    : [String(value ?? '')]
  return {
    present,
    value,
    token: present ? JSON.stringify(normalized) : 'absent'
  }
}

function activeQaQuerySnapshot() {
  return {
    new: qaQueryDescriptor('new'),
    projectId: qaQueryDescriptor('projectId'),
    reportId: qaQueryDescriptor('reportId'),
    conversation: qaQueryDescriptor('conversation')
  }
}

function isCurrentActiveQaSnapshot(snapshot) {
  if (route.name !== 'AscQa') return false
  const current = activeQaQuerySnapshot()
  return Object.keys(snapshot).every(key => current[key].token === snapshot[key].token)
}

async function consumeActiveQaRouteQuery() {
  const currentConsumption = ++qaRouteConsumptionVersion
  if (route.name !== 'AscQa') return

  // ?mode=multi|single preselects the QA mode (智能会话 / 深度研究)
  const queryMode = route.query.mode
  if (queryMode === 'multi' || queryMode === 'single') {
    if (qaState.value.mode !== queryMode) void updateMode(queryMode)
    else if (queryMode === 'multi') void ensureMultiDiscussionModels()
  }

  const snapshot = activeQaQuerySnapshot()
  const projectChanged = (
    consumedQaQueryTokens.projectId !== snapshot.projectId.token
  )
  const newChanged = consumedQaQueryTokens.new !== snapshot.new.token
  const conversationChanged = consumedQaQueryTokens.conversation !== snapshot.conversation.token
  const previousScope = activeProject.value
    ? activeProject.value.projectId
    : ''

  if (projectChanged) {
    consumedQaQueryTokens.projectId = snapshot.projectId.token
    consumedQaQueryTokens.reportId = snapshot.reportId.token
    void refreshQualifiedProjects({
      routeProjectId: snapshot.projectId.value,
      routeReportId: snapshot.reportId.value
    })
  }
  await waitForCurrentProjectsLoad()

  if (
    currentConsumption !== qaRouteConsumptionVersion
    || !isCurrentActiveQaSnapshot(snapshot)
  ) return

  const currentScope = activeProject.value
    ? activeProject.value.projectId
    : ''
  if (projectChanged && previousScope && currentScope !== previousScope) {
    if (qaState.value.mode === 'multi') {
      draft.value = ''
    } else reset()
  }

  if (newChanged) {
    consumedQaQueryTokens.new = snapshot.new.token
    if (snapshot.new.present) {
      if (qaState.value.mode === 'multi') newMultiDiscussion()
      else reset()
    }
  }

  if (conversationChanged) {
    consumedQaQueryTokens.conversation = snapshot.conversation.token
    const conversationId = Array.isArray(snapshot.conversation.value)
      ? snapshot.conversation.value[0]
      : snapshot.conversation.value
    if (!conversationId) return
    const conversation = findRecentConversation(recentConversations, conversationId)
    if (conversation) loadConversation(conversation)
  }
}

watch(
  () => graphTaskMonitor.state.completedRevision,
  (current, previous) => {
    if (current > previous) refreshQualifiedProjects()
  }
)

watch(
  () => activeProject.value?.graphId || '',
  (graphId, previousGraphId) => {
    if (qaState.value.mode !== 'multi' || graphId === previousGraphId) return
    draft.value = ''
  }
)

watch(
  () => route.fullPath,
  () => { void consumeActiveQaRouteQuery() }
)

onMounted(async () => {
  // Resolve the initial monitor request before the route-selection refresh.
  // Starting it afterwards superseded that refresh; slower real responses
  // could leave the controller with an empty catalogue after page reload.
  await graphTaskMonitor.start()
  void consumeActiveQaRouteQuery()
  if (qaState.value.mode === 'multi') void ensureMultiDiscussionModels()
})
watch(useLegacyDiscussion, (legacy) => { if (legacy) void ensureMultiDiscussionModels() })
onUnmounted(() => {
  requestVersion += 1
  qaProjectContext.stop()
  graphTaskMonitor.stop()
})
</script>

<style scoped>
.qa-layout {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--asc-bg);
  /* 两种模式共用同一页宽（智能会话 与 深度研究 保持一致） */
  --qa-page-max: 1400px;
}

.qa-layout--evidence {
  grid-template-columns: minmax(0, 1fr) minmax(580px, 42vw);
}

.qa-layout--recent {
  grid-template-columns: minmax(0, 1fr);
}

/* --- 三列舞台：左空白（悬浮球居中）/ 居中主窗口 / 右侧依附会话目录 --- */
.qa-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, var(--qa-stage-width, var(--qa-page-max-narrow))) minmax(0, 1fr);
  column-gap: var(--qa-space-5);
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
}

.qa-stage--narrow { --qa-stage-width: var(--qa-page-max-narrow); }

.qa-stage__left { grid-column: 1; justify-self: safe center; align-self: start; min-width: 0; }
.qa-stage__main { grid-column: 2; min-width: 0; display: flex; flex-direction: column; min-height: 0; }

/* 会话目录：依附主窗口右缘（右侧空白列），与主窗口同高、顶部对齐，且不挤压主窗口宽度 */
.qa-stage__toc { grid-column: 3; justify-self: start; align-self: stretch; min-width: 0; }
.qa-stage__toc > .qa-session-toc { width: 248px; max-width: 100%; height: 100%; position: static; max-height: none; }

@media (max-width: 1280px) {
  .qa-stage { grid-template-columns: minmax(0, 1fr); }
  .qa-stage__left { grid-column: 1; justify-self: start; padding-left: var(--qa-gutter); }
  .qa-stage__main,
  .qa-stage__toc { grid-column: 1; }
  .qa-stage__toc { width: 100%; }
  .qa-stage__toc > .qa-session-toc { height: auto; max-height: 320px; }
}

.qa-main {
  min-width: 0;
  min-height: 100vh;
}

.qa-topbar {
  min-height: var(--qa-topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--qa-space-2) var(--qa-space-5);
  padding: var(--qa-topbar-pad-y) var(--qa-topbar-pad-x);
  border-bottom: 1px solid var(--qa-border-color);
  background: rgba(255, 255, 255, 0.94);
}

.qa-topbar__info {
  display: flex;
  align-items: center;
  gap: var(--qa-space-3);
  min-width: 0;
  flex-wrap: wrap;
}

.qa-topbar span {
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-semibold);
}

.qa-topbar strong {
  padding-left: var(--qa-space-3);
  border-left: 1px solid var(--qa-border-color);
  color: var(--qa-heading);
  font-size: var(--qa-font-sm);
}

.qa-project-context {
  display: flex;
  align-items: center;
  gap: var(--qa-space-2);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
}

.qa-project-context strong {
  max-width: 220px;
  overflow: hidden;
  padding: 0;
  border: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qa-project-context button {
  min-height: var(--qa-control-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--qa-control-pad-x);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  color: var(--qa-heading);
  font: inherit;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
  cursor: pointer;
  transition: border-color var(--qa-transition), color var(--qa-transition), background var(--qa-transition);
}

.qa-project-context button {
  color: var(--qa-accent);
}

/* 未选择（必需）/ 出错：同一入口给出状态强调（不再另设门禁提示块） */
.qa-project-context--required strong {
  color: var(--qa-warning, #b45309);
}
.qa-project-context__action--required {
  border-color: var(--qa-warning, #b45309);
  color: var(--qa-warning, #b45309);
  background: var(--qa-warning-soft, #fef3c7);
}
.qa-project-context__action--required:hover {
  border-color: var(--qa-warning, #b45309);
  color: #ffffff;
  background: var(--qa-warning, #b45309);
}
.qa-project-context--error strong,
.qa-project-context--error button {
  color: var(--qa-danger, #b91c1c);
}
.qa-project-context--error button {
  border-color: var(--qa-danger, #b91c1c);
}

.qa-project-context button:hover {
  border-color: var(--qa-accent);
  color: var(--qa-accent);
  background: var(--qa-accent-soft);
}

/* --- one page shell for BOTH modes: same gutter, same max-width, same rhythm --- */
/* 单页内容体：宽度由 .qa-stage 的中间列决定（不再自行收窄/居中） */
.qa-empty {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--qa-section-gap);
}

.qa-single-page {
  width: 100%;
  height: calc(100vh - var(--qa-topbar-h));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--qa-section-gap);
  margin: 0 auto;
  padding: var(--qa-page-pad-top) var(--qa-gutter) 12px;
  box-sizing: border-box;
}

.qa-single-page .qa-empty__intro { max-width: var(--qa-page-max-narrow); margin-inline: auto; }

/* 深度研究：中部主窗口同样拉到底部对齐线（会话目录之外的组件跟随一致） */
.qa-stage__main > .qa-empty,
.qa-stage__main > .qa-session {
  flex: 1 1 auto;
  min-height: 0;
}

.qa-stage__main > .qa-empty > :deep(.shortcut-grid) {
  flex: 1 1 auto;
  min-height: 0;
}

/* 问答态：输入区固定在主窗口底部（不随内容滚动） */
.qa-stage__main > .qa-session > :deep(.composer-shell) {
  flex: 0 0 auto;
}

.qa-multi-page {
  /* 固定为一屏高度：内容超出时只在主窗口内部滚动，页面本身不增高 */
  width: 100%;
  height: calc(100vh - var(--qa-topbar-h));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--qa-section-gap);
  margin: 0 auto;
  padding: var(--qa-page-pad-top) var(--qa-gutter) 12px;
  box-sizing: border-box;
}

.qa-multi-page--empty {
  justify-content: flex-start;
}

.qa-multi-page--empty .qa-multi-page__intro {
  max-width: var(--qa-page-max-narrow);
}

.qa-multi-page--history {
  justify-content: flex-start;
}

.qa-multi-page__intro {
  flex: 0 0 auto;
  width: 100%;
  max-width: var(--qa-page-max);
  margin-inline: auto;
}

.qa-empty__intro {
  width: 100%;
  display: grid;
  justify-items: center;
  text-align: center;
}

.qa-empty h1,
.qa-single-page h1,
.qa-multi-page h1 {
  width: 100%;
  margin: 0;
  color: var(--asc-heading);
  font-family: "STZhongsong", "Songti SC", "Noto Serif CJK SC", "SimSun", serif;
  font-size: clamp(32px, 4vw, 46px);
  font-weight: 700;
  line-height: 1.16;
  letter-spacing: 0.015em;
  text-align: center;
  text-wrap: balance;
}


.qa-research-intro h1 {
  font-size: clamp(29px, 3.2vw, 39px);
}

.qa-empty__intro.qa-research-intro p {
  margin: var(--qa-space-2) auto var(--qa-space-3);
  max-width: 680px;
  color: #445e75;
  font-size: var(--qa-font-xl);
  font-weight: 500;
  letter-spacing: 0.005em;
  line-height: 1.7;
}

.qa-multi-page__workspace {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.qa-multi-page__workspace--history {
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-container);
  background: var(--qa-surface);
  box-shadow: var(--qa-shadow-panel);
}

.qa-multi-page__workspace--empty {
  gap: var(--qa-space-4);
  overflow: visible;
}

/* Agent includes its own composer and scrollable log. The legacy fixed-height
   workspace otherwise clips that composer after the first saved message.
   Extra specificity also overrides the narrow-screen history height rule. */
.qa-multi-page__workspace.qa-multi-page__workspace--agent {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow: visible;
}

.qa-multi-page__discussion {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.qa-multi-page__workspace--history .qa-multi-page__discussion {
  flex: 1;
}

.qa-multi-page__workspace--empty .qa-multi-page__discussion {
  order: 2;
}

.qa-agent-toggle {
  margin-top: var(--qa-space-3);
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-space-4);
  display: inline-flex;
  align-items: center;
  gap: var(--qa-space-2);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-chip);
  background: rgba(255, 255, 255, .82);
  color: var(--qa-accent-hover);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
  transition: border-color var(--qa-transition), background var(--qa-transition);
}

.qa-agent-toggle:hover,
.qa-agent-toggle--open {
  border-color: var(--qa-accent);
  background: var(--qa-accent-soft);
}

.qa-agent-toggle__mark {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
}

.qa-multi-page__agent {
  width: 100%;
  flex: 0 0 auto;
}

.qa-multi-page__workspace :deep(.multi-discussion.is-embedded) {
  height: 100%;
  border: 0;
  border-radius: 0;
}

.qa-multi-page__workspace--empty :deep(.multi-discussion.is-empty) {
  height: auto;
  overflow: visible;
  background: transparent;
}

.qa-multi-page__workspace :deep(.multi-discussion-messages) {
  background: var(--qa-surface-muted);
}

.qa-multi-page__workspace > :deep(.composer-shell) {
  flex: 0 0 auto;
  padding: var(--qa-space-3);
  border-top: 1px solid var(--qa-border-color);
  background: rgba(255, 255, 255, .98);
}

.qa-multi-page__workspace--empty > :deep(.composer-shell) {
  order: 1;
  padding: 0;
  border: 0;
  background: transparent;
}

.qa-multi-page__workspace--empty > :deep(.composer-shell .composer--compact textarea) {
  min-height: 105px;
  padding-top: var(--qa-space-3);
}

.qa-multi-page__workspace > :deep(.composer-shell .composer) {
  border-color: var(--qa-border-strong);
  box-shadow: none;
}

.qa-empty__intro p {
  width: 100%;
  margin: var(--qa-space-3) auto 0;
  max-width: 680px;
  color: #445e75;
  font-size: var(--qa-font-xl);
  font-weight: 500;
  letter-spacing: 0.005em;
  line-height: 1.7;
  text-align: center;
}

.qa-session {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--qa-section-gap);
  overflow: hidden;
}

/* 主窗口内部滚动：问题摘要/回答/证据详情；输入区固定在窗口底部 */
.qa-session__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--qa-section-gap);
  padding-right: 4px;
}

.qa-result-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-6);
  min-height: 122px;
  padding: var(--qa-space-5) var(--qa-space-6);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface);
  box-shadow: var(--qa-shadow-card);
}

.qa-result-context__summary,
.qa-result-context__mode {
  min-width: 0;
  display: flex;
}

.qa-result-context__summary {
  flex: 1;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--qa-space-3);
}

.qa-result-context__label {
  display: inline-flex;
  align-items: center;
  gap: var(--qa-space-2);
  min-height: var(--qa-control-h-sm);
  padding: 0 var(--qa-space-3);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: #536b82;
  font-size: var(--qa-control-font);
  font-weight: 750;
}

.qa-result-context__label-icon {
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
}

.qa-result-context__question {
  max-width: 100%;
  overflow: hidden;
  color: var(--asc-heading);
  font-size: clamp(18px, 1.55vw, 22px);
  font-weight: 750;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qa-result-context__mode {
  flex: 0 0 auto;
  align-items: center;
  gap: var(--qa-space-3);
}

.qa-result-context__mode > span {
  flex: 0 0 auto;
  color: var(--qa-muted);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-semibold);
}

.qa-result-context__mode-badge {
  min-height: var(--qa-control-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--qa-space-3);
  border-radius: var(--qa-radius-control);
  background: #edf2ff;
  color: #174ea6;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
}

@media (max-width: 760px) {
  .qa-result-context {
    display: grid;
    min-height: auto;
    padding: var(--qa-panel-pad);
  }

  .qa-result-context__mode {
    align-items: center;
    justify-content: space-between;
  }

  .qa-result-context__question {
    white-space: normal;
  }
}

@media (max-width: 1180px) {
  .qa-layout--evidence {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 1120px) {
  .qa-layout--recent {
    grid-template-columns: minmax(0, 1fr);
  }

  .qa-layout--recent .qa-main {
    grid-row: 2;
  }
}

@media (max-width: 760px) {
  .qa-topbar {
    min-height: auto;
    display: flex;
    padding: var(--qa-space-2) var(--qa-space-3);
  }

  .qa-topbar > div:first-child {
    display: none;
  }

  .qa-project-context {
    width: 100%;
    justify-content: space-between;
  }

  .qa-project-context strong {
    min-width: 0;
    flex: 1;
  }

  .qa-empty {
    width: min(calc(100% - var(--qa-gutter) * 2), var(--qa-page-max-narrow));
    min-height: calc(100vh - var(--qa-topbar-h));
    align-content: start;
    padding-top: var(--qa-space-12);
  }

  .qa-multi-page {
    width: calc(100% - var(--qa-gutter) * 2);
    min-height: calc(100vh - var(--qa-topbar-h));
    gap: var(--qa-space-4);
    padding: var(--qa-page-pad-top) 0;
  }

  .qa-multi-page--empty {
    justify-content: flex-start;
    padding-top: var(--qa-space-8);
  }

  .qa-research-intro h1 {
    font-size: clamp(25px, 8vw, 32px);
  }

  .qa-multi-page__workspace--history {
    height: clamp(500px, calc(100dvh - 270px), 640px);
    min-height: 500px;
  }

  .qa-multi-page__workspace :deep(.multi-discussion-status) {
    align-content: center;
    flex-wrap: wrap;
    padding-block: 7px;
  }

  .qa-session {
    width: calc(100% - var(--qa-gutter) * 2);
    min-height: calc(100vh - var(--qa-topbar-h));
    padding-top: var(--qa-page-pad-top);
  }
}
</style>
