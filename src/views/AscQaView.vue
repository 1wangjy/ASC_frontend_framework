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
      </header>

      <section v-if="qaState.phase === 'empty'" class="qa-empty">
        <div class="qa-empty__intro">
          <div class="asc-orbit" aria-hidden="true">
            <span>ASC</span>
          </div>
          <h1>今天想研究什么？</h1>
          <p>围绕耐火材料配方、工艺、组织结构、服役性能与失效机理提出问题</p>
        </div>

        <QuestionComposer
          v-model="draft"
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
        />

        <QuestionComposer
          v-model="draft"
          compact
          :disabled="qaState.phase === 'loading'"
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
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuestionComposer from '../features/qa/QuestionComposer.vue'
import TaskShortcuts from '../features/qa/TaskShortcuts.vue'
import ConversationPanel from '../features/qa/ConversationPanel.vue'
import EvidencePanel from '../features/qa/EvidencePanel.vue'
import RecentConversationsPanel from '../features/qa/RecentConversationsPanel.vue'
import { judgeQAWithLLM, submitQAFeedback } from '../api/graph.js'
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
  completeMockAnswer,
  createQaState,
  resetConversation,
  selectCitation,
  submitQuestion,
  updateAnswerEvaluation,
  updateQaSettings
} from '../features/qa/qaDemoModel.js'
import {
  createQuestionGuideState,
  refreshQuestionGuide
} from '../features/qa/questionGuideModel.js'

const route = useRoute()
const router = useRouter()
const qaState = ref(createQaState())
const draft = ref('')
const questionGuides = ref(createQuestionGuideState())
const evaluationService = createAnswerEvaluationService({
  mode: import.meta.env.VITE_QA_EVALUATION_API === 'true' ? 'api' : 'demo',
  api: { judgeQAWithLLM, submitQAFeedback }
})
let completionTimer = null

function sendQuestion() {
  const nextState = submitQuestion(qaState.value, draft.value)
  if (nextState === qaState.value) return

  qaState.value = nextState
  draft.value = ''
  window.clearTimeout(completionTimer)
  completionTimer = window.setTimeout(() => {
    qaState.value = completeMockAnswer(qaState.value)
  }, 720)
}

function updateSettings(patch) {
  qaState.value = updateQaSettings(qaState.value, patch)
}

function chooseCitation(citationId) {
  qaState.value = selectCitation(qaState.value, citationId)
}

function patchEvaluation(patch) {
  qaState.value = updateAnswerEvaluation(qaState.value, patch)
}

function captureEvaluationExcerpt(value) {
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
  const currentAnswer = qaState.value.answer
  if (!currentAnswer) return null

  return {
    question: qaState.value.question,
    answerText: [
      currentAnswer.summary,
      ...currentAnswer.sections.map(section => `${section.title}：${section.body}`)
    ].join('\n'),
    citationIds: [...currentAnswer.citationIds]
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
  window.clearTimeout(completionTimer)
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

onBeforeUnmount(() => window.clearTimeout(completionTimer))
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
