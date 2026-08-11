<template>
  <div class="graph-project-list">
    <div v-if="!items.length" class="graph-project-list__empty">
      <strong>暂无图谱项目</strong>
      <p>请先从文献管理选择文献并开始构建。</p>
    </div>

    <article
      v-for="item in items"
      v-else
      :key="item.projectId"
      class="graph-project-card"
      :class="{ 'graph-project-card--selected': isSelected(item) }"
    >
      <button class="graph-project-card__select" type="button" @click="$emit('select', item)">
        <span class="graph-project-card__heading">
          <strong>{{ item.name }}</strong>
          <small>{{ statusCopy(item) }}</small>
        </span>
      </button>

      <div class="graph-project-card__actions">
        <button type="button" @click="$emit('select', item)">查看进度</button>
        <button
          type="button"
          class="graph-project-card__delete"
          :disabled="deletingProjectId === item.projectId"
          @click="$emit('delete', item)"
        >
          {{ deletingProjectId === item.projectId ? '删除中…' : '删除' }}
        </button>
      </div>
    </article>
  </div>
</template>

<script setup>
import { graphEvolutionStatusCopy } from '../tasks/graphTaskMonitorModel.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedProjectId: { type: String, default: '' },
  deletingProjectId: { type: String, default: '' }
})

defineEmits(['select', 'delete'])

function isSelected(item) {
  return item.projectId === props.selectedProjectId
    || item.memberProjectIds?.includes(props.selectedProjectId)
}

function statusCopy(item) {
  const evolutionCopy = graphEvolutionStatusCopy(item)
  if (evolutionCopy) return evolutionCopy
  return {
    created: '准备构建图谱',
    ontology_generating: '正在准备图谱',
    ontology_generated: '等待构建图谱',
    graph_building: '正在构建图谱',
    base_completed: '正在完善图谱',
    graph_completed: '知识图谱专业构建完成',
    failed: '构建失败'
  }[item.status] || '准备中'
}
</script>

<style scoped>
.graph-project-list { display: grid; gap: 10px; }
.graph-project-list__empty { padding: 32px 18px; border: 1px dashed var(--asc-border-strong); border-radius: 10px; color: var(--asc-muted); text-align: center; }
.graph-project-list__empty strong { color: var(--asc-heading); }
.graph-project-list__empty p { margin: 8px 0 0; line-height: 1.6; }
.graph-project-card { overflow: hidden; border: 1px solid var(--asc-border); border-radius: 10px; background: #fff; transition: border-color var(--asc-transition), box-shadow var(--asc-transition); }
.graph-project-card--selected { border-color: var(--asc-primary); box-shadow: 0 0 0 2px var(--asc-primary-soft); }
.graph-project-card__select { width: 100%; padding: 13px 14px 10px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.graph-project-card__heading, .graph-project-card__actions { display: flex; align-items: center; gap: 10px; }
.graph-project-card__heading { justify-content: space-between; }
.graph-project-card__heading strong { overflow: hidden; color: var(--asc-heading); text-overflow: ellipsis; white-space: nowrap; }
.graph-project-card__heading small { flex: 0 0 auto; color: var(--asc-muted); }
.graph-project-card__actions { justify-content: flex-end; padding: 0 10px 10px; }
.graph-project-card__actions button { padding: 5px 7px; border: 0; background: transparent; color: var(--asc-primary); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.graph-project-card__actions button:disabled { cursor: wait; opacity: .55; }
.graph-project-card__actions .graph-project-card__delete { color: #b43b32; }
</style>
