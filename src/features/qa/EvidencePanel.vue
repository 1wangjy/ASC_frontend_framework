<template>
  <aside class="evidence-panel">
    <header class="evidence-panel__header">
      <div>
        <span>ASC EVIDENCE</span>
        <h2>引用证据</h2>
      </div>
      <button type="button" aria-label="关闭证据面板" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <section class="evidence-sources" aria-labelledby="evidence-source-title">
      <div class="section-heading">
        <div>
          <h3 id="evidence-source-title">引用来源</h3>
          <span>{{ evidenceSummary }}</span>
        </div>
        <small>点击正文中的 [R1] 可直接定位</small>
      </div>

      <div v-if="references.length" class="evidence-browser">
        <nav class="reference-column" aria-label="证据列表">
          <h4>证据列表</h4>
          <button
            v-for="reference in references"
            :key="reference.id"
            type="button"
            class="reference-card"
            :class="{ 'reference-card--active': selectedReference?.id === reference.id }"
            :aria-current="selectedReference?.id === reference.id ? 'true' : undefined"
            @click="$emit('select', reference.id)"
          >
            <span>{{ reference.id }}</span>
            <div>
              <strong>{{ reference.title }}</strong>
              <small v-if="reference.paperId || reference.chunkId" class="reference-card__identity">
                {{ [reference.paperId, reference.chunkId].filter(Boolean).join(' · ') }}
              </small>
              <small v-if="reference.locator">{{ reference.locator }}</small>
            </div>
          </button>
        </nav>

        <article v-if="selectedReference" class="reference-detail" :aria-label="`${selectedReference.id} 证据详情`">
          <header class="reference-detail__header">
            <div>
              <span>{{ selectedReference.id }}</span>
              <h3>{{ selectedReference.title }}</h3>
            </div>
            <a
              v-if="sourceUrl"
              :href="sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开原文
              <AscIcon name="arrow-right" />
            </a>
          </header>

          <dl v-if="hasReferenceMeta" class="reference-meta">
            <div v-if="selectedReference.paperId">
              <dt>Paper ID</dt>
              <dd>{{ selectedReference.paperId }}</dd>
            </div>
            <div v-if="selectedReference.chunkId">
              <dt>Evidence Chunk</dt>
              <dd>{{ selectedReference.chunkId }}</dd>
            </div>
            <div v-if="selectedReference.markdownPath">
              <dt>Markdown</dt>
              <dd>{{ selectedReference.markdownPath }}</dd>
            </div>
            <div v-if="locationLabel">
              <dt>位置</dt>
              <dd>{{ locationLabel }}</dd>
            </div>
            <div v-if="selectedReference.authors">
              <dt>作者</dt>
              <dd>{{ selectedReference.authors }}</dd>
            </div>
            <div v-if="selectedReference.year">
              <dt>年份</dt>
              <dd>{{ selectedReference.year }}</dd>
            </div>
          </dl>

          <section v-if="originalText.text" class="detail-block">
            <h4>原始来源片段</h4>
            <p>{{ displayedText(originalText, 'original') }}</p>
            <button
              v-if="originalText.truncated"
              type="button"
              class="detail-block__toggle"
              :aria-expanded="isExpanded('original')"
              @click="toggleExpanded('original')"
            >
              {{ isExpanded('original') ? '收起内容' : '展开全文' }}
            </button>
          </section>

          <section v-if="chunkText.text" class="detail-block detail-block--chunk">
            <div class="detail-block__title">
              <h4>检索证据片段（Chunk）</h4>
              <span v-if="selectedReference.chunkId">{{ selectedReference.chunkId }}</span>
            </div>
            <p>{{ displayedText(chunkText, 'chunk') }}</p>
            <button
              v-if="chunkText.truncated"
              type="button"
              class="detail-block__toggle"
              :aria-expanded="isExpanded('chunk')"
              @click="toggleExpanded('chunk')"
            >
              {{ isExpanded('chunk') ? '收起内容' : '展开全文' }}
            </button>
          </section>

          <section v-if="conditionItems.length" class="detail-block">
            <h4>实验条件</h4>
            <dl class="condition-list">
              <div v-for="item in conditionItems" :key="item.key">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </section>

          <section v-if="scoreLabel" class="evidence-score" aria-label="证据得分">
            <span>证据得分</span>
            <strong>{{ scoreLabel }}</strong>
          </section>
        </article>
      </div>
      <p v-else class="reference-empty">本次回答暂无引用证据</p>
    </section>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import { getPdfPreviewUrl } from '../../api/pdfLibrary.js'
import { buildApiUrl } from '../../api/runtime.js'
import { buildQaEvidenceStats } from './qaAnswerRenderingModel.js'
import {
  buildQaReferenceSourceUrl,
  buildEvidenceTextPreview,
  formatEvidenceScore,
  formatExperimentConditions,
  formatReferenceLocation
} from './qaEvidenceModel.js'

const props = defineProps({
  references: {
    type: Array,
    required: true
  },
  selectedCitationId: {
    type: String,
    default: ''
  }
})

defineEmits(['close', 'select'])

const selectedReference = computed(
  () => props.references.find(reference => reference.id === props.selectedCitationId) || props.references[0]
)
const evidenceSummary = computed(() => {
  const stats = buildQaEvidenceStats(props.references)
  const citationLabel = `${stats.citationCount} 条引用证据`
  return stats.documentCount === null
    ? citationLabel
    : `${citationLabel} · 来自 ${stats.documentCount} 篇文献`
})
const conditionItems = computed(() => formatExperimentConditions(selectedReference.value?.experimentConditions))
const scoreLabel = computed(() => formatEvidenceScore(selectedReference.value?.score))
const locationLabel = computed(() => formatReferenceLocation(selectedReference.value))
const originalText = computed(() => buildEvidenceTextPreview(selectedReference.value?.excerpt))
const chunkText = computed(() => buildEvidenceTextPreview(selectedReference.value?.chunkText))
const expandedBlocks = ref(new Set())
const sourceUrl = computed(() => buildQaReferenceSourceUrl(selectedReference.value, {
  getPdfPreviewUrl,
  buildApiUrl
}))
const hasReferenceMeta = computed(() => Boolean(
  selectedReference.value?.paperId
  || selectedReference.value?.chunkId
  || selectedReference.value?.markdownPath
  || locationLabel.value
  || selectedReference.value?.authors
  || selectedReference.value?.year
))

function expandedKey(kind) {
  return `${selectedReference.value?.id || 'reference'}:${kind}`
}

function isExpanded(kind) {
  return expandedBlocks.value.has(expandedKey(kind))
}

function displayedText(presentation, kind) {
  return isExpanded(kind) ? presentation.text : presentation.preview
}

function toggleExpanded(kind) {
  const key = expandedKey(kind)
  const next = new Set(expandedBlocks.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedBlocks.value = next
}
</script>

<style scoped>
.evidence-panel {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 0 var(--qa-space-6) var(--qa-space-6);
  overflow-y: auto;
  border-left: 1px solid var(--qa-border-color);
  background: var(--qa-surface);
}

.evidence-panel__header {
  min-height: var(--qa-topbar-h);
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--qa-space-5) 0 var(--qa-space-3);
  border-bottom: 1px solid var(--qa-border-color);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.evidence-panel__header span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
  font-weight: 900;
  letter-spacing: 0.14em;
}

.evidence-panel h2 {
  margin: var(--qa-space-1) 0 0;
  color: var(--qa-heading);
  font-size: var(--qa-heading-size);
  font-weight: var(--qa-weight-heavy);
}

.evidence-panel__header button {
  width: var(--qa-control-h);
  height: var(--qa-control-h);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: var(--qa-text);
  cursor: pointer;
}

.evidence-sources {
  padding: var(--qa-panel-pad) 0 var(--qa-space-6);
}

.section-heading,
.section-heading > div {
  min-height: var(--qa-panel-head-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
}

.section-heading h3 {
  margin: 0;
  color: var(--qa-heading);
  font-size: var(--qa-font-md);
  font-weight: var(--qa-weight-heavy);
}

.section-heading span,
.section-heading > small {
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
}

.section-heading > small {
  white-space: nowrap;
}

.evidence-browser {
  display: grid;
  grid-template-columns: minmax(170px, 0.72fr) minmax(260px, 1.28fr);
  gap: var(--qa-space-4);
  margin-top: var(--qa-space-3);
}

.reference-column {
  min-width: 0;
  max-height: calc(100vh - 145px);
  overflow-y: auto;
  padding-right: var(--qa-space-1);
}

.reference-column h4 {
  margin: 0 0 var(--qa-space-2);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
  letter-spacing: 0.04em;
}

.reference-card {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: var(--qa-space-2);
  align-items: start;
  margin-bottom: var(--qa-space-2);
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  text-align: left;
}

.reference-card:hover,
.reference-card--active {
  border-color: #70add2;
  background: #f1f8fc;
  box-shadow: inset 0 0 0 1px #c0dfef;
}

.reference-card > span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
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
  color: var(--qa-heading);
  font-size: var(--qa-control-font);
}

.reference-card small {
  margin-top: var(--qa-space-1);
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
}

.reference-detail {
  min-width: 0;
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
}

.reference-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--qa-space-3);
}

.reference-detail__header span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
  font-weight: 900;
}

.reference-detail__header h3 {
  margin: var(--qa-space-1) 0 0;
  color: var(--qa-heading);
  font-size: var(--qa-font-md);
  font-weight: var(--qa-weight-heavy);
  overflow-wrap: anywhere;
}

.reference-detail__header a {
  flex: 0 0 auto;
  min-height: var(--qa-control-h);
  display: inline-flex;
  align-items: center;
  gap: var(--qa-space-1);
  padding: 0 var(--qa-space-2);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-control);
  color: var(--qa-accent);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
  text-decoration: none;
}

.reference-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--qa-space-2);
  margin: var(--qa-space-3) 0 0;
}

.reference-meta > div,
.condition-list > div {
  padding: var(--qa-space-2);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
}

.reference-meta dt,
.condition-list dt {
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
}

.reference-meta dd,
.condition-list dd {
  margin: var(--qa-space-1) 0 0;
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.detail-block {
  margin-top: var(--qa-space-3);
  padding: var(--qa-space-3);
  border-left: 3px solid #5aa6d3;
  border-radius: 0 var(--qa-radius-control) var(--qa-radius-control) 0;
  background: var(--qa-accent-soft);
}

.detail-block--chunk {
  border-left-color: #8cb9cf;
  background: var(--qa-surface-soft);
}

.detail-block h4 {
  margin: 0;
  color: var(--qa-heading);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-heavy);
}

.detail-block__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
}

.detail-block__title span {
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
}

.detail-block p {
  margin: var(--qa-space-2) 0 0;
  color: var(--qa-text);
  font-size: var(--qa-control-font);
  line-height: 1.65;
  white-space: pre-wrap;
}

.detail-block__toggle {
  margin-top: var(--qa-space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-heavy);
  cursor: pointer;
}

.condition-list {
  display: grid;
  gap: var(--qa-space-2);
  margin: var(--qa-space-2) 0 0;
}

.evidence-score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--qa-space-3);
  padding: var(--qa-space-2) var(--qa-space-3);
  border-radius: var(--qa-radius-control);
  background: var(--qa-success-soft);
  color: #257254;
  font-size: var(--qa-font-sm);
}

.evidence-score strong {
  font-size: var(--qa-font-lg);
}

.reference-empty {
  margin: var(--qa-space-3) 0 0;
  padding: var(--qa-panel-pad);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  text-align: center;
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid #59a8d8;
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .evidence-panel {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(680px, 96vw);
    box-shadow: var(--asc-shadow);
  }
}

@media (max-width: 640px) {
  .section-heading > small {
    display: none;
  }

  .evidence-browser {
    grid-template-columns: 1fr;
  }

  .reference-column {
    max-height: 220px;
  }

  .reference-meta {
    grid-template-columns: 1fr;
  }
}
</style>
