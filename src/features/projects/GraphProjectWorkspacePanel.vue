<template>
  <aside class="graph-project-panel">
    <header class="graph-project-panel__header">
      <div>
        <h1>知识图谱项目</h1>
        <p>选择项目查看 NEXUS 完整流程</p>
      </div>
      <button type="button" :disabled="monitor.state.connection === 'connecting'" @click="monitor.refresh">
        刷新
      </button>
    </header>

    <p v-if="workspaceError" class="graph-project-panel__error" role="alert">{{ workspaceError }}</p>
    <p v-else-if="monitor.state.connection === 'offline'" class="graph-project-panel__error" role="status">
      无法连接后端，当前显示上次同步结果。
    </p>

    <GraphProjectList
      :items="logicalProjects"
      :selected-project-id="selectedProjectId"
      :deleting-project-id="deletingProjectId"
      @select="selectProject"
      @delete="requestProjectDeletion"
    />

    <GraphProjectDeleteDialog
      v-if="pendingDeleteProject"
      :project="pendingDeleteProject"
      :deleting="Boolean(deletingProjectId)"
      @cancel="cancelProjectDeletion"
      @confirm="confirmProjectDeletion"
    />
  </aside>
</template>

<script setup>
defineOptions({ name: 'GraphProjectWorkspacePanel' })

import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { deleteGraph, deleteGraphProject } from '../../api/graph.js'
import { useGraphWorkflowSession } from '../navigation/graphWorkflowSession.js'
import { useGraphTaskMonitor } from '../tasks/graphTaskMonitor.js'
import GraphProjectDeleteDialog from './GraphProjectDeleteDialog.vue'
import GraphProjectList from './GraphProjectList.vue'
import { deleteLogicalGraphProjectResources } from './graphProjectWorkspaceModel.js'
import { buildLogicalGraphProjects } from './logicalGraphProjectModel.js'
import {
  getBrowserStorage,
  readActiveProjectId,
  rememberActiveProjectId
} from './projectContextModel.js'

const route = useRoute()
const router = useRouter()
const monitor = useGraphTaskMonitor()
const workflowSession = useGraphWorkflowSession()
const browserStorage = getBrowserStorage(globalThis)
const deletingProjectId = ref('')
const pendingDeleteProject = ref(null)
const workspaceError = ref('')
const selectedProjectId = ref(readActiveProjectId(browserStorage))
const logicalProjects = computed(() => buildLogicalGraphProjects(monitor.state.items))

function findLogicalProject(projectId) {
  return logicalProjects.value.find(item => (
    item.projectId === projectId || item.memberProjectIds?.includes(projectId)
  ))
}

function retainWorkflowContext() {
  if (route.name === 'Process') {
    selectedProjectId.value = String(route.params.projectId || '').trim()
    if (selectedProjectId.value && selectedProjectId.value !== 'new') {
      rememberActiveProjectId(browserStorage, selectedProjectId.value)
    }
    return
  }

  if (route.meta.navigationPath !== '/process') return
  const rememberedProjectId = selectedProjectId.value || readActiveProjectId(browserStorage)
  const logicalProject = findLogicalProject(rememberedProjectId)
  const projectIds = logicalProject?.memberProjectIds?.length
    ? logicalProject.memberProjectIds
    : [rememberedProjectId]
  if (!projectIds.some(Boolean)) return

  selectedProjectId.value = logicalProject?.projectId || rememberedProjectId
  workflowSession.remember({
    projectIds,
    simulationId: route.params.simulationId,
    reportId: route.params.reportId,
    route: route.fullPath
  })
}

retainWorkflowContext()
watch([() => route.fullPath, logicalProjects], retainWorkflowContext)

function selectProject(item) {
  rememberActiveProjectId(browserStorage, item.projectId)
  selectedProjectId.value = item.projectId
  const resumeRoute = workflowSession.resolve(item.memberProjectIds)
  if (resumeRoute) {
    if (route.fullPath !== resumeRoute) router.push(resumeRoute)
    return
  }
  if (route.name !== 'Process' || String(route.params.projectId || '') !== item.projectId) {
    router.push({ name: 'Process', params: { projectId: item.projectId } })
  }
}

function requestProjectDeletion(item) {
  if (deletingProjectId.value) return
  pendingDeleteProject.value = item
  workspaceError.value = ''
}

function cancelProjectDeletion() {
  if (!deletingProjectId.value) pendingDeleteProject.value = null
}

async function confirmProjectDeletion() {
  const item = pendingDeleteProject.value
  if (!item || deletingProjectId.value) return

  deletingProjectId.value = item.projectId
  workspaceError.value = ''
  try {
    await deleteLogicalGraphProjectResources({ deleteGraph, deleteGraphProject }, item)
    workflowSession.clear(item.memberProjectIds)
    if (item.memberProjectIds?.includes(readActiveProjectId(browserStorage))) {
      rememberActiveProjectId(browserStorage, '')
    }
    if (item.memberProjectIds?.includes(selectedProjectId.value)) {
      selectedProjectId.value = ''
      await router.replace({ name: 'Process' })
    }
    await monitor.refresh()
  } catch (error) {
    workspaceError.value = error?.message || '删除图谱项目失败。'
  } finally {
    deletingProjectId.value = ''
    pendingDeleteProject.value = null
  }
}
</script>

<style scoped>
.graph-project-panel {
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
  padding: 22px 16px;
  overflow-y: auto;
  border-right: 1px solid var(--asc-border);
  background: #f8fbfd;
}

.graph-project-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.graph-project-panel__header h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 19px;
}

.graph-project-panel__header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 12px;
}

.graph-project-panel__header button {
  padding: 6px 9px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  cursor: pointer;
}

.graph-project-panel__error {
  margin: 0 0 12px;
  padding: 9px 10px;
  border-radius: 7px;
  background: #fff1ef;
  color: #9c352d;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 980px) {
  .graph-project-panel {
    position: static;
    width: 100%;
    height: auto;
    max-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid var(--asc-border);
  }
}
</style>
