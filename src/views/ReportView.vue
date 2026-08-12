<template>
  <main class="report-view">
    <header class="report-view__toolbar">
      <button type="button" @click="router.push('/reports')">
        <span aria-hidden="true">←</span>
        报告列表
      </button>
      <span>REPORT DETAIL</span>
    </header>

    <ReportActions
      :report-id="ownedReportId"
      :project-id="projectId"
      :project-name="projectName"
      :status="readerState.status"
      @download="downloadCurrentReport"
      @open-qa="openQa"
    />
    <p v-if="actionError" class="report-view__error" role="alert">
      {{ actionError }}
    </p>
    <ReportReader
      :report-id="ownedReportId"
      :task-id="reportTaskId"
      :project-name="projectName"
      @report-state="handleReportState"
    />
  </main>
</template>

<script setup>
defineOptions({ name: 'ReportView' })

import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getProject } from '../api/graph.js'
import * as reportApi from '../api/report.js'
import { getSimulation } from '../api/simulation.js'
import ReportReader from '../components/ReportReader.vue'
import { buildLogicalGraphProjects } from '../features/projects/logicalGraphProjectModel.js'
import ReportActions from '../features/reports/ReportActions.vue'
import { saveReportDownload } from '../features/reports/reportDownload.js'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const props = defineProps({
  reportId: { type: String, default: '' }
})

const route = useRoute()
const router = useRouter()
const monitor = useGraphTaskMonitor()
const ownedReportId = String(props.reportId || route.params.reportId || '').trim()
const reportTaskId = String(route.query.taskId || '').trim()
const reportData = ref(null)
const fallbackProject = ref(null)
const associationError = ref('')
const actionError = ref('')
const readerState = ref({ report: null, status: 'unknown' })
let associationVersion = 0
let downloadPromise = null

const logicalProjects = computed(() => buildLogicalGraphProjects(monitor.state.items))
const matchedProject = computed(() => {
  const graphId = String(reportData.value?.graph_id || '').trim()
  const simulationId = String(reportData.value?.simulation_id || '').trim()
  return logicalProjects.value.find(project => (
    (graphId && String(project.graphId || project.graph_id || '').trim() === graphId)
    || (simulationId && String(project.simulationId || project.simulation_id || '').trim() === simulationId)
  )) || null
})
const projectName = computed(() => String(
  matchedProject.value?.name
  || matchedProject.value?.project_name
  || fallbackProject.value?.project_name
  || fallbackProject.value?.name
  || ''
).trim())
const projectId = computed(() => String(
  matchedProject.value?.projectId
  || matchedProject.value?.project_id
  || fallbackProject.value?.project_id
  || fallbackProject.value?.projectId
  || ''
).trim())
const ownsActiveRoute = computed(() => (
  route.name === 'Report'
  && String(route.params.reportId || '').trim() === ownedReportId
))

async function loadProjectAssociation() {
  if (!ownedReportId) return
  const version = ++associationVersion
  associationError.value = ''
  fallbackProject.value = null

  try {
    const reportResponse = await reportApi.getReport(ownedReportId)
    if (version !== associationVersion || !ownsActiveRoute.value) return
    if (reportResponse?.success !== true || !reportResponse?.data) return
    reportData.value = reportResponse.data

    if (matchedProject.value) return
    const simulationId = String(reportData.value.simulation_id || '').trim()
    if (!simulationId) return

    const simulationResponse = await getSimulation(simulationId)
    if (version !== associationVersion || !ownsActiveRoute.value) return
    const projectId = String(simulationResponse?.data?.project_id || '').trim()
    if (simulationResponse?.success !== true || !projectId) return

    const projectResponse = await getProject(projectId)
    if (version !== associationVersion || !ownsActiveRoute.value) return
    if (projectResponse?.success === true && projectResponse?.data) {
      fallbackProject.value = projectResponse.data
    }
  } catch (error) {
    if (version === associationVersion && ownsActiveRoute.value) {
      associationError.value = error?.message || '图谱项目名称读取失败'
    }
  }
}

function handleReportState(nextState) {
  readerState.value = {
    report: nextState?.report || null,
    status: String(nextState?.status || 'unknown').trim().toLowerCase()
  }
}

function downloadCurrentReport() {
  if (downloadPromise) return downloadPromise
  actionError.value = ''

  downloadPromise = saveReportDownload({
    reportId: ownedReportId,
    projectName: projectName.value,
    downloadReport: reportApi.downloadReport,
    browser: globalThis
  }).catch(error => {
    actionError.value = error?.message || '报告下载失败'
  }).finally(() => {
    downloadPromise = null
  })

  return downloadPromise
}

function openQa() {
  if (!projectId.value || !ownedReportId || readerState.value.status !== 'completed') return
  return router.push({
    name: 'AscQa',
    query: {
      projectId: projectId.value,
      reportId: ownedReportId
    }
  })
}

watch(ownsActiveRoute, active => {
  if (active && !reportData.value) loadProjectAssociation()
}, { immediate: true })
</script>

<style scoped>
.report-view {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 22px clamp(18px, 4vw, 54px) 64px;
  overflow-y: auto;
  background: var(--asc-canvas);
}

.report-view__toolbar {
  width: min(920px, 100%);
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.report-view__toolbar button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.report-view__toolbar > span {
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .14em;
}

.report-view__error {
  width: min(920px, 100%);
  box-sizing: border-box;
  margin: -8px auto 20px;
  padding: 12px 14px;
  border: 1px solid #f0c5bf;
  border-radius: 10px;
  background: #fffafa;
  color: #a8322a;
  line-height: 1.5;
}

@media (max-width: 760px) {
  .report-view {
    padding: 16px 12px 42px;
  }
}
</style>
