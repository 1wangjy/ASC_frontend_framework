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
  /* quiet-rail text colours are graded against the QA canvas (#f3f7fb) */
  --recent-text: #496a7f;
  --recent-heading: #42647a;
  --recent-muted: #557286;
  min-width: 0;
  padding: 92px var(--qa-space-5) var(--qa-space-6) var(--qa-space-1);
  color: var(--recent-text);
}

.recent-conversations__compact-toggle {
  display: none;
}

.recent-conversations__content {
  display: grid;
  gap: var(--qa-space-2);
}

.recent-conversations--workflow {
  padding-top: 14px;
}

.recent-conversations__workflow-link {
  min-height: var(--qa-control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--qa-space-2);
  margin: 0 var(--qa-space-2);
  padding: 0 var(--qa-space-3);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent-soft);
  box-shadow: 0 5px 14px rgba(20, 105, 160, 0.1);
  color: var(--qa-accent);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
  text-decoration: none;
  transition: color var(--qa-transition), background var(--qa-transition), border-color var(--qa-transition), box-shadow var(--qa-transition);
}

.recent-conversations__workflow-link:hover,
.recent-conversations__workflow-link:focus-visible {
  border-color: var(--qa-accent);
  background: var(--qa-accent);
  box-shadow: 0 7px 18px rgba(20, 105, 160, 0.2);
  color: #fff;
  outline: none;
}

.recent-conversations__heading {
  margin: 0 var(--qa-space-2) var(--qa-space-2);
  color: var(--recent-heading);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
  letter-spacing: 0.08em;
}

.recent-conversations__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
}

.recent-conversations__heading small {
  color: var(--recent-muted);
  font-size: var(--qa-font-xs);
  font-weight: var(--qa-weight-semibold);
  letter-spacing: 0;
}

.recent-conversations__action {
  min-height: var(--qa-control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--qa-space-1);
  margin: 0 var(--qa-space-2);
  padding: 0 var(--qa-space-2);
  border: 1px solid transparent;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: var(--recent-muted);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-bold);
  transition: color var(--qa-transition), background var(--qa-transition), border-color var(--qa-transition);
}

.recent-conversations__exit :deep(.asc-icon) {
  transform: rotate(180deg);
}

.recent-conversations__action:hover,
.recent-conversations__action:focus-visible {
  border-color: rgba(159, 196, 218, 0.72);
  background: rgba(255, 255, 255, 0.72);
  color: var(--qa-accent);
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
  padding: var(--qa-space-2);
  overflow: hidden;
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: var(--recent-text);
  font-size: var(--qa-control-font);
  line-height: 1.4;
  text-align: left;
  transition: color var(--qa-transition), background var(--qa-transition);
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
  gap: var(--qa-space-1);
  margin: var(--qa-space-2) var(--qa-space-2) 0;
  padding: var(--qa-space-1) 0;
  border: 0;
  background: transparent;
  color: var(--recent-muted);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-semibold);
  cursor: pointer;
}

.recent-conversations__more:hover,
.recent-conversations__more:focus-visible {
  color: var(--qa-accent);
}

.recent-conversations__more :deep(.asc-icon),
.recent-conversations__compact-toggle :deep(.asc-icon) {
  transition: transform var(--qa-transition);
}

.recent-conversations__more :deep(.asc-icon.is-open),
.recent-conversations__compact-toggle :deep(.asc-icon.is-open) {
  transform: rotate(90deg);
}

@media (min-width: 1121px) {
  .recent-conversations {
    position: absolute;
    z-index: 24;
    top: var(--qa-topbar-h);
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
    min-height: var(--qa-space-12);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--qa-space-2) var(--qa-space-4);
  }

  .recent-conversations__compact-toggle {
    min-height: var(--qa-control-h);
    display: flex;
    align-items: center;
    gap: var(--qa-space-2);
    padding: 0 var(--qa-space-3);
    border: 1px solid rgba(169, 198, 216, 0.8);
    border-radius: var(--qa-radius-control);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 5px 16px rgba(13, 65, 98, 0.08);
    color: var(--recent-text);
    font-size: var(--qa-control-font);
    font-weight: var(--qa-weight-semibold);
    backdrop-filter: blur(10px);
  }

  .recent-conversations__content {
    position: absolute;
    top: calc(100% - 2px);
    right: var(--qa-space-4);
    width: min(230px, calc(100vw - 32px));
    display: none;
    padding: var(--qa-space-3) var(--qa-space-3);
    border: 1px solid var(--qa-border-color);
    border-radius: var(--qa-radius-card);
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
    min-height: var(--qa-space-12);
    padding: var(--qa-space-2) var(--qa-space-3);
  }

  .recent-conversations__content {
    right: var(--qa-space-3);
  }
}
</style>
