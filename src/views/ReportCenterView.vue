<template>
  <main class="report-center-view" aria-labelledby="report-center-title">
    <header class="report-center-view__header">
      <div>
        <span class="report-center-view__mark">REPORT CENTER</span>
        <h1 id="report-center-title">报告生成</h1>
        <p>查看后端已保存的研究报告，并继续跟踪仍在生成的报告。</p>
      </div>
      <button type="button" :disabled="loading" @click="loadReports">
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
      <button type="button" @click="loadReports">重新加载</button>
    </section>

    <section v-else-if="!items.length" class="report-center-view__state">
      <span class="report-center-view__state-code">NO REPORT</span>
      <h2>尚无报告</h2>
      <p>请先完成图谱演化，再生成并查看对应的研究报告。</p>
      <router-link to="/process">前往图谱演化</router-link>
    </section>

    <section v-else class="report-center-view__grid" aria-label="已保存的研究报告">
      <router-link
        v-for="item in items"
        :key="item.reportId"
        class="report-card"
        :to="{ name: 'Report', params: { reportId: item.reportId } }"
      >
        <article>
          <header class="report-card__header">
            <span class="report-card__project">{{ item.projectName }}</span>
            <span class="report-card__status" :class="`report-card__status--${item.status}`">
              {{ item.statusLabel }}
            </span>
          </header>

          <h2>{{ item.title }}</h2>
          <p v-if="item.subtitle" class="report-card__summary">{{ item.subtitle }}</p>
          <p v-else class="report-card__summary report-card__summary--muted">暂无报告简介</p>

          <dl class="report-card__meta">
            <div>
              <dt>报告 ID</dt>
              <dd>{{ item.reportId }}</dd>
            </div>
            <div>
              <dt>{{ item.completedAt ? '完成时间' : '创建时间' }}</dt>
              <dd>{{ formatReportDate(item.completedAt || item.createdAt) }}</dd>
            </div>
          </dl>

          <p v-if="item.status === 'failed' && item.error" class="report-card__error">
            {{ item.error }}
          </p>

          <footer>
            <span>{{ item.status === 'generating' ? '查看生成进度' : '查看报告' }}</span>
            <span aria-hidden="true">→</span>
          </footer>
        </article>
      </router-link>
    </section>
  </main>
</template>

<script setup>
defineOptions({ name: 'ReportCenterView' })

import { computed, onMounted, ref } from 'vue'

import { listReports } from '../api/report.js'
import { buildLogicalGraphProjects } from '../features/projects/logicalGraphProjectModel.js'
import {
  buildReportCenterItems,
  formatReportDate,
  unwrapReports
} from '../features/reports/reportCenterModel.js'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const monitor = useGraphTaskMonitor()
const reports = ref([])
const loading = ref(true)
const error = ref('')
const projects = computed(() => buildLogicalGraphProjects(monitor.state.items))
const items = computed(() => buildReportCenterItems(reports.value, projects.value))

async function loadReports() {
  loading.value = true
  error.value = ''
  try {
    const response = await listReports({ limit: 50 })
    reports.value = unwrapReports(response)
  } catch (requestError) {
    error.value = requestError?.message || '报告列表加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(loadReports)
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
  color: inherit;
  text-decoration: none;
}

.report-card article {
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

.report-card:hover article,
.report-card:focus-visible article {
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

  .report-card article {
    padding: 20px;
  }
}
</style>
