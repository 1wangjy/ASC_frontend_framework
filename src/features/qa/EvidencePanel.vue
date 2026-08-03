<template>
  <aside class="evidence-panel">
    <header class="evidence-panel__header">
      <div>
        <h2>证据与评估</h2>
        <p>引用来源 · {{ references.length }}</p>
      </div>
      <button type="button" aria-label="关闭证据面板" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <div class="reference-list">
      <button
        v-for="reference in references"
        :key="reference.id"
        type="button"
        class="reference-card"
        :class="{ 'reference-card--active': selectedCitationId === reference.id }"
        @click="$emit('select', reference.id)"
      >
        <span>{{ reference.id }}</span>
        <div>
          <strong>{{ reference.title }}</strong>
          <small>{{ reference.authors }} · {{ reference.source }} · {{ reference.year }} · {{ reference.locator }}</small>
        </div>
      </button>
    </div>

    <div class="evaluation-switch">
      <button
        type="button"
        :class="{ active: evaluationMode === 'expert' }"
        @click="evaluationMode = 'expert'"
      >
        专家评分
      </button>
      <button
        type="button"
        :class="{ active: evaluationMode === 'llm' }"
        @click="evaluationMode = 'llm'"
      >
        LLM Judge
      </button>
    </div>

    <div class="score-summary">
      <strong>{{ evaluationMode === 'expert' ? '9.1' : '8.9' }}</strong>
      <span>/ 10</span>
      <p>{{ evaluationMode === 'expert' ? '专家精选证据整体可靠' : '模型判定引用与结论一致' }}</p>
    </div>

    <div class="metrics">
      <div v-for="metric in metrics" :key="metric.label" class="metric">
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}%</strong>
        </div>
        <div class="metric__track"><span :style="{ width: `${metric.value}%` }" /></div>
      </div>
    </div>

    <div v-if="selectedReference" class="excerpt">
      <span>可引用片段 · {{ selectedReference.id }}</span>
      <p>{{ selectedReference.excerpt }}</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  references: {
    type: Array,
    required: true
  },
  selectedCitationId: {
    type: String,
    default: ''
  }
})

defineEmits(['close', 'select'])

const evaluationMode = ref('expert')
const metrics = [
  { label: '证据覆盖度', value: 92 },
  { label: '来源一致性', value: 89 },
  { label: '本体一致性', value: 88 },
  { label: '结论可信度', value: 90 }
]

const selectedReference = computed(
  () => props.references.find(reference => reference.id === props.selectedCitationId) || props.references[0]
)
</script>

<style scoped>
.evidence-panel {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 24px 20px;
  overflow-y: auto;
  border-left: 1px solid var(--asc-border);
  background: #fff;
}

.evidence-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--asc-border);
}

.evidence-panel h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 17px;
}

.evidence-panel__header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

.evidence-panel__header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--asc-text);
  font-size: 18px;
}

.reference-list {
  display: grid;
  gap: 8px;
  margin-top: 15px;
}

.reference-card {
  width: 100%;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  text-align: left;
}

.reference-card:hover,
.reference-card--active {
  border-color: #79b4d8;
  background: #f5fbff;
}

.reference-card > span {
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 850;
}

.reference-card strong,
.reference-card small {
  display: block;
}

.reference-card strong {
  color: var(--asc-heading);
  font-size: 11px;
  line-height: 1.4;
}

.reference-card small {
  margin-top: 5px;
  color: var(--asc-muted);
  font-size: 9px;
  line-height: 1.4;
}

.evaluation-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 22px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  overflow: hidden;
}

.evaluation-switch button {
  min-height: 36px;
  border: 0;
  background: #fff;
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 750;
}

.evaluation-switch button + button {
  border-left: 1px solid var(--asc-border);
}

.evaluation-switch button.active {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
}

.score-summary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  margin: 16px 0 20px;
}

.score-summary strong {
  color: var(--asc-heading);
  font-size: 26px;
}

.score-summary span {
  color: var(--asc-muted);
  font-size: 11px;
}

.score-summary p {
  width: 100%;
  margin: 2px 0 0;
  color: var(--asc-muted);
  font-size: 10px;
}

.metrics {
  display: grid;
  gap: 14px;
}

.metric > div:first-child {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--asc-text);
  font-size: 10px;
}

.metric strong {
  color: var(--asc-heading);
}

.metric__track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7eef4;
}

.metric__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2c91c8;
}

.excerpt {
  margin-top: 22px;
  padding: 12px;
  border-left: 3px solid #4ba2d3;
  background: #f5f9fc;
}

.excerpt span {
  color: var(--asc-primary);
  font-size: 9px;
  font-weight: 800;
}

.excerpt p {
  margin: 7px 0 0;
  color: var(--asc-text);
  font-size: 10px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .evidence-panel {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(360px, 92vw);
    box-shadow: var(--asc-shadow);
  }
}
</style>
