<template>
  <main class="graph-explorer-page">
    <header class="explorer-header">
      <div>
        <h1>ASC 知识图谱工作区</h1>
        <p>搜索节点并精准导航材料、物相、性能和服役关系</p>
      </div>
      <div class="explorer-header__actions">
        <label class="project-picker">
          <span>当前项目</span>
          <select
            v-model="activeProjectId"
            :disabled="loading || !projects.length"
            @change="changeProject"
          >
            <option v-if="!projects.length" value="">暂无可用图谱</option>
            <option
              v-for="project in projects"
              :key="project.project_id"
              :value="project.project_id"
            >
              {{ projectLabel(project) }}
            </option>
          </select>
        </label>
        <router-link to="/knowledge">
          <AscIcon class="back-icon" name="chevron" />
          返回图谱入口
        </router-link>
      </div>
    </header>

    <section class="explorer-workspace">
      <div v-if="loading" class="workspace-status" role="status">
        <strong>正在读取后端图谱数据…</strong>
        <span>正在加载项目列表和节点关系。</span>
      </div>

      <div v-else-if="errorMessage" class="workspace-status workspace-status--error" role="alert">
        <strong>图谱数据加载失败</strong>
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadWorkspace">重试</button>
      </div>

      <div v-else-if="!projects.length" class="workspace-status">
        <strong>后端暂时没有可浏览的图谱项目</strong>
        <span>项目必须已经生成 graph_id 才能在这里显示。</span>
        <button type="button" @click="loadWorkspace">重新检查</button>
      </div>

      <div v-else-if="!graphNodes.length" class="workspace-status">
        <strong>当前项目的图谱还是空的</strong>
        <span>项目已存在，但后端尚未返回节点和关系数据。</span>
        <button type="button" @click="changeProject">重新加载</button>
      </div>

      <template v-else>
        <GraphNodeSearch :nodes="graphNodes" @select="focusNode" />
        <GraphCanvas
          :nodes="graphNodes"
          :edges="graphEdges"
          :state="graphState"
          @focus="focusNode"
          @reset="resetView"
        />
      </template>
    </section>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AscIcon from '../components/ui/AscIcon.vue'
import GraphNodeSearch from '../features/knowledge/GraphNodeSearch.vue'
import GraphCanvas from '../features/knowledge/GraphCanvas.vue'
import { getGraphData, getProject } from '../api/graph.js'
import {
  createGraphExplorerState
} from '../features/knowledge/graphExplorerModel.js'
import {
  focusWorkspaceNode,
  loadGraphForProject
} from '../features/knowledge/graphWorkspaceService.js'
import {
  listGraphProjects,
  resolveActiveProject
} from '../features/projects/projectContextModel.js'
import {
  readActiveProjectId,
  rememberActiveProjectId
} from '../features/projects/projectContextModel.js'
import { getRegisteredProjectIds } from '../features/projects/projectRegistry.js'

const graphState = ref(createGraphExplorerState())
const graphNodes = ref([])
const graphEdges = ref([])
const projects = ref([])
const activeProjectId = ref('')
const loading = ref(true)
const errorMessage = ref('')
let noticeTimer = null

function projectLabel(project) {
  return project.project_name || project.name || project.project_id
}

function selectedProject() {
  return projects.value.find((project) => project.project_id === activeProjectId.value) ?? null
}

function applyGraph(graph) {
  graphNodes.value = graph.nodes
  graphEdges.value = graph.edges
  graphState.value = createGraphExplorerState()
}

async function loadWorkspace() {
  loading.value = true
  errorMessage.value = ''

  try {
    // 从 localStorage 读取已注册的 project_id，逐个用 getProject 获取
    const ids = getRegisteredProjectIds()
    const results = await Promise.allSettled(
      ids.map(id => getProject(id))
    )
    const fetched = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(Boolean)

    projects.value = listGraphProjects(fetched)
    const activeProject = resolveActiveProject(
      projects.value,
      readActiveProjectId(window.localStorage)
    )
    activeProjectId.value = activeProject?.project_id ?? ''
    rememberActiveProjectId(window.localStorage, activeProjectId.value)

    // 加载当前项目的图谱数据
    if (activeProject?.graph_id) {
      applyGraph(await loadGraphForProject(getGraphData, activeProject))
    } else {
      applyGraph({ nodes: [], edges: [] })
    }
  } catch (error) {
    projects.value = []
    activeProjectId.value = ''
    applyGraph({ nodes: [], edges: [] })
    errorMessage.value = error?.message || '无法连接到后端。'
  } finally {
    loading.value = false
  }
}

async function changeProject() {
  const project = selectedProject()
  if (!project) return

  loading.value = true
  errorMessage.value = ''
  rememberActiveProjectId(window.localStorage, project.project_id)

  try {
    applyGraph(await loadGraphForProject(getGraphData, project))
  } catch (error) {
    applyGraph({ nodes: [], edges: [] })
    errorMessage.value = error?.message || '当前项目的图谱数据加载失败。'
  } finally {
    loading.value = false
  }
}

function focusNode(nodeId) {
  graphState.value = focusWorkspaceNode(
    graphState.value,
    { nodes: graphNodes.value, edges: graphEdges.value },
    nodeId,
    { width: 760, height: 520, scale: 1.2 }
  )

  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    graphState.value = { ...graphState.value, focusNotice: '' }
  }, 2800)
}

function resetView() {
  window.clearTimeout(noticeTimer)
  graphState.value = createGraphExplorerState()
}

onMounted(loadWorkspace)
onBeforeUnmount(() => window.clearTimeout(noticeTimer))
</script>

<style scoped>
.graph-explorer-page {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--asc-bg);
}

.explorer-header {
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--asc-border);
  background: #fff;
}

.explorer-header h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 22px;
}

.explorer-header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

.explorer-header a {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 800;
}

.explorer-header__actions {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.project-picker {
  display: grid;
  gap: 4px;
  color: var(--asc-muted);
  font-size: 9px;
  font-weight: 700;
}

.project-picker select {
  min-width: 190px;
  height: 36px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  color: var(--asc-heading);
  font: inherit;
}

.back-icon {
  transform: rotate(180deg);
}

.explorer-workspace {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  padding: 16px 20px 22px;
}

.workspace-status {
  min-height: 260px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 30px;
  border: 1px dashed #b9cfdb;
  border-radius: 10px;
  background: #fff;
  color: var(--asc-muted);
  text-align: center;
}

.workspace-status strong {
  color: var(--asc-heading);
  font-size: 14px;
}

.workspace-status span {
  font-size: 10px;
}

.workspace-status button {
  min-height: 34px;
  margin-top: 5px;
  padding: 0 13px;
  border: 0;
  border-radius: 7px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}

.workspace-status--error {
  border-color: #efb7b2;
  background: #fff9f8;
}

@media (max-width: 760px) {
  .graph-explorer-page {
    min-height: calc(100vh - 56px);
  }

  .explorer-header {
    align-items: flex-start;
    padding: 15px 14px;
  }

  .explorer-header__actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .project-picker select {
    min-width: 150px;
    max-width: 180px;
  }

  .explorer-header h1 {
    font-size: 18px;
  }

  .explorer-header p {
    max-width: 220px;
  }

  .explorer-header a {
    padding-inline: 8px;
    white-space: nowrap;
  }

  .explorer-workspace {
    padding: 12px;
  }
}
</style>
