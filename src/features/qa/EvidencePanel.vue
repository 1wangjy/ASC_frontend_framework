<template>
  <aside class="evidence-panel">
    <header class="evidence-panel__header">
      <div>
        <span>ASC REVIEW</span>
        <h2>证据与评估</h2>
      </div>
      <button type="button" aria-label="关闭证据面板" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <section class="evidence-sources" aria-labelledby="evidence-source-title">
      <div class="section-heading">
        <div>
          <h3 id="evidence-source-title">引用来源</h3>
          <span>{{ references.length }} 条证据</span>
        </div>
        <small>点击定位引用</small>
      </div>

      <div v-if="references.length" class="reference-list">
        <button
          v-for="reference in references"
          :key="reference.id"
          type="button"
          class="reference-card"
          :class="{ 'reference-card--active': selectedCitationId === reference.id }"
          @click="$emit('select', reference.id)"
        >
          <span>{{ reference.id }}</span>
          <div>
            <strong>{{ reference.title }}</strong>
            <small>{{ reference.authors }} · {{ reference.source }} · {{ reference.year }}</small>
          </div>
        </button>
      </div>
      <p v-else class="reference-empty">本次回答暂无引用证据</p>

      <div v-if="selectedReference" class="source-excerpt">
        <span>{{ selectedReference.id }} · {{ selectedReference.locator }}</span>
        <p>{{ selectedReference.excerpt }}</p>
      </div>
    </section>

    <section v-if="!evaluationEnabled" class="evaluation-unavailable" role="status">
      <strong>预览回答不能提交评估</strong>
      <p>请先完成一次真实图谱问答，再使用人工评估或 LLM 评估。</p>
    </section>

    <section v-else class="evaluation-workspace" aria-label="回答评估工作台">
      <div class="evaluation-switch" role="tablist" aria-label="评估方式">
        <button
          type="button"
          role="tab"
          :aria-selected="evaluation.mode === 'manual'"
          :class="{ active: evaluation.mode === 'manual' }"
          @click="setMode('manual')"
        >
          人工评估
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="evaluation.mode === 'llm'"
          :class="{ active: evaluation.mode === 'llm' }"
          @click="setMode('llm')"
        >
          LLM 评估
        </button>
      </div>

      <ManualEvaluationPanel
        v-if="evaluation.mode === 'manual'"
        :evaluation="evaluation.manual"
        @patch="patchManual"
        @set-verdict="selectVerdict"
        @toggle-issue="toggleIssue"
        @clear-excerpt="patchManual({ selectedExcerpt: '', saveStatus: 'idle', errorMessage: '' })"
        @save="$emit('save-manual')"
      />

      <LlmEvaluationPanel
        v-else
        :evaluation="evaluation.llm"
        @run="$emit('run-llm')"
        @save="$emit('save-llm')"
      />
    </section>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import LlmEvaluationPanel from './LlmEvaluationPanel.vue'
import ManualEvaluationPanel from './ManualEvaluationPanel.vue'
import {
  setManualVerdict,
  toggleManualIssue
} from './answerEvaluationModel.js'

const props = defineProps({
  references: {
    type: Array,
    required: true
  },
  selectedCitationId: {
    type: String,
    default: ''
  },
  evaluation: {
    type: Object,
    required: true
  },
  evaluationEnabled: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'close',
  'select',
  'update:evaluation',
  'save-manual',
  'run-llm',
  'save-llm'
])

const selectedReference = computed(
  () => props.references.find(reference => reference.id === props.selectedCitationId) || props.references[0]
)

function setMode(mode) {
  emit('update:evaluation', { mode })
}

function patchManual(patch) {
  emit('update:evaluation', { manual: patch })
}

function selectVerdict(verdict) {
  emit('update:evaluation', setManualVerdict(props.evaluation, verdict))
}

function toggleIssue(issueId) {
  emit('update:evaluation', toggleManualIssue(props.evaluation, issueId))
}
</script>

<style scoped>
.evidence-panel {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 0 20px 24px;
  overflow-y: auto;
  border-left: 1px solid var(--asc-border);
  background: #fff;
}

.evidence-panel__header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0 15px;
  border-bottom: 1px solid var(--asc-border);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.evidence-panel__header span {
  color: var(--asc-primary);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.evidence-panel h2 {
  margin: 3px 0 0;
  color: var(--asc-heading);
  font-size: 17px;
}

.evidence-panel__header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: #f3f7fa;
  color: var(--asc-text);
  font-size: 18px;
}

.evidence-sources {
  padding: 16px 0 18px;
  border-bottom: 1px solid var(--asc-border);
}

.section-heading,
.section-heading > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-heading h3 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 12px;
}

.section-heading span,
.section-heading > small {
  color: var(--asc-muted);
  font-size: 9px;
}

.section-heading > small {
  white-space: nowrap;
}

.reference-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 11px;
}

.reference-card {
  min-width: 0;
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
  padding: 9px 7px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  text-align: left;
}

.reference-card:hover,
.reference-card--active {
  border-color: #78b5d9;
  background: #f2f9fd;
  box-shadow: inset 0 0 0 1px #b8dced;
}

.reference-card > span {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 900;
}

.reference-card strong,
.reference-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-card strong {
  color: var(--asc-heading);
  font-size: 9px;
}

.reference-card small {
  margin-top: 4px;
  color: var(--asc-muted);
  font-size: 8px;
}

.reference-empty {
  margin: 11px 0 0;
  padding: 12px;
  border-radius: 7px;
  background: #f6f8fa;
  color: var(--asc-muted);
  font-size: 10px;
  text-align: center;
}

.source-excerpt {
  margin-top: 10px;
  padding: 10px 11px;
  border-left: 3px solid #5aa6d3;
  border-radius: 0 7px 7px 0;
  background: #f6fafc;
}

.source-excerpt span {
  color: var(--asc-primary);
  font-size: 8px;
  font-weight: 850;
}

.source-excerpt p {
  margin: 5px 0 0;
  color: var(--asc-text);
  font-size: 9px;
  line-height: 1.55;
}

.evaluation-workspace {
  padding-top: 18px;
}

.evaluation-unavailable {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #e4c98b;
  border-radius: 8px;
  background: #fff9e9;
}

.evaluation-unavailable strong {
  color: #705114;
  font-size: 11px;
}

.evaluation-unavailable p {
  margin: 6px 0 0;
  color: #7b6840;
  font-size: 9px;
  line-height: 1.6;
}

.evaluation-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--asc-border);
  border-radius: 9px;
  background: #f3f6f8;
}

.evaluation-switch button {
  min-height: 35px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 760;
}

.evaluation-switch button.active {
  background: #fff;
  color: var(--asc-primary);
  box-shadow: 0 1px 5px rgba(25, 68, 96, 0.1);
}

button:focus-visible {
  outline: 2px solid #59a8d8;
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .evidence-panel {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(420px, 94vw);
    box-shadow: var(--asc-shadow);
  }
}

@media (max-width: 430px) {
  .reference-list {
    grid-template-columns: 1fr;
  }

  .reference-card strong,
  .reference-card small {
    white-space: normal;
  }
}
</style>
