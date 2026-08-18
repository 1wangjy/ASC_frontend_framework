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
      <div class="graph-project-card__topline">
        <button class="graph-project-card__name" type="button" @click="$emit('select', item)">
          <strong>{{ item.name }}</strong>
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
      </div>

      <button class="graph-project-card__status" type="button" @click="$emit('select', item)">
        {{ statusCopy(item) }}
      </button>
    </article>
  </div>
</template>

<script setup>
import { graphTaskStageCopy } from '../tasks/graphTaskMonitorModel.js'

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
  return graphTaskStageCopy(item)
}
</script>

<style scoped>
.graph-project-list { display: grid; gap: 10px; }
.graph-project-list__empty { padding: 32px 18px; border: 1px dashed var(--asc-border-strong); border-radius: 10px; color: var(--asc-muted); text-align: center; }
.graph-project-list__empty strong { color: var(--asc-heading); }
.graph-project-list__empty p { margin: 8px 0 0; line-height: 1.6; }
.graph-project-card { overflow: hidden; border: 1px solid var(--asc-border); border-radius: 10px; background: #fff; transition: border-color var(--asc-transition), box-shadow var(--asc-transition); }
.graph-project-card--selected { border-color: var(--asc-primary); box-shadow: 0 0 0 2px var(--asc-primary-soft); }
.graph-project-card__topline { display: flex; align-items: center; gap: 8px; padding: 12px 8px 3px 14px; }
.graph-project-card__name { min-width: 0; flex: 1 1 auto; overflow: hidden; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.graph-project-card__name strong { display: block; overflow: hidden; color: var(--asc-heading); text-overflow: ellipsis; white-space: nowrap; }
.graph-project-card__actions { display: flex; flex: 0 0 auto; align-items: center; justify-content: flex-end; gap: 2px; }
.graph-project-card__actions button { padding: 5px 7px; border: 0; background: transparent; color: var(--asc-primary); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.graph-project-card__actions button:disabled { cursor: wait; opacity: .55; }
.graph-project-card__actions .graph-project-card__delete { color: #b43b32; }
.graph-project-card__status { display: block; width: 100%; padding: 3px 14px 12px; border: 0; background: transparent; color: var(--asc-muted); font: inherit; font-size: 12px; line-height: 1.45; text-align: left; cursor: pointer; }
</style>
