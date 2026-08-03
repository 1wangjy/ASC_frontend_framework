<template>
  <main class="graph-explorer-page">
    <header class="explorer-header">
      <div>
        <h1>ASC 知识图谱工作区</h1>
        <p>搜索节点并精准导航材料、物相、性能和服役关系</p>
      </div>
      <router-link to="/knowledge">
        <AscIcon class="back-icon" name="chevron" />
        返回图谱入口
      </router-link>
    </header>

    <section class="explorer-workspace">
      <GraphNodeSearch :nodes="graphNodes" @select="focusNode" />
      <GraphCanvas
        :nodes="graphNodes"
        :edges="graphEdges"
        :state="graphState"
        @focus="focusNode"
        @reset="resetView"
      />
    </section>
  </main>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import AscIcon from '../components/ui/AscIcon.vue'
import GraphNodeSearch from '../features/knowledge/GraphNodeSearch.vue'
import GraphCanvas from '../features/knowledge/GraphCanvas.vue'
import { graphEdges, graphNodes } from '../features/knowledge/graphExplorerData.js'
import {
  createGraphExplorerState,
  focusGraphNode
} from '../features/knowledge/graphExplorerModel.js'

const graphState = ref(createGraphExplorerState())
let noticeTimer = null

function focusNode(nodeId) {
  graphState.value = focusGraphNode(
    graphState.value,
    graphNodes,
    graphEdges,
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

@media (max-width: 760px) {
  .graph-explorer-page {
    min-height: calc(100vh - 56px);
  }

  .explorer-header {
    align-items: flex-start;
    padding: 15px 14px;
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
