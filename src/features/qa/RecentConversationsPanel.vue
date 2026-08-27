<template>
  <aside
    class="recent-conversations"
    :class="{
      'recent-conversations--compact-open': compactOpen,
      'recent-conversations--workflow': mode === 'single'
    }"
    :aria-label="panelTitle"
    @keydown.esc.stop="closeCompactPanel"
  >
    <button
      ref="compactToggle"
      class="recent-conversations__compact-toggle"
      type="button"
      :aria-expanded="compactOpen"
      aria-controls="recent-conversation-list"
      @click="compactOpen = !compactOpen"
    >
      <span>{{ panelTitle }}</span>
      <AscIcon name="chevron" :class="{ 'is-open': compactOpen }" />
    </button>

    <div
      v-if="mode === 'single'"
      id="recent-conversation-list"
      class="recent-conversations__content"
    >
      <RouterLink class="recent-conversations__workflow-link" to="/process">
        <AscIcon name="graph" />
        <span>图谱项目</span>
      </RouterLink>
      <RouterLink class="recent-conversations__workflow-link" to="/reports">
        <AscIcon name="report" />
        <span>报告中心</span>
      </RouterLink>
    </div>

    <div v-else id="recent-conversation-list" class="recent-conversations__content">
      <button
        class="recent-conversations__action recent-conversations__new"
        type="button"
        :disabled="disabled"
        @click="$emit('new-chat')"
      >
        <AscIcon name="plus" />
        <span>新建讨论</span>
      </button>
      <button
        class="recent-conversations__action recent-conversations__exit"
        type="button"
        :disabled="disabled"
        @click="$emit('exit-multi')"
      >
        <AscIcon name="chevron" />
        <span>退出多轮</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  mode: {
    type: String,
    default: 'multi'
  },
  title: {
    type: String,
    default: '多轮讨论'
  },
  disabled: Boolean
})

defineEmits(['new-chat', 'exit-multi'])
const compactOpen = ref(false)
const compactToggle = ref(null)
const panelTitle = computed(() => props.mode === 'single' ? '快捷入口' : props.title)

function closeCompactPanel() {
  if (!compactOpen.value) return
  compactOpen.value = false
  nextTick(() => compactToggle.value?.focus())
}
</script>

<style scoped>
.recent-conversations {
  --recent-text: #496a7f;
  --recent-heading: #42647a;
  --recent-muted: #557286;
  min-width: 0;
  padding: 92px 20px 28px 2px;
  color: var(--recent-text);
}

.recent-conversations__compact-toggle {
  display: none;
}

.recent-conversations__content {
  display: grid;
  gap: 8px;
}

.recent-conversations--workflow {
  padding-top: 14px;
}

.recent-conversations__workflow-link {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 8px;
  padding: 0 11px;
  border: 1px solid #79b5dc;
  border-radius: 7px;
  background: #eef7fd;
  box-shadow: 0 5px 14px rgba(20, 105, 160, 0.1);
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  transition: color var(--asc-transition), background var(--asc-transition), border-color var(--asc-transition), box-shadow var(--asc-transition);
}

.recent-conversations__workflow-link:hover,
.recent-conversations__workflow-link:focus-visible {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  box-shadow: 0 7px 18px rgba(20, 105, 160, 0.2);
  color: #fff;
  outline: none;
}

.recent-conversations__heading {
  margin: 0 8px 10px;
  color: var(--recent-heading);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.recent-conversations__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recent-conversations__heading small {
  color: var(--recent-muted);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
}

.recent-conversations__action {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0 8px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--recent-muted);
  font-size: 12px;
  font-weight: 700;
  transition: color var(--asc-transition), background var(--asc-transition), border-color var(--asc-transition);
}

.recent-conversations__exit :deep(.asc-icon) {
  transform: rotate(180deg);
}

.recent-conversations__action:hover,
.recent-conversations__action:focus-visible {
  border-color: rgba(159, 196, 218, 0.72);
  background: rgba(255, 255, 255, 0.72);
  color: var(--asc-primary);
  outline: none;
}

.recent-conversations__action:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.recent-conversations__list {
  display: grid;
  gap: 2px;
}

.recent-conversations__list--expanded {
  max-height: min(48vh, 340px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #c8d9e5 transparent;
}

.recent-conversations__item {
  width: 100%;
  min-width: 0;
  padding: 8px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--recent-text);
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
  transition: color var(--asc-transition), background var(--asc-transition);
}

.recent-conversations__item span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-conversations__item:hover,
.recent-conversations__item:focus-visible {
  background: rgba(24, 105, 155, 0.045);
  color: #285d7d;
}

.recent-conversations__more {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 7px 8px 0;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: var(--recent-muted);
  font-size: 10px;
  font-weight: 650;
}

.recent-conversations__more:hover,
.recent-conversations__more:focus-visible {
  color: var(--asc-primary);
}

.recent-conversations__more :deep(.asc-icon),
.recent-conversations__compact-toggle :deep(.asc-icon) {
  transition: transform var(--asc-transition);
}

.recent-conversations__more :deep(.asc-icon.is-open),
.recent-conversations__compact-toggle :deep(.asc-icon.is-open) {
  transform: rotate(90deg);
}

@media (min-width: 1121px) {
  .recent-conversations {
    position: absolute;
    z-index: 24;
    top: 58px;
    right: 0;
    width: 176px;
  }
}

@media (max-width: 1120px) {
  .recent-conversations {
    position: relative;
    z-index: 24;
    grid-row: 1;
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 7px 18px;
  }

  .recent-conversations__compact-toggle {
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid rgba(169, 198, 216, 0.8);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 5px 16px rgba(13, 65, 98, 0.08);
    color: var(--recent-text);
    font-size: 11px;
    font-weight: 650;
    backdrop-filter: blur(10px);
  }

  .recent-conversations__content {
    position: absolute;
    top: calc(100% - 2px);
    right: 18px;
    width: min(230px, calc(100vw - 32px));
    display: none;
    padding: 13px 10px 11px;
    border: 1px solid var(--asc-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 34px rgba(11, 61, 93, 0.14);
    backdrop-filter: blur(14px);
  }

  .recent-conversations--compact-open .recent-conversations__content {
    display: grid;
  }
}

@media (max-width: 760px) {
  .recent-conversations {
    min-height: 46px;
    padding: 6px 12px;
  }

  .recent-conversations__content {
    right: 12px;
  }
}
</style>
