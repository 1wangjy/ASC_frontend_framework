<template>
  <main class="graph-workspace">
    <aside class="graph-workspace__projects">
      <header class="graph-workspace__header">
        <div>
          <h1>知识图谱项目</h1>
          <p>选择项目查看 NEXUS 构建流程</p>
        </div>
        <button type="button" :disabled="monitor.state.connection === 'connecting'" @click="monitor.refresh">
          刷新
        </button>
      </header>

      <p v-if="workspaceError" class="graph-workspace__error" role="alert">{{ workspaceError }}</p>
      <p v-else-if="monitor.state.connection === 'offline'" class="graph-workspace__error" role="status">
        无法连接后端，当前显示上次同步结果。
      </p>

      <GraphProjectList
        :items="monitor.state.items"
        :selected-project-id="selectedProjectId"
        :deleting-project-id="deletingProjectId"
        @select="selectProject"
        @open-qa="openProjectQa"
        @delete="removeProject"
      />
    </aside>

    <section class="graph-workspace__flow">
      <MainView v-if="selectedProjectId" :key="selectedProjectId" />
      <div v-else class="graph-workspace__blank">
        <span class="graph-workspace__mark">NEXUS</span>
        <h2>选择一个知识图谱项目</h2>
        <p>左侧选择项目即可查看对应的构建步骤、实时进度和图谱结果。</p>
        <router-link to="/documents">从文献管理开始构建</router-link>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { deleteGraph, deleteGraphProject } from '../api/graph.js'
import GraphProjectList from '../features/projects/GraphProjectList.vue'
import {
  deleteGraphProjectResources,
  projectDeletionMessage
} from '../features/projects/graphProjectWorkspaceModel.js'
import { navigateGraphProjectToQa } from '../features/projects/graphQaNavigation.js'
import {
  getBrowserStorage,
  readActiveProjectId,
  rememberActiveProjectId
} from '../features/projects/projectContextModel.js'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'
import MainView from './MainView.vue'

const route = useRoute()
const router = useRouter()
const monitor = useGraphTaskMonitor()
const browserStorage = getBrowserStorage(globalThis)
const deletingProjectId = ref('')
const workspaceError = ref('')
const selectedProjectId = computed(() => String(route.params.projectId || '').trim())

function selectProject(item) {
  router.push({ name: 'Process', params: { projectId: item.projectId } })
}

async function openProjectQa(item) {
  await navigateGraphProjectToQa({
    project: { project_id: item.projectId, graph_id: item.graphId },
    browser: globalThis,
    navigate: target => router.push(target)
  })
}

async function removeProject(item) {
  if (!globalThis.confirm?.(projectDeletionMessage(item))) return

  deletingProjectId.value = item.projectId
  workspaceError.value = ''
  try {
    await deleteGraphProjectResources({ deleteGraph, deleteGraphProject }, item)
    if (readActiveProjectId(browserStorage) === item.projectId) {
      rememberActiveProjectId(browserStorage, '')
    }
    if (selectedProjectId.value === item.projectId) {
      await router.replace({ name: 'Process' })
    }
    await monitor.refresh()
  } catch (error) {
    workspaceError.value = error?.message || '删除图谱项目失败。'
  } finally {
    deletingProjectId.value = ''
  }
}
</script>

<style scoped>
.graph-workspace { min-height: 100vh; display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); background: var(--asc-canvas); }
.graph-workspace__projects { position: sticky; top: 0; height: 100vh; box-sizing: border-box; padding: 22px 16px; overflow-y: auto; border-right: 1px solid var(--asc-border); background: #f8fbfd; }
.graph-workspace__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.graph-workspace__header h1 { margin: 0; color: var(--asc-heading); font-size: 19px; }
.graph-workspace__header p { margin: 5px 0 0; color: var(--asc-muted); font-size: 12px; }
.graph-workspace__header button { padding: 6px 9px; border: 1px solid var(--asc-border); border-radius: 6px; background: #fff; color: var(--asc-primary); font: inherit; cursor: pointer; }
.graph-workspace__error { margin: 0 0 12px; padding: 9px 10px; border-radius: 7px; background: #fff1ef; color: #9c352d; font-size: 12px; line-height: 1.5; }
.graph-workspace__flow { min-width: 0; overflow: hidden; }
.graph-workspace__blank { min-height: 70vh; display: grid; place-content: center; justify-items: center; padding: 40px; color: var(--asc-muted); text-align: center; }
.graph-workspace__mark { padding: 5px 9px; border-radius: 999px; background: var(--asc-primary-soft); color: var(--asc-primary); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.graph-workspace__blank h2 { margin: 18px 0 8px; color: var(--asc-heading); }
.graph-workspace__blank p { max-width: 460px; margin: 0; line-height: 1.7; }
.graph-workspace__blank a { margin-top: 20px; padding: 9px 14px; border-radius: 7px; background: var(--asc-primary); color: #fff; font-weight: 700; }

@media (max-width: 980px) {
  .graph-workspace { grid-template-columns: 1fr; }
  .graph-workspace__projects { position: static; width: 100%; height: auto; max-height: 42vh; border-right: 0; border-bottom: 1px solid var(--asc-border); }
}
</style>
