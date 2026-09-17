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
  gap: var(--qa-section-gap);
}

.message-row {
  display: block;
}

.avatar {
  width: var(--qa-space-10);
  height: var(--qa-space-10);
  display: grid;
  place-items: center;
  border-radius: var(--qa-radius-chip);
  font-size: var(--qa-font-xs);
  font-weight: 900;
}

.avatar--user {
  border: 1px solid var(--qa-border-strong);
  background: var(--qa-accent-soft);
  color: var(--qa-accent);
}

.avatar--asc {
  background: var(--qa-accent);
  color: #fff;
}

.user-message {
  justify-self: stretch;
  padding: var(--qa-space-3) var(--qa-panel-pad);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-card);
  background: var(--qa-accent-soft);
  color: var(--qa-heading);
  font-size: var(--qa-font-lg);
}

.answer-card {
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface);
  box-shadow: var(--qa-shadow-card);
}

.answer-preview-notice {
  margin: calc(var(--qa-space-1) * -1) 0 var(--qa-space-3);
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid #e4c98b;
  border-radius: var(--qa-radius-control);
  background: var(--qa-warning-soft);
  color: #7a5a16;
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
}

.answer-card header {
  min-height: var(--qa-panel-head-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-4);
  padding-bottom: var(--qa-space-3);
  border-bottom: 1px solid var(--qa-border-color);
}

.answer-card header div {
  display: flex;
  align-items: center;
  gap: var(--qa-space-2);
}

.answer-card header > div:first-child {
  min-width: 0;
}

.answer-card header h2 {
  margin: 0;
  color: var(--qa-heading);
  font-size: var(--qa-heading-size);
  font-weight: var(--qa-weight-heavy);
}

.answer-card header span {
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  font-weight: 900;
  letter-spacing: 0.05em;
}

.answer-card header strong {
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
}

.answer-actions {
  flex: 0 0 auto;
}

.answer-card header .answer-actions button {
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-control-pad-x);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  color: var(--qa-accent);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
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
  margin: var(--qa-space-4) 0;
  color: var(--qa-heading);
  font-size: var(--qa-font-md);
  line-height: 1.75;
}

.answer-sections {
  display: grid;
  gap: var(--qa-space-3);
  margin: 0;
  padding-left: var(--qa-space-6);
}

.answer-sections li {
  padding-left: var(--qa-space-1);
  color: var(--qa-heading);
}

.answer-sections strong {
  font-size: var(--qa-font-md);
}

.answer-sections p {
  display: inline;
  margin: 0 0 0 var(--qa-space-2);
  color: var(--qa-text);
  font-size: var(--qa-control-font);
  line-height: 1.75;
}

.answer-card :deep(.qa-answer-rich-text) {
  white-space: pre-wrap;
}

.answer-card :deep(.qa-answer-format--code) {
  padding: 1px var(--qa-space-1);
  border-radius: var(--qa-space-1);
  background: #f1f5f9;
  color: #334155;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: .92em;
}

.answer-card :deep(.qa-inline-citation) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--qa-space-5);
  margin: 0 2px;
  padding: 0 var(--qa-space-1);
  border: 1px solid #c7d2fe;
  border-radius: var(--qa-space-1);
  background: #eef2ff;
  color: #4338ca;
  font-size: var(--qa-font-xs);
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
  font-size: var(--qa-control-font);
}

.answer-card--error p {
  margin: var(--qa-space-2) 0 var(--qa-space-3);
  color: #735a57;
  font-size: var(--qa-font-sm);
  line-height: 1.6;
}

.answer-card--error button {
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-control-pad-x);
  border: 0;
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent);
  color: #fff;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
}

@media (max-width: 620px) {
  .message-row {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: var(--qa-space-2);
  }

  .avatar {
    width: 30px;
    height: 30px;
    font-size: 9px;
  }

  .answer-card {
    padding: var(--qa-space-3);
  }

  .answer-card header {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--qa-space-2);
  }
}
</style>
