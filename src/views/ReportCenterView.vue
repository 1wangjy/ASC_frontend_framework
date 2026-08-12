<template>
  <main class="report-center-view" aria-labelledby="report-center-title">
    <header class="report-center-view__header">
      <div>
        <span class="report-center-view__mark">REPORT CENTER</span>
        <h1 id="report-center-title">报告生成</h1>
        <p>查看后端已保存的研究报告，并继续跟踪仍在生成的报告。</p>
      </div>
      <button type="button" :disabled="loading" @click="refreshReports">
        {{ loading ? '加载中' : '刷新报告' }}
      </button>
    </header>

    <section v-if="loading" class="report-center-view__state" role="status">
      <span class="report-center-view__spinner" aria-hidden="true"></span>
      <h2>正在读取已保存报告</h2>
      <p>报告内容来自后端存储，不会在此页面重新生成。</p>
    </section>

    <section v-else-if="error" class="report-center-view__state report-center-view__state--error" role="alert">
      <span class="report-center-view__state-code">LOAD ERROR</span>
      <h2>报告列表加载失败</h2>
      <p>{{ error }}</p>
      <button type="button" @click="refreshReports">重新加载</button>
    </section>

    <section v-else-if="!records.length" class="report-center-view__state">
      <span class="report-center-view__state-code">NO REPORT</span>
      <h2>尚无报告</h2>
      <p>请先完成图谱演化，再生成并查看对应的研究报告。</p>
      <router-link to="/process">前往图谱演化</router-link>
    </section>

    <p v-if="actionError" class="report-center-view__action-error" role="alert">
      {{ actionError }}
    </p>

    <section v-if="!loading && !error && records.length" class="report-center-view__grid" aria-label="已保存的研究报告">
      <article
        v-for="record in records"
        :key="record.projectId || record.reportId"
        class="report-card"
      >
        <header class="report-card__header">
          <span class="report-card__project">KG REPORT</span>
          <span class="report-card__status" :class="`report-card__status--${record.status}`">
            {{ record.statusLabel }}
          </span>
        </header>

        <h2>{{ record.displayTitle }}</h2>
        <p v-if="record.title" class="report-card__topic">研究主题：{{ record.title }}</p>
        <p v-if="record.subtitle" class="report-card__summary">{{ record.subtitle }}</p>
          <p v-else class="report-card__summary report-card__summary--muted">暂无报告简介</p>

        <dl class="report-card__meta">
          <div>
            <dt>报告 ID</dt>
            <dd>{{ record.reportId || '待生成' }}</dd>
          </div>
          <div>
            <dt>{{ record.completedAt ? '完成时间' : '创建时间' }}</dt>
            <dd>{{ record.completedAt || record.createdAt ? formatReportDate(record.completedAt || record.createdAt) : '时间未知' }}</dd>
          </div>
        </dl>

        <p v-if="record.status === 'failed' && record.error" class="report-card__error">
          {{ record.error }}
        </p>

        <footer class="report-card__actions">
          <button
            v-if="record.canGenerate"
            type="button"
            :disabled="mutatingProjectId === record.projectId"
            @click="generateRecord(record)"
          >
            {{ mutatingProjectId === record.projectId ? '生成中' : '生成报告' }}
          </button>
          <router-link v-if="record.reportId" :to="reportRoute(record)">预览</router-link>
          <button
            v-if="record.canDownload"
            type="button"
            :disabled="Boolean(downloadingReportId)"
            @click="downloadRecord(record)"
          >
            {{ downloadingReportId === record.reportId ? '下载中' : '下载' }}
          </button>
          <button
            v-if="record.canDelete"
            type="button"
            class="report-card__delete"
            :disabled="Boolean(deletingReportId) || Boolean(downloadingReportId)"
            @click="deleteRecord(record)"
          >
            {{ deletingReportId === record.reportId ? '删除中' : '删除' }}
          </button>
          <button v-if="record.canOpenQa" type="button" @click="openQa(record)">去问答</button>
        </footer>
      </article>
    </section>
  </main>
</template>

<script setup>
defineOptions({ name: 'ReportCenterView' })

import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
  checkReportForSimulation,
  deleteReport,
  downloadReport,
  generateReport,
  listReports
} from '../api/report.js'
import { buildLogicalGraphProjects } from '../features/projects/logicalGraphProjectModel.js'
import {
  buildReportCenterRecordItems,
  formatReportDate
} from '../features/reports/reportCenterModel.js'
import { createReportCenterController } from '../features/reports/reportCenterController.js'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const monitor = useGraphTaskMonitor()
const router = useRouter()
const state = reactive({})
const controller = createReportCenterController({
  listReports,
  checkExistingReport: checkReportForSimulation,
  generateReport,
  downloadReport,
  deleteReport,
  getProjects: () => buildLogicalGraphProjects(monitor.state.items),
  openReport: ({ reportId, taskId }) => router.push({
    name: 'Report',
    params: { reportId },
    query: taskId ? { taskId } : {}
  }),
  browser: globalThis,
  onChange: nextState => Object.assign(state, nextState)
})
Object.assign(state, controller.state)

const loading = computed(() => state.loading)
const error = computed(() => state.error)
const actionError = computed(() => state.actionError)
const mutatingProjectId = computed(() => state.mutatingProjectId)
const downloadingReportId = computed(() => state.downloadingReportId)
const deletingReportId = computed(() => state.deletingReportId)
const records = computed(() => buildReportCenterRecordItems(state.records))

watch(() => monitor.state.items, () => controller.syncProjects(), { deep: true })

function refreshReports() {
  return controller.refresh()
}

function generateRecord(record) {
  return controller.generate(record).catch(() => undefined)
}

function downloadRecord(record) {
  return controller.download(record).catch(() => undefined)
}

function deleteRecord(record) {
  return controller.delete(record).catch(() => undefined)
}

function reportRoute(record) {
  return { name: 'Report', params: { reportId: record.reportId } }
}

function openQa(record) {
  return router.push({
    name: 'AscQa',
    query: { projectId: record.projectId, reportId: record.reportId }
  })
}

onMounted(refreshReports)
onBeforeUnmount(controller.stop)
</script>

<style scoped>
.report-center-view {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 38px clamp(22px, 4vw, 64px) 56px;
  background: var(--asc-canvas);
  color: var(--asc-heading);
}

.report-center-view__header {
  max-width: 1240px;
  margin: 0 auto 28px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.report-center-view__mark {
  display: inline-block;
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .14em;
}

.report-center-view__header h1 {
  margin: 8px 0 6px;
  font-size: clamp(28px, 3vw, 38px);
  letter-spacing: -.03em;
}

.report-center-view__header p {
  margin: 0;
  color: var(--asc-muted);
  line-height: 1.6;
}

.report-center-view__header button,
.report-center-view__state button,
.report-center-view__state a {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.report-center-view__header button:disabled {
  cursor: wait;
  opacity: .6;
}

.report-center-view__state {
  width: min(620px, 100%);
  box-sizing: border-box;
  margin: 80px auto 0;
  padding: 48px 36px;
  border: 1px solid var(--asc-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--asc-shadow);
  color: var(--asc-muted);
  text-align: center;
}

.report-center-view__state h2 {
  margin: 16px 0 10px;
  color: var(--asc-heading);
  font-size: 24px;
}

.report-center-view__state p {
  margin: 0;
  line-height: 1.7;
}

.report-center-view__state button,
.report-center-view__state a {
  display: inline-flex;
  align-items: center;
  margin-top: 22px;
  background: var(--asc-primary);
  color: #fff;
}

.report-center-view__state--error {
  border-color: #f0c5bf;
  background: #fffafa;
}

.report-center-view__state-code {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .12em;
}

.report-center-view__spinner {
  width: 28px;
  height: 28px;
  display: inline-block;
  border: 3px solid var(--asc-primary-soft);
  border-top-color: var(--asc-primary);
  border-radius: 50%;
  animation: report-center-spin .85s linear infinite;
}

.report-center-view__grid {
  max-width: 1240px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: 18px;
}

.report-card {
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 24px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 70, 101, .06);
  transition: transform var(--asc-transition), border-color var(--asc-transition), box-shadow var(--asc-transition);
}

.report-card:hover,
.report-card:focus-within {
  transform: translateY(-2px);
  border-color: #86b8da;
  box-shadow: 0 14px 32px rgba(31, 70, 101, .12);
}

.report-card__header,
.report-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.report-card__project {
  min-width: 0;
  overflow: hidden;
  color: var(--asc-primary);
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card__status {
  flex: none;
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef2f5;
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 800;
}

.report-card__status--completed {
  background: #e9f7f0;
  color: #147553;
}

.report-card__status--generating {
  background: #fff1e9;
  color: #b45324;
}

.report-card__status--failed {
  background: #fff0ef;
  color: #a8322a;
}

.report-card__status--ready {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
}

.report-card h2 {
  margin: 20px 0 10px;
  font-size: 20px;
  line-height: 1.45;
}

.report-card__summary {
  min-height: 48px;
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--asc-muted);
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.report-card__topic {
  margin: 0 0 8px;
  color: var(--asc-heading);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.report-card__summary--muted {
  opacity: .7;
}

.report-card__meta {
  margin: 22px 0 0;
  display: grid;
  gap: 10px;
}

.report-card__meta div {
  min-width: 0;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
}

.report-card__meta dt {
  color: var(--asc-muted);
  font-size: 12px;
}

.report-card__meta dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card__error {
  margin: 14px 0 0;
  color: #a8322a;
  font-size: 12px;
  line-height: 1.5;
}

.report-card footer {
  margin-top: auto;
  padding-top: 22px;
  color: var(--asc-primary);
  font-size: 13px;
  font-weight: 800;
}

.report-card__actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.report-card__actions button,
.report-card__actions a {
  min-height: 34px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.report-card__actions button:disabled {
  cursor: wait;
  opacity: .6;
}

.report-card__actions .report-card__delete {
  border-color: #efc6c2;
  color: #b42318;
}

.report-center-view__action-error {
  max-width: 1240px;
  margin: 0 auto 18px;
  color: #a8322a;
  font-size: 13px;
  font-weight: 700;
}

@keyframes report-center-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .report-center-view {
    padding: 24px 16px 42px;
  }

  .report-center-view__header {
    align-items: flex-start;
  }

  .report-center-view__header button {
    flex: none;
  }

  .report-center-view__state {
    margin-top: 44px;
    padding: 38px 22px;
  }

  .report-card {
    padding: 20px;
  }
}
</style>
