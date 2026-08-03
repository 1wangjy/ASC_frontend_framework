<template>
  <section ref="canvasShell" class="canvas-shell">
    <header class="canvas-tools">
      <span>节点 {{ nodes.length }} · 关系 {{ edges.length }}</span>
      <div>
        <button type="button" @click="$emit('reset')">
          <AscIcon name="refresh" />
          重置视图
        </button>
        <button type="button" @click="toggleFullscreen">
          <AscIcon name="expand" />
          {{ fullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </header>

    <div class="canvas-stage">
      <svg class="graph-svg" viewBox="0 0 760 520" aria-label="ASC 耐火材料知识图谱">
        <g
          class="graph-world"
          :style="{ transform: `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})` }"
        >
          <line
            v-for="edge in edges"
            :key="edge.edgeId"
            :x1="nodeById.get(edge.source).x"
            :y1="nodeById.get(edge.source).y"
            :x2="nodeById.get(edge.target).x"
            :y2="nodeById.get(edge.target).y"
            class="graph-edge"
            :class="{
              'graph-edge--active': state.highlightedEdgeIds.includes(edge.edgeId),
              'graph-edge--dimmed': state.focusedNodeId && !state.highlightedEdgeIds.includes(edge.edgeId)
            }"
          />

          <g
            v-for="node in nodes"
            :key="node.nodeId"
            class="graph-node"
            :class="{
              'graph-node--focused': state.focusedNodeId === node.nodeId,
              'graph-node--dimmed': state.focusedNodeId && !state.highlightedNodeIds.includes(node.nodeId)
            }"
            :transform="`translate(${node.x} ${node.y})`"
            role="button"
            tabindex="0"
            :aria-label="`定位节点 ${node.label}`"
            @click="$emit('focus', node.nodeId)"
            @keydown.enter="$emit('focus', node.nodeId)"
          >
            <circle v-if="state.focusedNodeId === node.nodeId" class="focus-ring" r="34" />
            <circle class="node-disc" r="24" :fill="nodeFill(node.type)" />
            <text text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
          </g>
        </g>
      </svg>

      <aside v-if="focusedNode" class="node-details">
        <span>{{ focusedNode.type }}</span>
        <h3>{{ focusedNode.label }}</h3>
        <dl>
          <div><dt>节点 ID</dt><dd>{{ focusedNode.nodeId }}</dd></div>
          <div><dt>别名</dt><dd>{{ focusedNode.aliases.join('、') }}</dd></div>
          <div><dt>关联关系</dt><dd>{{ focusedNode.relationshipCount }}</dd></div>
          <div><dt>证据文献</dt><dd>{{ focusedNode.evidenceCount }} 篇</dd></div>
        </dl>
      </aside>

      <transition name="focus-notice">
        <div v-if="state.focusNotice" class="focus-notice" role="status">
          {{ state.focusNotice }} · 画布已居中并高亮关联路径
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  nodes: {
    type: Array,
    required: true
  },
  edges: {
    type: Array,
    required: true
  },
  state: {
    type: Object,
    required: true
  }
})

defineEmits(['reset', 'focus'])

const canvasShell = ref(null)
const fullscreen = ref(false)
const nodeById = computed(() => new Map(props.nodes.map(node => [node.nodeId, node])))
const focusedNode = computed(() => nodeById.value.get(props.state.focusedNodeId) ?? null)

const nodeColors = {
  原料: '#0f78b6',
  物相: '#287ba5',
  反应: '#3f8a9d',
  性能: '#2b86c1',
  机理: '#4d7898',
  工艺: '#397aa8'
}

function nodeFill(type) {
  return nodeColors[type] ?? '#397aa8'
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await canvasShell.value?.requestFullscreen?.()
  } else {
    await document.exitFullscreen?.()
  }
}

function syncFullscreen() {
  fullscreen.value = document.fullscreenElement === canvasShell.value
}

onMounted(() => document.addEventListener('fullscreenchange', syncFullscreen))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncFullscreen))
</script>

<style scoped>
.canvas-shell {
  height: calc(100vh - 186px);
  min-height: 0;
  display: grid;
  grid-template-rows: 47px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: #fff;
}

.canvas-shell:fullscreen {
  width: 100vw;
  height: 100vh;
  border: 0;
  border-radius: 0;
}

.canvas-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid var(--asc-border);
  background: #fff;
}

.canvas-tools > span {
  color: var(--asc-muted);
  font-size: 10px;
}

.canvas-tools > div {
  display: flex;
  gap: 6px;
}

.canvas-tools button {
  min-height: 31px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: #fff;
  color: var(--asc-text);
  font-size: 9px;
  font-weight: 700;
}

.canvas-tools button:hover {
  border-color: #89bad6;
  color: var(--asc-primary);
}

.canvas-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #f3f8fb;
}

.graph-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: block;
}

.graph-world {
  transform-box: fill-box;
  transform-origin: 0 0;
  transition: transform 420ms cubic-bezier(0.2, 0.75, 0.25, 1);
}

.graph-edge {
  stroke: #a9c2d1;
  stroke-width: 1.5;
  transition: opacity var(--asc-transition), stroke var(--asc-transition), stroke-width var(--asc-transition);
}

.graph-edge--active {
  stroke: #3497c8;
  stroke-width: 2.4;
}

.graph-edge--dimmed {
  opacity: 0.14;
}

.graph-node {
  cursor: pointer;
  color: #fff;
  transition: opacity var(--asc-transition);
}

.graph-node:focus-visible {
  outline: none;
}

.graph-node:focus-visible .node-disc {
  stroke-width: 4;
}

.node-disc {
  stroke: #fff;
  stroke-width: 2;
  filter: drop-shadow(0 4px 7px rgba(17, 75, 109, 0.15));
}

.graph-node text {
  fill: #fff;
  font-size: 9px;
  font-weight: 800;
  pointer-events: none;
}

.focus-ring {
  fill: none;
  stroke: #5fc4ee;
  stroke-width: 7;
  opacity: 0.38;
}

.graph-node--dimmed {
  opacity: 0.19;
}

.node-details {
  position: absolute;
  z-index: 3;
  top: 14px;
  right: 14px;
  width: 210px;
  padding: 15px;
  border: 1px solid #c9dce7;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 12px 28px rgba(22, 62, 88, 0.13);
}

.node-details > span {
  display: inline-block;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 8px;
  font-weight: 800;
}

.node-details h3 {
  margin: 8px 0 13px;
  color: var(--asc-heading);
  font-size: 15px;
}

.node-details dl {
  display: grid;
  gap: 9px;
  margin: 0;
}

.node-details dl div {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 7px;
}

.node-details dt,
.node-details dd {
  margin: 0;
  font-size: 9px;
  line-height: 1.45;
}

.node-details dt {
  color: var(--asc-muted);
}

.node-details dd {
  overflow-wrap: anywhere;
  color: var(--asc-text);
}

.focus-notice {
  position: absolute;
  z-index: 4;
  left: 14px;
  bottom: 14px;
  padding: 8px 10px;
  border-radius: 7px;
  background: rgba(9, 62, 95, 0.9);
  color: #fff;
  font-size: 9px;
}

.focus-notice-enter-active,
.focus-notice-leave-active {
  transition: opacity var(--asc-transition), transform var(--asc-transition);
}

.focus-notice-enter-from,
.focus-notice-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 760px) {
  .canvas-shell {
    height: auto;
  }

  .canvas-stage {
    display: flex;
    min-height: 620px;
    flex-direction: column;
  }

  .graph-svg {
    min-height: 430px;
  }

  .node-details {
    position: static;
    width: auto;
    margin: 0 10px 10px;
    box-shadow: none;
  }

  .focus-notice {
    right: 10px;
    bottom: 11px;
  }
}
</style>
