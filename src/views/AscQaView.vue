<template>
  <div
    class="qa-layout"
    :class="{
      'qa-layout--recent': !qaState.evidenceOpen,
      'qa-layout--evidence': qaState.evidenceOpen
    }"
  >
    <main class="qa-main">
      <header class="qa-topbar">
        <div>
          <span>ASC 耐火材料智能研究平台</span>
          <strong v-if="qaState.phase !== 'empty'">研究答疑 / 热震稳定性</strong>
        </div>
        <label class="qa-project-picker">
          <span>知识图谱项目</span>
          <select
            v-model="activeProjectId"
            :disabled="projectsLoading || !projects.length"
            @change="changeActiveProject"
          >
            <option v-if="!projects.length" value="">暂无可用图谱</option>
            <option
              v-for="project in projects"
              :key="project.project_id"
              :value="project.project_id"
            >
              {{ projectLabel(project) }}
            </option>
          </select>
        </label>
      </header>

      <section v-if="qaState.phase === 'empty'" class="qa-empty">
        <div class="qa-empty__intro">
          <div class="asc-orbit" aria-hidden="true">
            <span>ASC</span>
          </div>
          <h1>今天想研究什么？</h1>
          <p>围绕耐火材料配方、工艺、组织结构、服役性能与失效机理提出问题</p>
        </div>

        <div v-if="projectUnavailableMessage" class="qa-project-message" :class="{ error: projectError }">
          <span>{{ projectUnavailableMessage }}</span>
          <button v-if="projectError" type="button" @click="loadProjects">重试</button>
          <button
            v-if="!projectsLoading && !activeProject"
            type="button"
            @click="router.push('/process/new')"
          >
            去构建知识图谱
          </button>
        </div>

        <QuestionComposer
          v-model="draft"
          :disabled="projectsLoading || !activeProject"
          :settings="qaState.settings"
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
        <ConversationPanel
          :state="qaState"
          @citation="chooseCitation"
          @open-evidence="qaState = { ...qaState, evidenceOpen: true }"
          @answer-selection="captureEvaluationExcerpt"
          @retry="retryQuestion"
        />

        <QuestionComposer
          v-model="draft"
          compact
          :disabled="qaState.phase === 'loading' || !activeProject"
          :settings="qaState.settings"
          @update:settings="updateSettings"
          @submit="sendQuestion"
        />
      </section>
    </main>

    <RecentConversationsPanel
      v-if="!qaState.evidenceOpen"
      :conversations="recentConversations"
      @select="openConversation"
    />

    <EvidencePanel
      v-if="qaState.evidenceOpen"
      :references="qaState.references"
      :selected-citation-id="qaState.selectedCitationId"
      :evaluation="qaState.evaluation"
      :evaluation-enabled="evaluationEnabled"
      @close="qaState = { ...qaState, evidenceOpen: false }"
      @select="chooseCitation"
      @update:evaluation="patchEvaluation"
      @save-manual="saveManualEvaluation"
      @run-llm="runLlmEvaluation"
      @save-llm="saveLlmEvaluation"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuestionComposer from '../features/qa/QuestionComposer.vue'
import TaskShortcuts from '../features/qa/TaskShortcuts.vue'
import ConversationPanel from '../features/qa/ConversationPanel.vue'
import EvidencePanel from '../features/qa/EvidencePanel.vue'
import RecentConversationsPanel from '../features/qa/RecentConversationsPanel.vue'
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
  failApiAnswer,
  resetConversation,
  selectCitation,
  submitQuestion,
  updateAnswerEvaluation,
  updateQaSettings
} from '../features/qa/qaDemoModel.js'
import { requestCodAnswer } from '../features/qa/qaApiAdapter.js'
import {
  readActiveProjectId,
  rememberActiveProjectId,
  resolveActiveProject,
  listGraphProjects
} from '../features/projects/projectContextModel.js'
import {
  getRegisteredProjectIds
} from '../features/projects/projectRegistry.js'
import {
  createQuestionGuideState,
  refreshQuestionGuide
} from '../features/qa/questionGuideModel.js'

const route = useRoute()
const router = useRouter()
const qaState = ref(createQaState())
const draft = ref('')
const questionGuides = ref(createQuestionGuideState())
const projects = ref([])
const activeProjectId = ref('')
const projectsLoading = ref(true)
const projectError = ref('')
const evaluationService = createAnswerEvaluationService({
  mode: 'api',
  api: { judgeQAWithLLM, submitQAFeedback }
})
let requestVersion = 0

const activeProject = computed(
  () => projects.value.find((project) => project.project_id === activeProjectId.value) ?? null
)
const evaluationEnabled = computed(() => canEvaluateAnswer(qaState.value))
const projectUnavailableMessage = computed(() => {
  if (projectsLoading.value) return '正在读取可用于问答的知识图谱项目…'
  if (projectError.value) return projectError.value
  if (!activeProject.value) return '后端没有带 graph_id 的可用项目，暂时不能发起图谱问答。'
  return ''
})

function projectLabel(project) {
  return project.project_name || project.name || project.project_id
}

async function loadProjects() {
  projectsLoading.value = true
  projectError.value = ''

  try {
    // 从 localStorage 读取已注册的 project_id，逐个用 getProject 获取
    const ids = getRegisteredProjectIds()
    const results = await Promise.allSettled(
      ids.map(id => getProject(id))
    )
    const fetched = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(Boolean)

    projects.value = listGraphProjects(fetched)
    const selected = resolveActiveProject(
      projects.value,
      readActiveProjectId(window.localStorage)
    )
    activeProjectId.value = selected?.project_id ?? ''
    rememberActiveProjectId(window.localStorage, activeProjectId.value)
  } catch (error) {
    projects.value = []
    activeProjectId.value = ''
    rememberActiveProjectId(window.localStorage, '')
    projectError.value = '暂无可用项目，请先通过"知识图谱构建"创建项目。'
  } finally {
    projectsLoading.value = false
  }
}

function changeActiveProject() {
  rememberActiveProjectId(window.localStorage, activeProjectId.value)
  reset()
}

async function sendQuestion(question = draft.value) {
  if (!activeProject.value || projectsLoading.value) return
  const nextState = submitQuestion(qaState.value, question)
  if (nextState === qaState.value) return

  qaState.value = nextState
  draft.value = ''
  const currentRequest = ++requestVersion

  try {
    const adapted = await requestCodAnswer(codGraphRAGQuery, {
      question: nextState.question,
      project: activeProject.value,
      settings: nextState.settings
    })
    if (currentRequest === requestVersion) {
      qaState.value = completeApiAnswer(qaState.value, adapted)
    }
  } catch (error) {
    if (currentRequest === requestVersion) {
      qaState.value = failApiAnswer(qaState.value, error)
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
}

function chooseCitation(citationId) {
  qaState.value = selectCitation(qaState.value, citationId)
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
  qaState.value = { ...qaState.value, evidenceOpen: true }
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
  qaState.value = resetConversation()
  draft.value = ''
  questionGuides.value = createQuestionGuideState()
}

function loadConversation(conversation) {
  reset()
  draft.value = conversation.question
  sendQuestion()
}

function openConversation(conversation) {
  if (route.query.conversation === conversation.id) {
    loadConversation(conversation)
    return
  }

  router.push({ path: '/', query: { conversation: conversation.id } })
}

watch(
  () => route.query.new,
  () => reset()
)

watch(
  () => route.query.conversation,
  conversationId => {
    if (!conversationId) return
    const conversation = findRecentConversation(recentConversations, conversationId)
    if (conversation) loadConversation(conversation)
  },
  { immediate: true }
)

onMounted(loadProjects)
</script>

<style scoped>
.qa-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--asc-bg);
}

.qa-layout--evidence {
  grid-template-columns: minmax(0, 1fr) 390px;
}

.qa-layout--recent {
  grid-template-columns: minmax(0, 1fr) 176px;
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
  gap: 20px;
  padding: 0 28px;
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

.qa-project-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--asc-muted);
  font-size: 10px;
  font-weight: 700;
}

.qa-project-picker select {
  min-width: 190px;
  height: 34px;
  padding: 0 28px 0 9px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: #fff;
  color: var(--asc-heading);
  font-size: 10px;
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

.qa-empty h1 {
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
  transform: translateX(0.18em);
}

.qa-empty__intro p {
  width: 100%;
  margin: 11px 0 0;
  color: #5f7890;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
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
  font-size: 10px;
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
  border-radius: 5px;
  background: #fff;
  color: inherit;
  font-size: 9px;
  font-weight: 800;
}

.qa-session {
  width: min(900px, calc(100% - 48px));
  min-height: calc(100vh - 58px);
  display: flex;
  flex-direction: column;
  gap: 26px;
  margin: 0 auto;
  padding: 38px 0 24px;
}

.qa-session > :first-child {
  flex: 1;
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
    display: none;
  }

  .qa-empty {
    width: min(100% - 28px, 720px);
    min-height: calc(100vh - 56px);
    align-content: start;
    padding-top: 54px;
  }

  .qa-session {
    width: calc(100% - 24px);
    min-height: calc(100vh - 56px);
    padding-top: 20px;
  }
}
</style>
