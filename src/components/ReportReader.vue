<template>
  <article class="report-reader" :aria-busy="state.loading">
    <header class="report-reader__cover">
      <div class="report-reader__meta">
        <span class="report-reader__mark">KG RESEARCH REPORT</span>
        <span class="report-reader__status" :class="`report-reader__status--${state.status}`">
          {{ statusLabel }}
        </span>
      </div>
      <h1>{{ displayTitle }}</h1>
      <h2 v-if="state.report?.title">{{ state.report.title }}</h2>
      <p v-if="state.report?.subtitle">{{ state.report.subtitle }}</p>
      <small v-if="state.reportId">报告 ID：{{ state.reportId }}</small>
    </header>

    <section v-if="state.loading" class="report-reader__state" role="status">
      <span class="report-reader__spinner" aria-hidden="true"></span>
      <h2>正在读取报告</h2>
      <p>正在从后端读取已保存的报告内容。</p>
    </section>

    <section
      v-else-if="state.status === 'failed'"
      class="report-reader__state report-reader__state--error"
      role="alert"
    >
      <span class="report-reader__state-code">REPORT FAILED</span>
      <h2>报告生成失败</h2>
      <p>{{ state.error || '后端未能完成这份报告。' }}</p>
      <button type="button" @click="retry">重新读取</button>
    </section>

    <template v-else>
      <section
        v-if="state.status === 'generating' || state.status === 'unknown'"
        class="report-reader__progress"
        role="status"
      >
        <div>
          <strong>报告生成中</strong>
          <span>{{ progress.completed }}/{{ progress.total || '—' }} 章</span>
        </div>
        <progress :value="progress.percent" max="100">{{ progress.percent }}%</progress>
        <p>已生成的章节会自动出现在下方，你可以留在此页继续查看。</p>
      </section>

      <aside v-if="state.error" class="report-reader__warning" role="status">
        {{ state.error }}，页面会继续读取已保存内容。
      </aside>

      <div
        v-if="sections.length"
        class="report-reader__content"
        :class="{ 'report-reader__content--with-aside': hasSectionAside }"
      >
        <nav class="report-reader__toc-card" aria-label="报告章节导航">
          <span class="report-reader__toc-label">章节导航</span>
          <button
            v-for="section in sections"
            :key="section.index"
            type="button"
            class="report-reader__toc-item"
            :class="{ 'report-reader__toc-item--active': currentSection?.index === section.index }"
            :aria-current="currentSection?.index === section.index ? 'location' : undefined"
            @click="selectSection(section)"
          >
            <span class="report-reader__toc-number">{{ section.number }}</span>
            <span class="report-reader__toc-title">{{ section.title }}</span>
          </button>
        </nav>

        <div ref="documentElement" class="report-reader__document">
          <article
            v-if="currentSection"
            :key="currentSection.index"
            class="report-reader__chapter report-reader__chapter--active"
          >
            <header
              class="report-reader__chapter-toggle"
            >
              <span class="report-reader__chapter-number">{{ currentSection.number }}</span>
              <span class="report-reader__chapter-title">{{ currentSection.title }}</span>
            </header>
            <div
              class="report-reader__chapter-body report-reader__markdown"
              v-html="renderReportMarkdown(currentSection.content)"
            ></div>
          </article>
        </div>

        <aside v-if="hasSectionAside" class="report-reader__section-aside">
          <section
            v-if="sectionHighlights.length"
            class="report-reader__highlights-card"
            aria-labelledby="report-section-highlights-title"
          >
            <span class="report-reader__highlights-kicker">CURRENT SECTION</span>
            <h2 id="report-section-highlights-title">本章重点</h2>
            <ol class="report-reader__highlights-list">
              <li
                v-for="(highlight, index) in sectionHighlights"
                :key="`${highlight.label}-${index}`"
                class="report-reader__highlight"
              >
                <span class="report-reader__highlight-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <div>
                  <strong>{{ highlight.label }}</strong>
                  <div
                    class="report-reader__highlight-text"
                    v-html="renderReportMarkdown(highlight.text)"
                  ></div>
                </div>
              </li>
            </ol>
          </section>

          <section
            v-if="sectionKeywords.length"
            class="report-reader__keywords-card"
            aria-labelledby="report-section-keywords-title"
          >
            <h2 id="report-section-keywords-title">关键词</h2>
            <div class="report-reader__keyword-list">
              <span
                v-for="keyword in sectionKeywords"
                :key="keyword"
                class="report-reader__keyword-chip"
              >{{ keyword }}</span>
            </div>
          </section>
        </aside>
      </div>

      <section v-else class="report-reader__state">
        <span class="report-reader__state-code">CONTENT PENDING</span>
        <h2>报告正文尚未就绪</h2>
        <p>报告记录已经存在，正文或章节仍在由后端保存。</p>
        <button type="button" @click="retry">重新读取</button>
      </section>
    </template>
  </article>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  getAgentLog,
  getReport,
  getReportSections,
  getReportStatus
} from '../api/report.js'
import { createReportReaderController } from '../features/reports/reportReaderController.js'
import { renderReportMarkdown } from '../features/reports/reportMarkdown.js'
import {
  buildProjectReportTitle,
  buildReportProgress,
  buildReportSections,
  extractSectionHighlights,
  extractSectionKeywords,
  resolveCurrentSection
} from '../features/reports/reportReaderModel.js'

defineOptions({ name: 'ReportReader' })

const props = defineProps({
  reportId: { type: String, required: true },
  taskId: { type: String, default: '' },
  projectName: { type: String, default: '' }
})

const emit = defineEmits(['report-state'])

const state = ref({
  reportId: String(props.reportId || '').trim(),
  taskId: String(props.taskId || '').trim(),
  loading: true,
  report: null,
  sectionsResponse: null,
  agentLogs: [],
  agentLogLine: 0,
  status: 'unknown',
  error: ''
})

const controller = createReportReaderController({
  getReport,
  getSections: getReportSections,
  getAgentLog,
  getStatus: getReportStatus,
  onChange: nextState => {
    state.value = nextState
    emit('report-state', {
      report: nextState.report,
      status: nextState.status
    })
  }
})

const displayTitle = computed(() => buildProjectReportTitle(props.projectName))
const sections = computed(() => buildReportSections(
  state.value.report || {},
  state.value.sectionsResponse || {}
))
const currentSection = ref(null)
const sectionHighlights = computed(() => extractSectionHighlights(currentSection.value?.content))
const sectionKeywords = computed(() => extractSectionKeywords(currentSection.value?.content))
const hasSectionAside = computed(() => sectionHighlights.value.length || sectionKeywords.value.length)
const documentElement = ref(null)
const progress = computed(() => buildReportProgress(
  state.value.report || { status: state.value.status },
  state.value.sectionsResponse || {}
))
const statusLabel = computed(() => {
  if (state.value.status === 'completed') return '已完成'
  if (state.value.status === 'failed') return '生成失败'
  if (state.value.status === 'generating') return '生成中'
  return '读取中'
})

function openCurrentReport() {
  return controller.open({
    reportId: props.reportId,
    taskId: props.taskId
  })
}

function retry() {
  openCurrentReport()
}

async function selectSection(section) {
  currentSection.value = section
  await nextTick()
  documentElement.value?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}

onMounted(openCurrentReport)
onUnmounted(controller.stop)

watch(
  sections,
  nextSections => {
    currentSection.value = resolveCurrentSection(nextSections, currentSection.value)
  },
  { immediate: true }
)

watch(
  [() => props.reportId, () => props.taskId],
  ([reportId, taskId], [oldReportId, oldTaskId]) => {
    if (reportId === oldReportId && taskId === oldTaskId) return
    currentSection.value = null
    openCurrentReport()
  }
)
</script>

<style scoped>
.report-reader {
  width: min(1420px, 100%);
  box-sizing: border-box;
  margin: 0 auto;
  color: var(--asc-heading);
}

.report-reader__cover {
  position: relative;
  overflow: hidden;
  padding: clamp(34px, 4vw, 58px) clamp(34px, 5vw, 72px);
  border: 1px solid var(--asc-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 42px rgba(31, 70, 101, .08);
}

.report-reader__cover::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--asc-primary), #71b5e1);
  content: '';
}

.report-reader__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.report-reader__mark,
.report-reader__state-code {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .14em;
}

.report-reader__status {
  padding: 6px 11px;
  border-radius: 999px;
  background: #eef2f5;
  color: var(--asc-muted);
  font-size: 12px;
  font-weight: 800;
}

.report-reader__status--completed {
  background: #e9f7f0;
  color: #147553;
}

.report-reader__status--generating {
  background: #fff1e9;
  color: #b45324;
}

.report-reader__status--failed {
  background: #fff0ef;
  color: #a8322a;
}

.report-reader__cover h1 {
  max-width: 960px;
  margin: 30px 0 14px;
  font-size: clamp(32px, 3.6vw, 48px);
  line-height: 1.13;
  letter-spacing: -.04em;
}

.report-reader__cover h2 {
  max-width: 960px;
  margin: 0;
  color: var(--asc-heading);
  font-size: clamp(19px, 2.2vw, 26px);
  line-height: 1.45;
}

.report-reader__cover p {
  max-width: 900px;
  margin: 14px 0 0;
  color: var(--asc-muted);
  line-height: 1.8;
}

.report-reader__cover small {
  display: block;
  margin-top: 24px;
  color: #8ba0b0;
  font-family: 'JetBrains Mono', monospace;
}

.report-reader__progress,
.report-reader__warning,
.report-reader__state {
  margin-top: 22px;
  padding: 24px 28px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
}

.report-reader__progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.report-reader__progress progress {
  width: 100%;
  height: 8px;
  margin-top: 16px;
  accent-color: var(--asc-primary);
}

.report-reader__progress p,
.report-reader__state p {
  margin: 12px 0 0;
  color: var(--asc-muted);
  line-height: 1.6;
}

.report-reader__warning {
  border-color: #eedab9;
  background: #fffaf0;
  color: #8a5a18;
  line-height: 1.6;
}

.report-reader__content {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  align-items: start;
  gap: 28px;
  margin-top: 30px;
}

.report-reader__content--with-aside {
  grid-template-columns: 210px minmax(0, 1fr) 250px;
}

.report-reader__toc-card {
  position: sticky;
  top: 20px;
  display: grid;
  max-height: calc(100vh - 40px);
  gap: 5px;
  padding: 14px;
  overflow-y: auto;
  border: 1px solid var(--asc-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(31, 70, 101, .075);
}

.report-reader__toc-label {
  padding: 4px 9px 12px;
  color: var(--asc-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .1em;
}

.report-reader__toc-item {
  display: grid;
  grid-template-columns: 31px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
  width: 100%;
  padding: 12px 11px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--asc-muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, color .18s ease;
}

.report-reader__toc-item:hover {
  border-color: var(--asc-border);
  background: #f5f9fc;
  color: var(--asc-heading);
}

.report-reader__toc-item--active {
  border-color: #b8d9f1;
  background: linear-gradient(135deg, #edf7fe, #f7fbfe);
  color: var(--asc-primary);
  box-shadow: inset 3px 0 0 var(--asc-primary);
}

.report-reader__toc-item:focus-visible,
.report-reader__chapter-toggle:focus-visible {
  outline: 3px solid rgba(26, 117, 178, .2);
  outline-offset: 2px;
}

.report-reader__toc-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 900;
}

.report-reader__toc-title {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.5;
}

.report-reader__document {
  margin-top: 0;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 16px 42px rgba(31, 70, 101, .075);
}

.report-reader__section-aside {
  position: sticky;
  top: 20px;
  display: grid;
  align-self: start;
  align-content: start;
  grid-auto-rows: max-content;
  max-height: calc(100vh - 40px);
  gap: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.report-reader__highlights-card,
.report-reader__keywords-card {
  padding: 18px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 9px 24px rgba(31, 70, 101, .07);
}

.report-reader__highlights-kicker {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .12em;
}

.report-reader__highlights-card h2 {
  margin: 7px 0 15px;
  color: var(--asc-heading);
  font-size: 17px;
  letter-spacing: -.015em;
}

.report-reader__highlights-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-reader__highlight {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #e8f0f5;
}

.report-reader__highlight:first-child {
  padding-top: 0;
  border-top: 0;
}

.report-reader__highlight-number {
  color: var(--asc-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 900;
}

.report-reader__highlight strong {
  display: block;
  margin-bottom: 4px;
  color: var(--asc-heading);
  font-size: 12px;
  line-height: 1.45;
}

.report-reader__highlight-text {
  color: #4d6577;
  font-size: 13px;
  line-height: 1.65;
}

.report-reader__highlight-text :deep(.report-md__paragraph) {
  margin: 0;
}

.report-reader__keywords-card h2 {
  margin: 0 0 14px;
  color: var(--asc-heading);
  font-size: 17px;
  letter-spacing: -.015em;
}

.report-reader__keyword-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 6px;
}

.report-reader__keyword-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 3px 9px;
  border: 1px solid #c9e0f1;
  border-radius: 999px;
  background: #f2f8fc;
  color: #17689f;
  font-size: 11.5px;
  font-weight: 750;
  line-height: 1.3;
}

.report-reader__chapter {
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 14px;
  scroll-margin-top: 20px;
}

.report-reader__chapter + .report-reader__chapter {
  margin-top: 8px;
}

.report-reader__chapter--active {
  border-color: #bdd9ed;
  background: #fff;
  box-shadow: 0 8px 24px rgba(34, 85, 120, .06);
}

.report-reader__chapter-toggle {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 54px;
  padding: 13px 17px;
  border: 0;
  border-radius: 11px;
  background: #f7fafc;
  color: var(--asc-heading);
  font: inherit;
  text-align: left;
  cursor: default;
}

.report-reader__chapter--active .report-reader__chapter-toggle {
  min-height: 64px;
  background: linear-gradient(135deg, #eaf5fc, #f6fbfe);
  color: var(--asc-primary);
  box-shadow: inset 4px 0 0 var(--asc-primary);
}

.report-reader__chapter-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 900;
}

.report-reader__chapter-title {
  font-size: 15px;
  font-weight: 850;
  line-height: 1.45;
}

.report-reader__chapter--active .report-reader__chapter-title {
  font-size: 18px;
}

.report-reader__chapter-icon {
  color: #7991a3;
  font-size: 20px;
  line-height: 1;
  text-align: center;
  transition: transform .18s ease;
}

.report-reader__chapter--active .report-reader__chapter-icon {
  color: var(--asc-primary);
  transform: rotate(180deg);
}

.report-reader__chapter-body {
  width: min(840px, 100%);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 24px clamp(24px, 4vw, 48px) 48px;
}

.report-reader__state {
  text-align: center;
}

.report-reader__state h2 {
  margin: 14px 0 0;
}

.report-reader__state button {
  min-height: 40px;
  margin-top: 20px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--asc-primary);
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.report-reader__state--error {
  border-color: #f0c5bf;
  background: #fffafa;
}

.report-reader__spinner {
  width: 26px;
  height: 26px;
  display: inline-block;
  border: 3px solid var(--asc-primary-soft);
  border-top-color: var(--asc-primary);
  border-radius: 50%;
  animation: report-reader-spin .85s linear infinite;
}

.report-reader__markdown {
  color: #263a49;
  font-size: 16px;
  line-height: 1.9;
}

.report-reader__markdown :deep(h1),
.report-reader__markdown :deep(h2),
.report-reader__markdown :deep(h3),
.report-reader__markdown :deep(h4) {
  color: var(--asc-heading);
  line-height: 1.35;
  letter-spacing: -.025em;
}

.report-reader__markdown :deep(h1) {
  margin: 0 0 .9em;
  padding-bottom: .5em;
  border-bottom: 1px solid #e3edf4;
  font-size: clamp(27px, 2.5vw, 32px);
}

.report-reader__markdown :deep(h2) {
  margin: 2em 0 .85em;
  padding-bottom: .4em;
  border-bottom: 1px solid #e3edf4;
  font-size: clamp(23px, 2vw, 27px);
}

.report-reader__markdown :deep(h3) {
  margin: 1.75em 0 .7em;
  font-size: 20px;
}

.report-reader__markdown :deep(h4) {
  margin: 1.55em 0 .65em;
  font-size: 17px;
}

.report-reader__markdown :deep(.report-md__paragraph) {
  margin: 0 0 1.45em;
}

.report-reader__markdown :deep(.kg-discovery-insight) {
  display: block;
  margin: 1.35em 0;
  padding: 14px 16px;
  border: 1px solid #bfe6dd;
  border-left: 4px solid #159b84;
  border-radius: 10px;
  background: #f2fbf8;
  color: #146b5d;
  font-weight: 650;
  line-height: 1.75;
  text-decoration: none;
  box-shadow: 0 6px 16px rgba(20, 120, 100, .055);
}

.report-reader__markdown :deep(.report-md__quote) {
  margin: 1.35em 0;
  padding: 14px 18px;
  border-left: 3px solid var(--asc-primary);
  border-radius: 0 8px 8px 0;
  background: linear-gradient(90deg, var(--asc-primary-soft), #fbfdff);
  color: #3f596c;
  line-height: 1.75;
}

.report-reader__markdown :deep(.report-md__list) {
  margin: 1.35em 0 1.65em;
  padding-left: 1.8em;
  line-height: 1.85;
}

.report-reader__markdown :deep(.report-md__list li + li) {
  margin-top: .65em;
}

.report-reader__markdown :deep(.report-md__code) {
  overflow: auto;
  padding: 18px;
  border-radius: 10px;
  background: #10202c;
  color: #e8f1f6;
}

.report-reader__markdown :deep(.report-md__inline-code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef4f7;
}

.report-reader__markdown :deep(.report-md__table-wrap) {
  max-width: 100%;
  margin: 1.4em 0;
  overflow-x: auto;
}

.report-reader__markdown :deep(.report-md__table) {
  width: 100%;
  border-collapse: collapse;
}

.report-reader__markdown :deep(th),
.report-reader__markdown :deep(td) {
  padding: 10px 12px;
  border: 1px solid var(--asc-border);
  text-align: left;
}

.report-reader__markdown :deep(th) {
  background: #f3f7f9;
}

@keyframes report-reader-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1040px) {
  .report-reader__content--with-aside {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .report-reader__section-aside {
    position: static;
    grid-column: 2;
  }
}

@media (max-width: 760px) {
  .report-reader__cover,
  .report-reader__document {
    padding: 24px 20px;
    border-radius: 14px;
  }

  .report-reader__document {
    padding: 10px;
  }

  .report-reader__chapter-body {
    padding: 8px 16px 28px;
  }

  .report-reader__meta {
    align-items: flex-start;
  }

  .report-reader__progress,
  .report-reader__warning,
  .report-reader__state {
    padding: 20px;
  }

  .report-reader__content {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-reader__section-aside {
    grid-column: auto;
  }

  .report-reader__toc-card {
    position: static;
  }
}
</style>
