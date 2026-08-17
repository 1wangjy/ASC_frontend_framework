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
  padding: 0 22px 24px;
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
  font-size: 18px;
}

.evidence-panel__header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: #f3f7fa;
  color: var(--asc-text);
}

.evidence-sources {
  padding: 18px 0 24px;
}

.section-heading,
.section-heading > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.section-heading h3 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 13px;
}

.section-heading span,
.section-heading > small {
  color: var(--asc-muted);
  font-size: 10px;
}

.section-heading > small {
  white-space: nowrap;
}

.evidence-browser {
  display: grid;
  grid-template-columns: minmax(170px, 0.72fr) minmax(260px, 1.28fr);
  gap: 16px;
  margin-top: 14px;
}

.reference-column {
  min-width: 0;
  max-height: calc(100vh - 145px);
  overflow-y: auto;
  padding-right: 5px;
}

.reference-column h4 {
  margin: 0 0 8px;
  color: var(--asc-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.reference-card {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-bottom: 7px;
  padding: 10px 9px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  text-align: left;
}

.reference-card:hover,
.reference-card--active {
  border-color: #70add2;
  background: #f1f8fc;
  box-shadow: inset 0 0 0 1px #c0dfef;
}

.reference-card > span {
  color: var(--asc-primary);
  font-size: 11px;
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
  font-size: 10px;
}

.reference-card small {
  margin-top: 5px;
  color: var(--asc-muted);
  font-size: 9px;
}

.reference-detail {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: #fbfdfe;
}

.reference-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.reference-detail__header span {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 900;
}

.reference-detail__header h3 {
  margin: 4px 0 0;
  color: var(--asc-heading);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.reference-detail__header a {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 9px;
  border: 1px solid #90bed9;
  border-radius: 7px;
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 800;
  text-decoration: none;
}

.reference-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 14px 0 0;
}

.reference-meta > div,
.condition-list > div {
  padding: 8px;
  border-radius: 7px;
  background: #f0f5f8;
}

.reference-meta dt,
.condition-list dt {
  color: var(--asc-muted);
  font-size: 8px;
}

.reference-meta dd,
.condition-list dd {
  margin: 4px 0 0;
  color: var(--asc-text);
  font-size: 9px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.detail-block {
  margin-top: 12px;
  padding: 12px;
  border-left: 3px solid #5aa6d3;
  border-radius: 0 8px 8px 0;
  background: #f4f9fc;
}

.detail-block--chunk {
  border-left-color: #8cb9cf;
  background: #f7fafc;
}

.detail-block h4 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 10px;
}

.detail-block__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.detail-block__title span {
  color: var(--asc-muted);
  font-size: 8px;
}

.detail-block p {
  margin: 7px 0 0;
  color: var(--asc-text);
  font-size: 10px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.detail-block__toggle {
  margin-top: 9px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--asc-primary);
  font-size: 9px;
  font-weight: 800;
}

.condition-list {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
}

.evidence-score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #edf7f2;
  color: #257254;
  font-size: 10px;
}

.evidence-score strong {
  font-size: 15px;
}

.reference-empty {
  margin: 14px 0 0;
  padding: 18px;
  border-radius: 8px;
  background: #f6f8fa;
  color: var(--asc-muted);
  font-size: 10px;
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
