<template>
  <main class="graph-workspace-view">
    <MainView v-if="selectedProjectId" :key="selectedProjectId" />
    <div v-else class="graph-workspace-view__blank">
      <span class="graph-workspace-view__mark">NEXUS</span>
      <h2>选择一个知识图谱项目</h2>
      <p>从左侧项目表选择项目，即可查看对应的构建步骤、实时进度和图谱结果。</p>
      <router-link to="/documents">从文献管理开始构建</router-link>
    </div>
  </main>
</template>

<script setup>
defineOptions({ name: 'GraphProjectWorkspaceView' })

import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import MainView from './MainView.vue'

const route = useRoute()
const selectedProjectId = ref('')

function retainProcessProject() {
  if (route.name !== 'Process') return
  selectedProjectId.value = String(route.params.projectId || '').trim()
}

retainProcessProject()
watch(() => route.fullPath, retainProcessProject)
</script>

<style scoped>
.graph-workspace-view {
  min-width: 0;
  min-height: 100vh;
  overflow: hidden;
  background: var(--asc-canvas);
}

.graph-workspace-view__blank {
  min-height: 70vh;
  display: grid;
  place-content: center;
  justify-items: center;
  padding: 40px;
  color: var(--asc-muted);
  text-align: center;
}

.graph-workspace-view__mark {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
}

.graph-workspace-view__blank h2 {
  margin: 18px 0 8px;
  color: var(--asc-heading);
}

.graph-workspace-view__blank p {
  max-width: 460px;
  margin: 0;
  line-height: 1.7;
}

.graph-workspace-view__blank a {
  margin-top: 20px;
  padding: 9px 14px;
  border-radius: 7px;
  background: var(--asc-primary);
  color: #fff;
  font-weight: 700;
}
</style>
