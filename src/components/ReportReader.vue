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

      <section
        v-if="completedMarkdown"
        class="report-reader__document report-reader__markdown"
        v-html="renderReportMarkdown(completedMarkdown)"
      ></section>

      <div v-else-if="sections.length" class="report-reader__document">
        <section
          v-for="section in sections"
          :key="section.index"
          class="report-reader__section"
        >
          <span class="report-reader__section-number">
            {{ String(section.index).padStart(2, '0') }}
          </span>
          <h2>{{ section.title }}</h2>
          <div
            class="report-reader__markdown"
            v-html="renderReportMarkdown(section.content)"
          ></div>
        </section>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

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
  buildReportSections
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
const progress = computed(() => buildReportProgress(
  state.value.report || { status: state.value.status },
  state.value.sectionsResponse || {}
))
const completedMarkdown = computed(() => (
  state.value.status === 'completed'
    ? String(state.value.report?.markdown_content || '').trim()
    : ''
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

onMounted(openCurrentReport)
onUnmounted(controller.stop)

watch(
  [() => props.reportId, () => props.taskId],
  ([reportId, taskId], [oldReportId, oldTaskId]) => {
    if (reportId === oldReportId && taskId === oldTaskId) return
    openCurrentReport()
  }
)
</script>

<style scoped>
.report-reader {
  width: min(920px, 100%);
  box-sizing: border-box;
  margin: 0 auto;
  color: var(--asc-heading);
}

.report-reader__cover {
  padding: clamp(28px, 5vw, 58px);
  border: 1px solid var(--asc-border);
  border-radius: 18px;
  background: #fff;
  box-shadow: var(--asc-shadow);
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
  margin: 28px 0 12px;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.16;
  letter-spacing: -.04em;
}

.report-reader__cover h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: clamp(19px, 2.4vw, 25px);
  line-height: 1.45;
}

.report-reader__cover p {
  margin: 14px 0 0;
  color: var(--asc-muted);
  line-height: 1.7;
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

.report-reader__document {
  margin-top: 24px;
  padding: clamp(26px, 5vw, 58px);
  border: 1px solid var(--asc-border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 32px rgba(31, 70, 101, .07);
}

.report-reader__section + .report-reader__section {
  margin-top: 54px;
  padding-top: 46px;
  border-top: 1px solid var(--asc-border);
}

.report-reader__section-number {
  color: var(--asc-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 800;
}

.report-reader__section > h2 {
  margin: 9px 0 24px;
  font-size: clamp(24px, 3vw, 32px);
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
  margin: 1.6em 0 .65em;
  color: var(--asc-heading);
  line-height: 1.35;
}

.report-reader__markdown :deep(.report-md__paragraph) {
  margin: 0 0 1.1em;
}

.report-reader__markdown :deep(.kg-discovery-insight) {
  padding: 0 2px;
  border-radius: 3px;
  background: rgba(240, 253, 250, .78);
  color: #0f766e;
  font-weight: 650;
  text-decoration-line: underline;
  text-decoration-color: rgba(20, 184, 166, .58);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.report-reader__markdown :deep(.report-md__quote) {
  margin: 1.4em 0;
  padding: 16px 20px;
  border-left: 4px solid var(--asc-primary);
  background: var(--asc-primary-soft);
  color: #3f596c;
}

.report-reader__markdown :deep(.report-md__list) {
  margin: 1em 0;
  padding-left: 1.6em;
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

@media (max-width: 760px) {
  .report-reader__cover,
  .report-reader__document {
    padding: 24px 20px;
    border-radius: 14px;
  }

  .report-reader__meta {
    align-items: flex-start;
  }

  .report-reader__progress,
  .report-reader__warning,
  .report-reader__state {
    padding: 20px;
  }
}
</style>
