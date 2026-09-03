<template>
  <section class="conversation" aria-live="polite">
    <div v-if="state.phase === 'loading'" class="message-row">
      <QaQueryProgress />
    </div>

    <div v-else-if="state.phase === 'error'" class="message-row">
      <div class="answer-card answer-card--error" role="alert">
        <strong>这次问答没有完成</strong>
        <p>{{ state.errorMessage }}</p>
        <button type="button" @click="$emit('retry')">重新请求后端</button>
      </div>
    </div>

    <div v-else-if="state.answer" class="message-row">
      <article
        ref="answerCard"
        class="answer-card"
        @mouseup="captureAnswerSelection"
        @keyup="captureAnswerSelection"
      >
        <div v-if="state.answerSource === 'preview'" class="answer-preview-notice" role="status">
          界面预览数据，未请求后端
        </div>
        <header>
          <div>
            <span>ASC QA</span>
            <h2>LLMs + CoD 主回答</h2>
            <strong>{{ evidenceSummary }}</strong>
          </div>
          <div class="answer-actions">
            <button
              v-if="state.references?.length"
              type="button"
              @click="$emit('open-evidence')"
            >
              查看引用证据
            </button>
            <button
              v-if="hasQualityData || evaluationEnabled"
              type="button"
              @click="$emit('open-quality')"
            >
              查看质量评估
            </button>
          </div>
        </header>

        <p v-if="state.answer.summary" class="answer-summary">
          <QaAnswerText
            :text="state.answer.summary"
            :references="state.references"
            :domain-terms="domainTerms"
            @citation="emit('citation', $event)"
          />
        </p>

        <ol class="answer-sections">
          <li v-for="section in state.answer.sections" :key="section.title">
            <div>
              <strong>{{ section.title }}</strong>
              <p>
                <QaAnswerText
                  :text="section.body"
                  :references="state.references"
                  :domain-terms="domainTerms"
                  :citation-ids="section.citations"
                  @citation="emit('citation', $event)"
                />
              </p>
            </div>
          </li>
        </ol>

      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { buildAscDomainTerms } from '../../utils/ascDomainHighlighter.js'
import { normalizeAnswerExcerpt } from './answerEvaluationModel.js'
import QaAnswerText from './QaAnswerText.js'
import { buildQaEvidenceStats } from './qaAnswerRenderingModel.js'
import { hasQaQualityData } from './qaQualityModel.js'
import QaQueryProgress from './QaQueryProgress.vue'

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  evaluationEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['citation', 'open-evidence', 'open-quality', 'answer-selection', 'retry'])
const answerCard = ref(null)
const domainTerms = computed(() => buildAscDomainTerms({
  content: [
    props.state?.answer?.summary,
    ...(props.state?.answer?.sections || []).map(section => section?.body)
  ].filter(Boolean).join('\n'),
  question: props.state?.question,
  result: props.state?.qaResult
}))
const evidenceSummary = computed(() => {
  const stats = buildQaEvidenceStats(props.state?.references)
  const citationLabel = `基于 ${stats.citationCount} 条引用证据生成`
  return stats.documentCount === null
    ? citationLabel
    : `${citationLabel}，来自 ${stats.documentCount} 篇文献`
})
const hasQualityData = computed(() => hasQaQualityData(props.state?.qaResult || {}))

function captureAnswerSelection() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !answerCard.value) return
  if (
    !answerCard.value.contains(selection.anchorNode)
    || !answerCard.value.contains(selection.focusNode)
  ) return

  const excerpt = normalizeAnswerExcerpt(selection.toString())
  if (excerpt) emit('answer-selection', excerpt)
}
</script>

<style scoped>
.conversation {
  width: 100%;
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 22px;
}

.message-row {
  display: block;
}

.avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 900;
}

.avatar--user {
  border: 1px solid #bedaf0;
  background: #e9f5fd;
  color: var(--asc-primary);
}

.avatar--asc {
  background: var(--asc-primary);
  color: #fff;
}

.user-message {
  justify-self: stretch;
  padding: 15px 18px;
  border: 1px solid #c9e0f0;
  border-radius: 8px;
  background: #eaf5fc;
  color: var(--asc-heading);
  font-size: 15px;
}

.answer-card {
  padding: 20px 22px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.answer-preview-notice {
  margin: -4px 0 14px;
  padding: 8px 10px;
  border: 1px solid #e4c98b;
  border-radius: 6px;
  background: #fff9e9;
  color: #7a5a16;
  font-size: 12px;
  font-weight: 750;
}

.answer-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--asc-border);
}

.answer-card header div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.answer-card header > div:first-child {
  min-width: 0;
}

.answer-card header h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 18px;
}

.answer-card header span {
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.answer-card header strong {
  color: var(--asc-muted);
  font-size: 12px;
}

.answer-actions {
  flex: 0 0 auto;
}

.answer-card header .answer-actions button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #b9d8eb;
  border-radius: 7px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

@media (max-width: 760px) {
  .answer-card header,
  .answer-card header > div:first-child {
    align-items: flex-start;
  }

  .answer-card header,
  .answer-card header > div:first-child,
  .answer-actions {
    flex-direction: column;
  }
}

.answer-summary {
  margin: 17px 0;
  color: var(--asc-heading);
  font-size: 14px;
  line-height: 1.75;
}

.answer-sections {
  display: grid;
  gap: 13px;
  margin: 0;
  padding-left: 22px;
}

.answer-sections li {
  padding-left: 4px;
  color: var(--asc-heading);
}

.answer-sections strong {
  font-size: 14px;
}

.answer-sections p {
  display: inline;
  margin: 0 0 0 6px;
  color: var(--asc-text);
  font-size: 13px;
  line-height: 1.75;
}

.answer-card :deep(.qa-answer-rich-text) {
  white-space: pre-wrap;
}

.answer-card :deep(.qa-answer-format--code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #334155;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: .92em;
}

.answer-card :deep(.qa-inline-citation) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  margin: 0 2px;
  padding: 0 5px;
  border: 1px solid #c7d2fe;
  border-radius: 5px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
  vertical-align: baseline;
  cursor: pointer;
}

.answer-card :deep(.qa-inline-citation:hover),
.answer-card :deep(.qa-inline-citation:focus-visible) {
  border-color: #4f46e5;
  background: #e0e7ff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}

.answer-card :deep(.qa-domain-term) {
  border-radius: 3px;
  color: #123f46;
  font-weight: 850;
  text-decoration-skip-ink: auto;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.answer-card :deep(.qa-domain-term:hover) {
  background: rgba(20, 184, 166, 0.09);
  color: #0f766e;
}

.answer-card :deep(.qa-domain-term u) {
  font-weight: inherit;
  text-decoration-color: #14b8a6;
  text-decoration-thickness: 1.7px;
  text-underline-offset: 3px;
}

.answer-card--error {
  border-color: #e8b8b2;
  background: #fff8f7;
}

.answer-card--error strong {
  color: #9d3f36;
  font-size: 13px;
}

.answer-card--error p {
  margin: 7px 0 13px;
  color: #735a57;
  font-size: 12px;
  line-height: 1.6;
}

.answer-card--error button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 620px) {
  .message-row {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 8px;
  }

  .avatar {
    width: 30px;
    height: 30px;
    font-size: 9px;
  }

  .answer-card {
    padding: 15px;
  }

  .answer-card header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
