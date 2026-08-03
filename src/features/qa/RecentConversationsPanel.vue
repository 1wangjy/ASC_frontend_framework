<template>
  <aside
    class="recent-conversations"
    :class="{ 'recent-conversations--compact-open': compactOpen }"
    aria-label="最近会话"
    @keydown.esc="compactOpen = false"
  >
    <button
      class="recent-conversations__compact-toggle"
      type="button"
      :aria-expanded="compactOpen"
      aria-controls="recent-conversation-list"
      @click="compactOpen = !compactOpen"
    >
      <span>最近会话</span>
      <AscIcon name="chevron" :class="{ 'is-open': compactOpen }" />
    </button>

    <div id="recent-conversation-list" class="recent-conversations__content">
      <div class="recent-conversations__heading">
        <span>最近会话</span>
        <small>{{ conversations.length }} 条</small>
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
        <span>{{ expanded ? '收起历史' : '查看更多历史' }}</span>
        <AscIcon name="chevron" :class="{ 'is-open': expanded }" />
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import {
  DEFAULT_VISIBLE_CONVERSATIONS,
  getVisibleRecentConversations
} from '../navigation/recentConversationModel.js'

const props = defineProps({
  conversations: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select'])
const expanded = ref(false)
const compactOpen = ref(false)

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
</script>

<style scoped>
.recent-conversations {
  min-width: 0;
  padding: 92px 20px 28px 2px;
  color: #6d899d;
}

.recent-conversations__compact-toggle {
  display: none;
}

.recent-conversations__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 8px 10px;
  color: #7893a6;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.recent-conversations__heading small {
  color: #9bafbd;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
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
  color: #718da0;
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
  color: #8aa1b0;
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
    position: fixed;
    z-index: 24;
    top: 70px;
    right: 18px;
    width: auto;
    padding: 0;
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
    color: #6d899d;
    font-size: 11px;
    font-weight: 650;
    backdrop-filter: blur(10px);
  }

  .recent-conversations__content {
    position: absolute;
    top: 42px;
    right: 0;
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
    top: 66px;
    right: 12px;
  }
}
</style>
