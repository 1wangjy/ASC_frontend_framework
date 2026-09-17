<template>
  <section class="answer-details qa-panel" aria-labelledby="answer-details-title">
    <div class="answer-details__heading">
      <h2 id="answer-details-title">回答详情</h2>
      <div class="answer-details__tabs" role="tablist" aria-label="回答详情模块">
        <button
          v-for="tab in items"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="currentTab?.id === tab.id"
          :class="{ active: currentTab?.id === tab.id }"
          @click="$emit('select', tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="currentTab" class="answer-details__body" role="tabpanel">
      <QaReasoningTrace
        v-if="currentTab.id === 'reasoning'"
        :trace="currentTab.trace"
        :question="question"
        :domain-terms="domainTerms"
      />
      <OmdAnswerDetail
        v-else-if="currentTab.id === 'omd' && currentTab.omd"
        :model="currentTab.omd"
        :references="references"
        :domain-terms="domainTerms"
        @citation="$emit('citation', $event)"
      />
      <QaLogicDerivation
        v-else-if="currentTab.id === 'logic' && currentTab.derivation"
        :derivation="currentTab.derivation"
        :domain-terms="domainTerms"
      />
      <QaAnswerText
        v-else
        :text="currentTab.content"
        :references="references"
        :domain-terms="domainTerms"
        @citation="$emit('citation', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { buildAscDomainTerms } from '../../utils/ascDomainHighlighter.js'
import OmdAnswerDetail from './OmdAnswerDetail.vue'
import QaAnswerText from './QaAnswerText.js'
import QaLogicDerivation from './QaLogicDerivation.vue'
import QaReasoningTrace from './QaReasoningTrace.vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: 'cod'
  },
  items: {
    type: Array,
    default: () => []
  },
  references: {
    type: Array,
    default: () => []
  },
  question: {
    type: String,
    default: ''
  },
  result: {
    type: Object,
    default: null
  }
})

defineEmits(['select', 'citation'])

const currentTab = computed(() => (
  props.items.find(item => item.id === props.activeTab) || props.items[0] || null
))
const domainTerms = computed(() => buildAscDomainTerms({
  content: props.items.map(item => item?.content).filter(Boolean).join('\n'),
  question: props.question,
  result: props.result
}))
</script>

<style scoped>
/* 面板外观（边框/圆角/底色/阴影）来自共享的 .qa-panel 层 */
.answer-details {
  overflow: hidden;
}

.answer-details__heading {
  min-height: var(--qa-panel-head-h);
  display: flex;
  align-items: center;
  gap: var(--qa-space-6);
  padding: 0 var(--qa-panel-pad);
  border-bottom: 1px solid var(--qa-border-color);
}

.answer-details h2 {
  flex: 0 0 auto;
  margin: 0;
  color: var(--qa-heading);
  font-size: var(--qa-title-size);
  font-weight: var(--qa-weight-heavy);
}

.answer-details__tabs {
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: var(--qa-space-2);
  overflow-x: auto;
}

.answer-details__tabs button {
  position: relative;
  min-height: var(--qa-panel-head-h);
  padding: 0 var(--qa-space-4);
  border: 0;
  background: transparent;
  color: var(--qa-text);
  font: inherit;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
  white-space: nowrap;
  cursor: pointer;
}

.answer-details__tabs button::after {
  position: absolute;
  right: 14px;
  bottom: 0;
  left: 14px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: transparent;
  content: '';
}

.answer-details__tabs button.active {
  color: var(--qa-accent);
}

.answer-details__tabs button.active::after {
  background: var(--qa-accent);
}

.answer-details__body {
  min-height: 96px;
  padding: var(--qa-panel-pad);
  color: var(--qa-text);
  font-size: var(--qa-font-md);
  line-height: 1.9;
  white-space: pre-wrap;
}

.answer-details :deep(.qa-domain-term) {
  border-radius: 3px;
  color: #123f46;
  font-weight: 850;
  text-decoration-skip-ink: auto;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.answer-details :deep(.qa-domain-term:hover) {
  background: rgba(20, 184, 166, 0.09);
  color: #0f766e;
}

.answer-details :deep(.qa-domain-term u) {
  font-weight: inherit;
  text-decoration-color: #14b8a6;
  text-decoration-thickness: 1.7px;
  text-underline-offset: 3px;
}

@media (max-width: 760px) {
  .answer-details__heading {
    display: block;
    padding-top: var(--qa-panel-pad);
  }

  .answer-details__tabs {
    margin-top: var(--qa-space-2);
  }
}
</style>
