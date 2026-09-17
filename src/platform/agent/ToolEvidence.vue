<template>
  <div v-if="evidence" class="agent-evidence">
    <div class="agent-evidence__head">
      <span v-if="evidence.countsLabel" class="agent-evidence__counts">{{ evidence.countsLabel }}</span>
      <a
        v-if="evidence.sourceUrl"
        class="agent-evidence__link"
        :href="evidence.sourceUrl"
        target="_blank"
        rel="noreferrer noopener"
      >打开来源 ↗</a>
    </div>

    <ul v-if="references.length" class="agent-evidence__refs">
      <li v-for="reference in references" :key="reference.id" class="agent-evidence__ref">
        <button
          type="button"
          class="agent-cite"
          :class="{ 'agent-cite--open': isOpen(reference.id) }"
          :aria-expanded="isOpen(reference.id)"
          :aria-controls="panelId(reference.id)"
          :title="reference.title"
          @click="toggle(reference.id)"
        >
          <span class="agent-cite__marker" aria-hidden="true">{{ isOpen(reference.id) ? '▾' : '▸' }}</span>
          <span class="agent-cite__label">{{ reference.title }}</span>
        </button>

        <div
          v-if="isOpen(reference.id)"
          :id="panelId(reference.id)"
          class="agent-cite__panel"
          role="region"
          :aria-label="`引用证据：${reference.title}`"
        >
          <blockquote class="agent-cite__quote">
            {{ reference.quote || '（后端未返回引文片段）' }}
          </blockquote>
          <p class="agent-cite__meta">
            <cite v-if="reference.source" class="agent-cite__source">{{ reference.source }}</cite>
            <a
              v-if="reference.href"
              class="agent-evidence__link"
              :href="reference.href"
              target="_blank"
              rel="noreferrer noopener"
            >打开来源 ↗</a>
          </p>
        </div>
      </li>
    </ul>

    <div v-if="graph" class="agent-graph">
      <button
        type="button"
        class="agent-cite agent-cite--graph"
        :class="{ 'agent-cite--open': graphOpen }"
        :aria-expanded="graphOpen"
        :aria-controls="graphPanelId"
        @click="graphOpen = !graphOpen"
      >
        <span class="agent-cite__marker" aria-hidden="true">{{ graphOpen ? '▾' : '▸' }}</span>
        <span class="agent-cite__label">图谱 {{ graphLabel }}</span>
      </button>

      <div
        v-if="graphOpen"
        :id="graphPanelId"
        class="agent-graph__panel"
        role="region"
        :aria-label="`图谱内容：${graphLabel}`"
      >
        <p class="agent-graph__counts">
          {{ graphCountsLabel }}
          <span v-if="graph.projectId" class="agent-graph__project">· 项目 {{ graph.projectId }}</span>
        </p>

        <ul v-if="graph.nodes.length" class="agent-graph__nodes">
          <li v-for="node in graph.nodes" :key="`n-${node.index}`">
            <span class="agent-graph__node">{{ node.name }}</span>
            <span v-if="node.type" class="agent-graph__type">{{ node.type }}</span>
          </li>
        </ul>

        <ul v-if="graph.edges.length" class="agent-graph__edges">
          <li v-for="edge in graph.edges" :key="`e-${edge.index}`">
            {{ edge.source }} <span class="agent-graph__relation">—{{ edge.relation || '关联' }}→</span> {{ edge.target }}
          </li>
        </ul>

        <p v-if="!graph.nodes.length && !graph.edges.length" class="agent-graph__empty">
          该工具只返回图谱范围与证据计数，未包含节点明细；需要节点与关系时改用 kg_graph 读取。
        </p>

        <a
          v-if="graph.url"
          class="agent-evidence__link"
          :href="graph.url"
          target="_blank"
          rel="noreferrer noopener"
        >打开图谱服务 ↗</a>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'ToolEvidence' })

import { computed, ref } from 'vue'
import { extractEvidence } from './citations.js'

const props = defineProps({
  tool: {
    type: Object,
    required: true
  }
})

const evidence = computed(() => extractEvidence(props.tool))
const references = computed(() => evidence.value?.references || [])
const graph = computed(() => evidence.value?.graph || null)

const open = ref([])
const graphOpen = ref(false)

/** aria-controls 需要页面内唯一的 id：按工具调用 id 命名。 */
const prefix = computed(() => `agent-evidence-${String(props.tool?.id || props.tool?.name || 'tool')}`)
function panelId(referenceId) {
  return `${prefix.value}-${referenceId}`
}
const graphPanelId = computed(() => `${prefix.value}-graph`)

function isOpen(id) {
  return open.value.includes(id)
}

/** 手风琴式：同时只展开一条证据，面板保持紧凑。 */
function toggle(id) {
  open.value = isOpen(id) ? [] : [id]
}

const graphLabel = computed(() => graph.value?.graphId || '（本次检索范围）')

function present(value) {
  return value !== null && value !== undefined
}

/** 与后端 kg_graph 的 summary 同一套计数（无过滤时不重复显示“命中”）。 */
const graphCountsLabel = computed(() => {
  const counts = graph.value?.counts
  if (!counts) return ''
  const parts = []
  if (present(counts.nodes)) parts.push(`${counts.nodes} 节点`)
  if (present(counts.edges)) parts.push(`${counts.edges} 关系`)
  if (present(counts.matchedNodes) && counts.matchedNodes !== counts.nodes) {
    parts.push(`命中 ${counts.matchedNodes} 节点`)
  }
  if (present(counts.returnedNodes)) {
    parts.push(`已返回 ${counts.returnedNodes} 节点 / ${counts.returnedEdges ?? 0} 关系`)
  }
  return parts.join(' · ')
})
</script>

<style scoped>
.agent-evidence {
  display: grid;
  gap: 6px;
  margin: 0 0 8px;
}

.agent-evidence__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-evidence__counts {
  color: var(--agent-muted, var(--asc-muted));
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.agent-evidence__link {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 650;
  text-decoration: none;
}

.agent-evidence__link:hover {
  color: var(--asc-primary-hover);
  text-decoration: underline;
}

.agent-evidence__refs {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-evidence__ref {
  min-width: 0;
}

.agent-cite {
  display: flex;
  align-items: baseline;
  gap: 5px;
  max-width: 100%;
  padding: 3px 9px;
  border: 1px solid var(--asc-border-strong);
  border-radius: 999px;
  background: var(--asc-surface);
  color: var(--asc-text);
  font-size: 11px;
  font-weight: 650;
  text-align: left;
}

.agent-cite:hover {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
}

.agent-cite--open {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
}

.agent-cite__marker {
  flex: 0 0 auto;
  font-size: 10px;
}

.agent-cite__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-cite__panel {
  margin: 4px 0 6px;
  padding: 7px 9px;
  border-left: 3px solid var(--asc-primary);
  border-radius: 0 6px 6px 0;
  background: var(--asc-surface-soft);
}

.agent-cite__quote {
  margin: 0;
  color: var(--asc-text);
  font-size: 11.5px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.agent-cite__meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin: 5px 0 0;
}

.agent-cite__source {
  color: var(--agent-muted, var(--asc-muted));
  font-size: 11px;
  font-style: normal;
}

.agent-graph__panel {
  margin: 4px 0 6px;
  padding: 7px 9px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  background: var(--asc-surface-soft);
}

.agent-graph__counts {
  margin: 0 0 5px;
  color: var(--asc-heading);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.agent-graph__project {
  color: var(--agent-muted, var(--asc-muted));
  font-weight: 600;
}

.agent-graph__nodes,
.agent-graph__edges {
  display: grid;
  gap: 3px;
  max-height: 132px;
  margin: 0 0 5px;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.agent-graph__nodes li,
.agent-graph__edges li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--asc-text);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.agent-graph__node {
  font-weight: 650;
}

.agent-graph__type {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
  font-size: 10px;
  font-weight: 700;
}

.agent-graph__edges li {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
}

.agent-graph__relation {
  color: var(--agent-muted, var(--asc-muted));
}

.agent-graph__empty {
  margin: 0;
  color: var(--agent-muted, var(--asc-muted));
  font-size: 11px;
  line-height: 1.6;
}
</style>
