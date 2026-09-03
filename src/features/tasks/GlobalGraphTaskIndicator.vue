<template>
  <aside class="graph-task-indicator" aria-label="图谱演化状态" @keydown.esc="handleEscape">
    <button
      ref="trigger"
      class="graph-task-indicator__trigger"
      type="button"
      :aria-expanded="expanded"
      aria-controls="global-graph-task-popover"
      @click="expanded = !expanded"
    >
      <span class="graph-task-indicator__dot" :class="{ 'graph-task-indicator__dot--active': activeCount }" />
      <span>图谱演化状态</span>
      <span v-if="activeCount" class="graph-task-indicator__count" :aria-label="`${activeCount} 个进行中任务`">
        {{ activeCount }}
      </span>
    </button>

    <section
      id="global-graph-task-popover"
      class="graph-task-indicator__popover"
      :aria-hidden="!expanded"
      v-show="expanded"
    >
      <header class="graph-task-indicator__header">
        <strong>图谱演化任务</strong>
        <button type="button" class="graph-task-indicator__close" aria-label="关闭图谱演化任务" @click="closePopover">×</button>
      </header>

      <div v-if="connection === 'offline'" class="graph-task-indicator__offline">
        <span>连接已断开，上次状态{{ lastSyncedLabel }}</span>
        <button type="button" @click="$emit('refresh')">重新连接</button>
      </div>

      <p v-if="!visibleItems.length" class="graph-task-indicator__empty">暂无图谱任务</p>
      <ul v-else class="graph-task-indicator__list">
        <li v-for="item in visibleItems" :key="item.id" class="graph-task-indicator__item">
          <div class="graph-task-indicator__item-main">
            <strong>{{ item.name }}</strong>
            <span>{{ statusCopy(item) }}</span>
          </div>
          <p v-if="item.message" class="graph-task-indicator__message">{{ item.message }}</p>
          <div class="graph-task-indicator__actions">
            <button v-if="item.projectId" type="button" @click="$emit('view-project', item.projectId)">查看进度</button>
          </div>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'

import { graphTaskStageCopy, selectVisibleGraphTasks } from './graphTaskMonitorModel.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  connection: { type: String, default: 'idle' },
  lastSyncedAt: { type: [Number, String], default: null }
})

defineEmits(['refresh', 'view-project'])

const expanded = ref(false)
const trigger = ref(null)
const visibleItems = computed(() => selectVisibleGraphTasks(props.items))
const activeCount = computed(() => props.items.filter(item => item.active).length)
const lastSyncedLabel = computed(() => props.lastSyncedAt ? `：${new Date(props.lastSyncedAt).toLocaleString()}` : '')

function statusCopy(item) {
  return graphTaskStageCopy(item)
}

function closePopover() {
  expanded.value = false
  nextTick(() => trigger.value?.focus())
}

function handleEscape(event) {
  if (!expanded.value) return
  event.stopPropagation()
  closePopover()
}
</script>

<style scoped>
.graph-task-indicator { position: relative; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
.graph-task-indicator__trigger { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 12px; border: 1px solid var(--asc-border); border-radius: 18px; background: #fff; color: var(--asc-heading); box-shadow: 0 8px 24px rgba(4, 28, 49, .16); font-weight: 700; cursor: pointer; }
.graph-task-indicator__dot { width: 8px; height: 8px; border-radius: 50%; background: #8b9bad; }
.graph-task-indicator__dot--active { background: var(--asc-primary); box-shadow: 0 0 0 4px var(--asc-primary-soft); }
.graph-task-indicator__count { display: inline-grid; min-width: 20px; height: 20px; padding: 0 5px; place-items: center; border-radius: 10px; background: var(--asc-primary); color: #fff; font-size: 12px; line-height: 1; }
.graph-task-indicator__popover { position: absolute; top: calc(100% + 8px); left: 0; right: auto; bottom: auto; z-index: 60; display: flex; flex-direction: column; width: min(360px, calc(100vw - 32px)); max-height: min(70vh, 520px); overflow: hidden; border: 1px solid var(--asc-border); border-radius: 12px; background: #fff; box-shadow: 0 16px 40px rgba(4, 28, 49, .2); }
.graph-task-indicator__header, .graph-task-indicator__item-main, .graph-task-indicator__actions, .graph-task-indicator__offline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.graph-task-indicator__header { flex: 0 0 auto; padding: 12px 14px; border-bottom: 1px solid var(--asc-border); }
.graph-task-indicator__close { border: 0; background: transparent; color: var(--asc-muted); font-size: 22px; cursor: pointer; }
.graph-task-indicator__offline { flex: 0 0 auto; padding: 9px 14px; background: #fff7e8; color: #8a5400; }
.graph-task-indicator__offline button, .graph-task-indicator__actions button { border: 0; background: transparent; color: var(--asc-primary); font: inherit; font-weight: 700; cursor: pointer; }
.graph-task-indicator__list { min-height: 0; margin: 0; padding: 0; overflow-y: auto; list-style: none; overscroll-behavior: contain; }
.graph-task-indicator__item { padding: 12px 14px; border-bottom: 1px solid var(--asc-border); }
.graph-task-indicator__item-main span, .graph-task-indicator__message, .graph-task-indicator__empty { color: var(--asc-muted); }
.graph-task-indicator__message { margin: 8px 0 0; }
.graph-task-indicator__actions { justify-content: flex-end; margin-top: 10px; }
.graph-task-indicator__empty { margin: 0; padding: 16px 14px; }

@media (max-width: 760px) {
  .graph-task-indicator__popover { top: calc(100% + 8px); left: 0; right: auto; max-height: calc(100vh - 138px); }
}
</style>
