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
      <slot />
    </div>

    <GlobalGraphTaskIndicator
      :items="monitor.state.items"
      :connection="monitor.state.connection"
      :last-synced-at="monitor.state.lastSyncedAt"
      @refresh="monitor.refresh"
      @view-project="viewProject"
      @open-qa="openProjectQa"
      @open-qa-home="openQaHome"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AscSidebar from '../components/navigation/AscSidebar.vue'
import AscIcon from '../components/ui/AscIcon.vue'
import GlobalGraphTaskIndicator from '../features/tasks/GlobalGraphTaskIndicator.vue'
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'
import { navigateGraphProjectToQa } from '../features/projects/graphQaNavigation.js'

const route = useRoute()
const router = useRouter()
const monitor = useGraphTaskMonitor()
const mobileNavOpen = ref(false)
const sidebarCollapsed = ref(false)

function viewProject(projectId) {
  if (!projectId) return
  router.push({ name: 'Process', params: { projectId } })
}

function openQaHome() {
  router.push({ name: 'AscQa' })
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
</style>
