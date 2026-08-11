<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <AscSidebar
      :mobile-open="mobileNavOpen"
      :collapsed="sidebarCollapsed"
      @close="mobileNavOpen = false"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />

    <button
      v-if="mobileNavOpen"
      class="nav-scrim"
      type="button"
      aria-label="关闭导航"
      @click="mobileNavOpen = false"
    />

    <div class="app-shell__body">
      <header class="mobile-header">
        <button type="button" aria-label="打开导航" @click="mobileNavOpen = true">
          <AscIcon name="menu" />
        </button>
        <span class="mobile-header__mark">ASC</span>
        <strong>{{ route.meta.title || 'ASC LAB' }}</strong>
      </header>
      <div
        class="app-shell__route-frame"
        :class="{ 'app-shell__route-frame--graph': isGraphWorkflowRoute }"
      >
        <GraphProjectWorkspacePanel v-if="isGraphWorkflowRoute" />
        <div class="app-shell__route-content">
          <slot />
        </div>
      </div>
    </div>

    <GlobalGraphTaskIndicator
      :items="logicalGraphProjects"
      :connection="monitor.state.connection"
      :last-synced-at="monitor.state.lastSyncedAt"
      @refresh="monitor.refresh"
      @view-project="viewProject"
      @open-qa="openProjectQa"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AscSidebar from '../components/navigation/AscSidebar.vue'
import AscIcon from '../components/ui/AscIcon.vue'
import GraphProjectWorkspacePanel from '../features/projects/GraphProjectWorkspacePanel.vue'
import GlobalGraphTaskIndicator from '../features/tasks/GlobalGraphTaskIndicator.vue'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'
import { navigateGraphProjectToQa } from '../features/projects/graphQaNavigation.js'
import { buildLogicalGraphProjects } from '../features/projects/logicalGraphProjectModel.js'
import { useGraphWorkflowSession } from '../features/navigation/graphWorkflowSession.js'

const route = useRoute()
const router = useRouter()
const monitor = useGraphTaskMonitor()
const workflowSession = useGraphWorkflowSession()
const mobileNavOpen = ref(false)
const sidebarCollapsed = ref(false)
const isGraphWorkflowRoute = computed(() => route.meta.navigationPath === '/process')
const logicalGraphProjects = computed(() => buildLogicalGraphProjects(monitor.state.items))

function viewProject(projectId) {
  if (!projectId) return
  const logicalProject = logicalGraphProjects.value.find(item => (
    item.projectId === projectId || item.memberProjectIds?.includes(projectId)
  ))
  const resumeRoute = workflowSession.resolve(logicalProject?.memberProjectIds || [projectId])
  if (resumeRoute) {
    if (route.fullPath !== resumeRoute) router.push(resumeRoute)
    return
  }
  router.push({ name: 'Process', params: { projectId } })
}

async function openProjectQa(item) {
  await navigateGraphProjectToQa({
    project: { project_id: item.projectId, graph_id: item.graphId },
    browser: globalThis,
    navigate: qaRoute => router.push(qaRoute)
  })
}

onMounted(monitor.start)
onUnmounted(monitor.stop)
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell__body {
  min-height: 100vh;
  margin-left: var(--asc-sidebar-width);
  transition: margin-left var(--asc-transition);
}

.app-shell--sidebar-collapsed .app-shell__body {
  margin-left: var(--asc-sidebar-collapsed-width);
}

.app-shell__route-frame {
  min-width: 0;
  min-height: 100vh;
}

.app-shell__route-frame--graph {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  background: var(--asc-canvas);
}

.app-shell__route-content {
  min-width: 0;
  overflow: hidden;
}

.mobile-header {
  display: none;
}

.nav-scrim {
  position: fixed;
  z-index: 35;
  inset: 0;
  border: 0;
  background: rgba(4, 28, 49, 0.45);
}

@media (max-width: 760px) {
  .app-shell__body {
    margin-left: 0;
    padding-top: 56px;
  }

  .app-shell--sidebar-collapsed .app-shell__body {
    margin-left: 0;
  }

  .mobile-header {
    position: fixed;
    z-index: 30;
    inset: 0 0 auto;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 14px;
    border-bottom: 1px solid var(--asc-border);
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
  }

  .mobile-header button {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: var(--asc-primary-soft);
    color: var(--asc-primary);
    font-size: 21px;
  }

  .mobile-header__mark {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--asc-primary);
    color: #fff;
    font-size: 11px;
    font-weight: 900;
  }

  .mobile-header strong {
    color: var(--asc-heading);
    font-size: 14px;
  }
}

@media (max-width: 980px) {
  .app-shell__route-frame--graph {
    grid-template-columns: 1fr;
  }
}
</style>
