<template>
  <div class="qa-layout" :class="{ 'qa-layout--evidence': qaState.evidenceOpen }">
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
        />
      </section>

      <section v-else class="qa-session">
        <ConversationPanel
          :state="qaState"
          @citation="chooseCitation"
          @open-evidence="qaState = { ...qaState, evidenceOpen: true }"
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

    <EvidencePanel
      v-if="qaState.evidenceOpen"
      :references="qaState.references"
      :selected-citation-id="qaState.selectedCitationId"
      @close="qaState = { ...qaState, evidenceOpen: false }"
      @select="chooseCitation"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import QuestionComposer from '../features/qa/QuestionComposer.vue'
import TaskShortcuts from '../features/qa/TaskShortcuts.vue'
import ConversationPanel from '../features/qa/ConversationPanel.vue'
import EvidencePanel from '../features/qa/EvidencePanel.vue'
import {
  completeMockAnswer,
  createQaState,
  resetConversation,
  selectCitation,
  submitQuestion,
  updateQaSettings
} from '../features/qa/qaDemoModel.js'
import { createQuestionGuideState } from '../features/qa/questionGuideModel.js'

const route = useRoute()
const qaState = ref(createQaState())
const draft = ref('')
const questionGuides = createQuestionGuideState()
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

function reset() {
  window.clearTimeout(completionTimer)
  qaState.value = resetConversation()
  draft.value = ''
}

watch(
  () => route.query.new,
  () => reset()
)

watch(
  () => route.query.conversation,
  conversation => {
    if (!conversation) return
    reset()
    draft.value = conversation === 'oxidation'
      ? '分析 ASC 耐火材料中复合抗氧化剂的作用机理。'
      : conversation === 'slag-corrosion'
        ? '梳理高炉出铁沟耐火材料的渣铁侵蚀路径。'
        : '分析 ASC Al₂O₃-SiC-C 材料体系的热震稳定性及主要影响因素。'
    sendQuestion()
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
  grid-template-columns: minmax(0, 1fr) 330px;
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
  text-align: center;
}

.asc-orbit {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin: 0 auto 14px;
  border: 1px solid #b9d8eb;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 8px #eff8fd;
}

.asc-orbit span {
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 900;
}

.qa-empty h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: clamp(30px, 4vw, 46px);
  letter-spacing: -0.04em;
}

.qa-empty__intro p {
  margin: 9px 0 0;
  color: var(--asc-muted);
  font-size: 13px;
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
