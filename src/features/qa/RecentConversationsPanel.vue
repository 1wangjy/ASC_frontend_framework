<template>
  <aside
    class="recent-conversations"
    :class="{ 'recent-conversations--compact-open': compactOpen }"
    :aria-label="title"
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
      <span>{{ title }}</span>
      <AscIcon name="chevron" :class="{ 'is-open': compactOpen }" />
    </button>

    <div id="recent-conversation-list" class="recent-conversations__content">
      <button
        class="recent-conversations__new"
        type="button"
        @click="$emit('new-chat')"
      >
        <AscIcon name="plus" />
        <span>新建问答</span>
      </button>

      <div class="recent-conversations__heading">
        <div class="recent-conversations__summary">
          <span>{{ title }}</span>
          <small>{{ conversations.length }} 条</small>
        </div>
      </div>

      <div
        class="recent-conversations__list"
        :class="{ 'recent-conversations__list--expanded': expanded }"
      >
        <button
          v-for="conversation in visibleConversations"
          :key="conversation.id"
          type="button"
          class="recent-conversations__item"
          :title="conversation.title"
          @click="selectConversation(conversation)"
        >
          <span>{{ conversation.title }}</span>
        </button>
      </div>

      <button
        v-if="hasMore"
        class="recent-conversations__more"
        type="button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span>{{ expanded ? '收起示例' : '查看更多示例' }}</span>
        <AscIcon name="chevron" :class="{ 'is-open': expanded }" />
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import {
  DEFAULT_VISIBLE_CONVERSATIONS,
  getVisibleRecentConversations
} from '../navigation/recentConversationModel.js'

const props = defineProps({
  title: {
    type: String,
    default: '示例问题'
  },
  conversations: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select', 'new-chat'])
const expanded = ref(false)
const compactOpen = ref(false)
const compactToggle = ref(null)

const visibleConversations = computed(() => (
  getVisibleRecentConversations(props.conversations, expanded.value)
))

const hasMore = computed(() => (
  props.conversations.length > DEFAULT_VISIBLE_CONVERSATIONS
))

function selectConversation(conversation) {
  compactOpen.value = false
  emit('select', conversation)
}

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

.recent-conversations__new {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid #9fc4da;
  border-radius: 6px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 750;
  margin: 0 8px 12px;
  transition: background var(--asc-transition), border-color var(--asc-transition);
}

.recent-conversations__new:hover,
.recent-conversations__new:focus-visible {
  border-color: var(--asc-primary);
  background: var(--asc-primary-soft);
  outline: none;
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
    display: block;
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
