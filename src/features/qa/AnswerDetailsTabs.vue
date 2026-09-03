<template>
  <section class="answer-details" aria-labelledby="answer-details-title">
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
.answer-details {
  overflow: hidden;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.answer-details__heading {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 22px;
  border-bottom: 1px solid var(--asc-border);
}

.answer-details h2 {
  flex: 0 0 auto;
  margin: 0;
  color: var(--asc-heading);
  font-size: 17px;
}

.answer-details__tabs {
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 8px;
  overflow-x: auto;
}

.answer-details__tabs button {
  position: relative;
  min-height: 58px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: var(--asc-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
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
  color: var(--asc-primary);
}

.answer-details__tabs button.active::after {
  background: var(--asc-primary);
}

.answer-details__body {
  min-height: 96px;
  padding: 18px 22px;
  color: var(--asc-text);
  font-size: 14px;
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
    padding-top: 18px;
  }

  .answer-details__tabs {
    margin-top: 8px;
  }
}
</style>
