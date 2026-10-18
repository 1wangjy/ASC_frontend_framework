<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--sidebar-collapsed': sidebarCollapsed,
      'app-shell--landing': isLandingRoute
    }"
  >
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
        :class="{
          'app-shell__route-frame--graph': isGraphWorkflowRoute,
          'app-shell__route-frame--project-panel-collapsed': isGraphWorkflowRoute && graphProjectPanelCollapsed
        }"
      >
        <GraphProjectWorkspacePanel
          v-if="isGraphWorkflowRoute && !graphProjectPanelCollapsed"
          @collapse="graphProjectPanelCollapsed = true"
        />
        <div v-else-if="isGraphWorkflowRoute" class="project-panel-rail">
          <button
            type="button"
            class="project-panel-rail__open"
            aria-label="打开项目栏"
            data-tooltip="打开项目栏"
            @click="graphProjectPanelCollapsed = false"
          >
            <span aria-hidden="true" class="project-panel-rail__icon"><i /><i /></span>
          </button>
        </div>
        <div class="app-shell__route-content">
          <slot />
        </div>
      </div>
      <footer class="app-shell__footer">
        <span>@Copyright 2026 金隅集团 · 北京金隅通达耐火技术有限公司 &amp; 中关村人工智能研究院</span>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import AscSidebar from '../components/navigation/AscSidebar.vue'
import AscIcon from '../components/ui/AscIcon.vue'
import GraphProjectWorkspacePanel from '../features/projects/GraphProjectWorkspacePanel.vue'

const route = useRoute()
const mobileNavOpen = ref(false)
const sidebarCollapsed = ref(false)
const graphProjectPanelCollapsed = ref(false)
const isGraphWorkflowRoute = computed(() => route.meta.navigationPath === '/process')
// 首页为整页一屏布局：取消 route-frame 的 100vh 下限，由页面自身按 100vh - 页脚 计算
const isLandingRoute = computed(() => route.name === 'AscHome')
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

.app-shell__footer {
  flex: 0 0 auto;
  min-height: var(--asc-footer-h);
  padding: 14px 24px 18px;
  text-align: center;
  color: var(--asc-muted);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.app-shell--sidebar-collapsed .app-shell__body {
  margin-left: var(--asc-sidebar-collapsed-width);
}

/* 首页：内容高度自管（100vh - 页脚），不被 route-frame 的 100vh 下限撑出滚动条 */
.app-shell--landing .app-shell__route-frame { min-height: 0; }

.app-shell__route-frame {
  min-width: 0;
  min-height: 100vh;
}

.app-shell__route-frame--graph {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  background: var(--asc-canvas);
}

.app-shell__route-frame--project-panel-collapsed {
  grid-template-columns: 44px minmax(0, 1fr);
}

.project-panel-rail {
  position: relative;
  min-height: 100vh;
  border-right: 1px solid var(--asc-border);
  background: #f8fbfd;
}

.project-panel-rail__open {
  position: sticky;
  top: 76px;
  display: grid;
  width: 34px;
  height: 34px;
  margin: 76px auto 0;
  place-items: center;
  padding: 0;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: #1d252c;
  cursor: pointer;
}

.project-panel-rail__open::after {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  z-index: 5;
  padding: 7px 10px;
  border-radius: 999px;
  background: #17191c;
  color: #fff;
  content: attr(data-tooltip);
  font-size: 12px;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  transform: translate(-4px, -50%);
  transition: opacity var(--asc-transition), transform var(--asc-transition);
  white-space: nowrap;
}

.project-panel-rail__open:hover::after,
.project-panel-rail__open:focus-visible::after { opacity: 1; transform: translate(0, -50%); }
.project-panel-rail__icon { display: flex; width: 15px; height: 13px; overflow: hidden; border: 1.5px solid currentColor; border-radius: 3px; }
.project-panel-rail__icon i:first-child { width: 5px; border-right: 1.5px solid currentColor; }
.project-panel-rail__icon i:last-child { flex: 1; }

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

  .app-shell__route-frame--project-panel-collapsed {
    grid-template-columns: 44px minmax(0, 1fr);
  }
}
</style>
