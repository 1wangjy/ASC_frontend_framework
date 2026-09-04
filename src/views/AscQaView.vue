<template>
  <div
    class="qa-layout"
    :class="{
      'qa-layout--recent': qaState.mode === 'multi' && !qaState.evidenceOpen,
      'qa-layout--evidence': qaState.evidenceOpen || qualityOpen
    }"
  >
    <main class="qa-main">
      <header class="qa-topbar">
        <div>
          <strong v-if="qaState.phase === 'empty'">问题研究</strong>
          <strong v-else>研究答疑 / 热震稳定性</strong>
        </div>
        <div class="qa-topbar__actions">
          <GlobalGraphTaskIndicator
            :items="graphTaskMonitor.state.items"
            :connection="graphTaskMonitor.state.connection"
            :last-synced-at="graphTaskMonitor.state.lastSyncedAt"
            @refresh="graphTaskMonitor.refresh"
            @view-project="onTaskbarViewProject"
          />
          <button
            v-if="qaState.mode === 'multi'"
            type="button"
            class="qa-topbar__action qa-topbar__action--primary"
            :disabled="multiNavigationLocked"
            @click="onModePrimaryAction"
          >
            新建组会
          </button>
        </div>
        <div class="qa-project-context">
          <span>当前图谱</span>
          <strong>{{ activeProject ? projectLabel(activeProject) : '未选择' }}</strong>
          <button type="button" :disabled="multiNavigationLocked" @click="selectorOpen = true">
            {{ activeProject ? '更换图谱' : '选择图谱' }}
          </button>
        </div>
      </header>

      <section
        v-if="qaState.mode === 'multi'"
        class="qa-multi-page"
        :class="multiHasHistory ? 'qa-multi-page--history' : 'qa-multi-page--empty'"
      >
        <div class="qa-empty__intro qa-multi-page__intro">
          <div class="asc-orbit" aria-hidden="true">
            <span>ASC</span>
          </div>
          <h1>{{ multiHeroTitle }}</h1>
          <p>{{ multiHeroSubtitle }}</p>
          <QaModeSwitcher
            mode="multi"
            :disabled="multiNavigationLocked"
            @update:mode="updateMode"
          />
        </div>

        <div v-if="projectUnavailableMessage" class="qa-project-message" :class="{ error: projectError }">
          <span>{{ projectUnavailableMessage }}</span>
          <button v-if="projectError" type="button" @click="retryQualifiedProjects">重试</button>
          <button v-if="!projectsLoading && !activeProject" type="button" @click="selectorOpen = true">
            选择项目
          </button>
        </div>

        <div
          class="qa-multi-page__workspace"
          :class="multiHasHistory
            ? 'qa-multi-page__workspace--history'
            : 'qa-multi-page__workspace--empty'"
        >
          <div class="qa-multi-page__discussion">
            <MultiDiscussionPanel
              ref="multiDiscussionPanel"
              :key="activeProject?.graphId"
              embedded
              :graph-options="multiGraphOptions"
              :selected-graph-id="activeProject?.graphId || ''"
              @history-change="multiHasHistory = $event"
              @select-prompt="draft = $event"
            />
          </div>

          <QuestionComposer
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
      </section>

      <section v-else-if="showQaHome" class="qa-empty">
        <div class="qa-empty__intro">
          <div class="asc-orbit" aria-hidden="true">
            <span>ASC</span>
          </div>
          <h1>今天想研究什么？</h1>
          <p>围绕耐火材料配方、工艺、组织结构、服役性能与失效机理提出问题</p>
        </div>

        <div v-if="projectUnavailableMessage" class="qa-project-message" :class="{ error: projectError }">
          <span>{{ projectUnavailableMessage }}</span>
          <button v-if="projectError" type="button" @click="retryQualifiedProjects">重试</button>
          <button v-if="!projectsLoading && !activeProject" type="button" @click="selectorOpen = true">
            选择项目
          </button>
        </div>

        <QuestionComposer
          v-model="draft"
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
      </section>

      <section v-else class="qa-session">
        <button type="button" class="qa-result-back" @click="returnToQaHome">
          <span aria-hidden="true">←</span>
          返回首页
        </button>

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
      </section>
    </main>

    <RecentConversationsPanel
      v-if="!qaState.evidenceOpen"
      :mode="qaState.mode"
      :disabled="multiNavigationLocked"
      @new-chat="startNewQa"
      @exit-multi="exitMultiDiscussion"
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
import QuestionComposer from '../features/qa/QuestionComposer.vue'
import TaskShortcuts from '../features/qa/TaskShortcuts.vue'
import ConversationPanel from '../features/qa/ConversationPanel.vue'
import AnswerDetailsTabs from '../features/qa/AnswerDetailsTabs.vue'
import EvidencePanel from '../features/qa/EvidencePanel.vue'
import QualityPanel from '../features/qa/QualityPanel.vue'
import RecentConversationsPanel from '../features/qa/RecentConversationsPanel.vue'
import QaModeSwitcher from '../features/qa/QaModeSwitcher.vue'
import QaProjectSelector from '../features/qa/QaProjectSelector.vue'
import MultiDiscussionPanel from '../features/qa/multiDiscussion/MultiDiscussionPanel.vue'
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
import GlobalGraphTaskIndicator from '../features/tasks/GlobalGraphTaskIndicator.vue'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const route = useRoute()
const router = useRouter()
const graphTaskMonitor = useGraphTaskMonitor()
const browserStorage = getBrowserStorage(globalThis)
const qaState = ref(createQaState())
const draft = ref('')
const multiDiscussionPanel = ref(null)
const multiHasHistory = ref(false)
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
const qaModeLabel = computed(() => qaState.value.mode === 'multi' ? '多轮连续' : '单轮深度')
const singleModelOptions = domesticModelOptions.map(value => ({ value, label: value }))
const composerModelOptions = computed(() => (
  qaState.value.mode === 'multi' ? multiModelOptions.value : singleModelOptions
))
const showQaHome = computed(() => qaState.value.phase === 'empty')
const multiSending = computed(() => Boolean(multiDiscussionPanel.value?.sending))
const multiNavigationLocked = computed(() => (
  shouldLockMultiDiscussionNavigation(qaState.value.mode, multiSending.value)
))
const multiHeroTitle = computed(() => (
  multiHasHistory.value ? '与当前图谱持续讨论' : '从一个图谱问题开始'
))
const multiHeroSubtitle = computed(() => (
  multiHasHistory.value
    ? '延续已有讨论上下文，继续追问、验证与深入分析'
    : '围绕当前图谱提出第一个问题，后续追问将自动继承上下文'
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
  if (!activeProject.value) return '问答需要基于模拟组会已完成的图谱项目，请先选择项目。'
  return ''
})

function projectLabel(project) {
  return project.projectName || project.projectId
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
    draft.value = ''
    await multiDiscussionPanel.value?.submitExternal({
      ...payload,
      model: qaState.value.settings.model,
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
    multiModelOptions.value = [{ value: 'default', label: '默认模式 · Qwen3-VL 32B' }]
    modelSelectionByMode.value.multi = 'default'
  }
}

async function updateMode(mode) {
  if (mode === qaState.value.mode) return
  modelSelectionByMode.value[qaState.value.mode] = qaState.value.settings.model
  qaState.value = selectQaMode(qaState.value, mode)
  if (mode === 'multi') {
    await loadMultiDiscussionModels()
    qaState.value = updateQaSettings(qaState.value, { model: modelSelectionByMode.value.multi })
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
  qaState.value = resetConversation()
  draft.value = ''
  questionGuides.value = createQuestionGuideState()
}

function startNewQa() {
  if (qaState.value.mode === 'multi') {
    if (multiNavigationLocked.value) return
    if (multiDiscussionPanel.value) multiDiscussionPanel.value.startNewDiscussion()
    else clearSavedMultiDiscussion(browserStorage, activeProject.value?.graphId)
    draft.value = ''
    questionGuides.value = createQuestionGuideState()
    return
  }
  reset()
}

async function exitMultiDiscussion() {
  if (multiNavigationLocked.value) return
  await updateMode('single')
  reset()
  const query = { ...route.query }
  delete query.conversation
  delete query.new
  await router.replace({ path: '/research', query })
}

async function returnToQaHome() {
  if (qaState.value.mode === 'multi') {
    if (multiNavigationLocked.value) return
    if (multiDiscussionPanel.value) multiDiscussionPanel.value.startNewDiscussion()
    else clearSavedMultiDiscussion(browserStorage, activeProject.value?.graphId)
    draft.value = ''
  } else reset()
  const query = { ...route.query }
  delete query.conversation
  delete query.new
  await router.replace({ path: '/research', query })
}

function newMultiDiscussion() {
  if (qaState.value.mode !== 'multi') return
  if (multiNavigationLocked.value) return
  if (multiDiscussionPanel.value) multiDiscussionPanel.value.startNewDiscussion()
  else clearSavedMultiDiscussion(browserStorage, activeProject.value?.graphId)
  draft.value = ''
  questionGuides.value = createQuestionGuideState()
}

function onModePrimaryAction() {
  if (qaState.value.mode === 'multi') {
    newMultiDiscussion()
    return
  }
  void router.push('/reports')
}

function onTaskbarViewProject(projectId) {
  if (projectId) router.push({ name: 'Process', params: { projectId } })
  else router.push('/process')
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
    if (snapshot.new.present) reset()
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

onMounted(() => {
  void consumeActiveQaRouteQuery()
  graphTaskMonitor.start()
})
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
}

.qa-layout--evidence {
  grid-template-columns: minmax(0, 1fr) minmax(580px, 42vw);
}

.qa-layout--recent {
  grid-template-columns: minmax(0, 1fr);
}

.qa-main {
  min-width: 0;
  min-height: 100vh;
}

.qa-topbar {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 20px;
  padding: 10px 28px;
  border-bottom: 1px solid var(--asc-border);
  background: rgba(255, 255, 255, 0.94);
}

.qa-topbar > div:first-child {
  display: flex;
  align-items: center;
  gap: 14px;
}

.qa-topbar span {
  color: var(--asc-muted);
  font-size: 12px;
  font-weight: 650;
}

.qa-topbar strong {
  padding-left: 14px;
  border-left: 1px solid var(--asc-border);
  color: var(--asc-heading);
  font-size: 12px;
}

.qa-project-context {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--asc-muted);
  font-size: 12px;
  font-weight: 700;
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
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.qa-topbar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.qa-topbar__action {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
  color: var(--asc-heading);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

.qa-topbar__action:hover {
  border-color: var(--asc-primary);
  color: var(--asc-primary);
}

.qa-topbar__action--primary {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
}

.qa-topbar__action--primary:hover {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
}

.qa-topbar__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qa-empty {
  width: min(980px, calc(100% - 48px));
  min-height: calc(100vh - 58px);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 18px;
  margin: 0 auto;
  padding: 42px 0 64px;
}

.qa-multi-page {
  width: min(1180px, calc(100% - 48px));
  min-height: calc(100vh - 58px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
  padding: 28px 0;
}

.qa-multi-page--empty {
  width: min(980px, calc(100% - 48px));
  justify-content: center;
  padding-block: 42px 64px;
}

.qa-multi-page--history {
  justify-content: flex-start;
}

.qa-empty__intro {
  width: 100%;
  display: grid;
  justify-items: center;
  text-align: center;
}

.asc-orbit {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin: 0 0 14px;
  border: 1px solid #b9d8eb;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 8px #eff8fd;
}

.asc-orbit span {
  display: block;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.qa-empty h1,
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

.qa-multi-page__intro {
  flex: 0 0 auto;
}

.qa-multi-page__intro .asc-orbit {
  width: 48px;
  height: 48px;
  margin-bottom: 10px;
  box-shadow: inset 0 0 0 7px #eff8fd;
}

.qa-multi-page__intro h1 {
  font-size: clamp(29px, 3.2vw, 39px);
}

.qa-multi-page__intro p {
  margin: 10px auto 12px;
  max-width: 640px;
  color: #445e75;
  font-size: 15px;
  line-height: 1.7;
}

.qa-multi-page__workspace {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.qa-multi-page__workspace--history {
  height: clamp(460px, calc(100vh - 310px), 640px);
  min-height: 460px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid #b9cedd;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(39, 74, 99, 0.08);
}

.qa-multi-page__workspace--empty {
  gap: 16px;
  overflow: visible;
}

.qa-multi-page__discussion {
  min-height: 0;
}

.qa-multi-page__workspace--history .qa-multi-page__discussion {
  flex: 1;
}

.qa-multi-page__workspace--empty .qa-multi-page__discussion {
  order: 2;
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
  background: #f5f8fb;
}

.qa-multi-page__workspace > :deep(.composer-shell) {
  flex: 0 0 auto;
  padding: 12px;
  border-top: 1px solid #dce6ed;
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
  padding-top: 13px;
}

.qa-multi-page__workspace > :deep(.composer-shell .composer) {
  border-color: #c4d5e1;
  box-shadow: none;
}

.qa-empty__intro p {
  width: 100%;
  margin: 14px auto 0;
  max-width: 680px;
  color: #445e75;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0.005em;
  line-height: 1.7;
  text-align: center;
}

.qa-project-message {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 9px 12px;
  border: 1px solid #c2d8e5;
  border-radius: 7px;
  background: #f7fbfd;
  color: var(--asc-muted);
  font-size: 13px;
}

.qa-project-message.error {
  border-color: #e6b5af;
  background: #fff7f6;
  color: #9e4037;
}

.qa-project-message button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: #fff;
  color: inherit;
  font-size: 13px;
  font-weight: 800;
}

.qa-session {
  width: min(1180px, calc(100% - 48px));
  min-height: calc(100vh - 58px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 auto;
  padding: 24px 0 28px;
}

.qa-result-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 122px;
  padding: 20px 24px;
  border: 1px solid #d4e1eb;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 3px 10px rgba(40, 72, 99, .05);
}

.qa-result-back {
  width: max-content;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--asc-primary);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.qa-result-back:hover {
  background: #edf6fc;
}

.qa-result-back:focus-visible {
  outline: 3px solid rgba(33, 113, 174, .16);
  outline-offset: 2px;
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
  gap: 12px;
}

.qa-result-context__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  background: #f0f5fb;
  color: #536b82;
  font-size: 13px;
  font-weight: 750;
}

.qa-result-context__label-icon {
  color: var(--asc-primary);
  font-size: 12px;
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
  gap: 14px;
}

.qa-result-context__mode > span {
  flex: 0 0 auto;
  color: var(--asc-muted);
  font-size: 13px;
  font-weight: 650;
}

.qa-result-context__mode-badge {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 7px;
  background: #edf2ff;
  color: #174ea6;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 760px) {
  .qa-result-context {
    display: grid;
    min-height: auto;
    padding: 18px;
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
    padding: 10px 14px;
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
    width: min(100% - 28px, 720px);
    min-height: calc(100vh - 56px);
    align-content: start;
    padding-top: 54px;
  }

  .qa-multi-page {
    width: calc(100% - 24px);
    min-height: calc(100vh - 56px);
    gap: 14px;
    padding: 20px 0;
  }

  .qa-multi-page--empty {
    justify-content: flex-start;
    padding-top: 38px;
  }

  .qa-multi-page__intro h1 {
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
    width: calc(100% - 24px);
    min-height: calc(100vh - 56px);
    padding-top: 20px;
  }
}
</style>
