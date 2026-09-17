<template>
  <aside class="quality-panel">
    <header class="quality-panel__header">
      <div>
        <span>ASC QUALITY</span>
        <h2>质量评估</h2>
      </div>
      <button type="button" aria-label="关闭质量评估" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <div class="quality-panel__body">
      <section v-if="snapshot.answerMetrics.length" class="quality-section">
        <div class="quality-section__heading">
          <div>
            <span>01</span>
            <h3>回答质量</h3>
          </div>
          <small>来自 QA 定量指标</small>
        </div>

        <div class="academic-profile">
          <div class="academic-profile__header">
            <span>Academic Metric Profile</span>
            <strong v-if="snapshot.answerAcademicBand">{{ snapshot.answerAcademicBand.label }}</strong>
          </div>

          <div class="academic-profile__layout">
            <div v-if="snapshot.answerRadar.axes.length" class="academic-profile__radar">
              <svg
                class="quality-radar"
                viewBox="0 0 220 220"
                role="img"
                aria-label="回答质量雷达图"
              >
                <polygon
                  v-for="ring in snapshot.answerRadar.rings"
                  :key="`answer-ring-${ring.level}`"
                  class="quality-radar__ring"
                  :points="ring.points"
                />
                <line
                  v-for="axis in snapshot.answerRadar.axes"
                  :key="`answer-axis-${axis.key}`"
                  class="quality-radar__axis"
                  x1="110"
                  y1="110"
                  :x2="axis.axis.x"
                  :y2="axis.axis.y"
                />
                <polygon class="quality-radar__area" :points="snapshot.answerRadar.polygon" />
                <circle
                  v-for="axis in snapshot.answerRadar.axes"
                  :key="`answer-point-${axis.key}`"
                  class="quality-radar__point"
                  :cx="axis.x"
                  :cy="axis.y"
                  r="3"
                />
                <text
                  v-for="axis in snapshot.answerRadar.axes"
                  :key="`answer-label-${axis.key}`"
                  :x="axis.labelPoint.x"
                  :y="axis.labelPoint.y"
                  text-anchor="middle"
                >{{ axis.shortLabel }}</text>
              </svg>
            </div>

            <div class="academic-profile__domains">
              <div
                v-for="group in snapshot.answerDomainGroups"
                :key="group.key"
                class="domain-metric"
                :class="`domain-metric--${group.key}`"
              >
                <div class="domain-metric__header">
                  <span>{{ group.label }}</span>
                  <strong>{{ formatQaMetricPrecise(group.value) }}</strong>
                </div>
                <div class="domain-metric__track" aria-hidden="true">
                  <i :style="{ width: metricWidth(group.value) }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="answer-metric-grid">
          <div
            v-for="item in snapshot.answerMetrics"
            :key="item.key"
            class="answer-metric-chip"
            :class="`answer-metric-chip--${item.band}`"
          >
            <span>{{ item.label }}</span>
            <strong>{{ formatQaMetricPrecise(item.value) }}</strong>
          </div>
        </div>
      </section>

      <section v-if="snapshot.reasoningMetrics.length || snapshot.reasoningDepth !== null" class="quality-section">
        <div class="quality-section__heading">
          <div>
            <span>02</span>
            <h3>推理质量</h3>
          </div>
          <small v-if="snapshot.reasoningMode">{{ snapshot.reasoningMode }} 路由</small>
        </div>

        <div class="quality-visual">
          <svg
            v-if="snapshot.reasoningRadar.axes.length"
            class="quality-radar quality-radar--reasoning"
            viewBox="0 0 220 220"
            role="img"
            aria-label="推理质量雷达图"
          >
            <polygon
              v-for="ring in snapshot.reasoningRadar.rings"
              :key="`reasoning-ring-${ring.level}`"
              class="quality-radar__ring"
              :points="ring.points"
            />
            <line
              v-for="axis in snapshot.reasoningRadar.axes"
              :key="`reasoning-axis-${axis.key}`"
              class="quality-radar__axis"
              x1="110"
              y1="110"
              :x2="axis.axis.x"
              :y2="axis.axis.y"
            />
            <polygon class="quality-radar__area" :points="snapshot.reasoningRadar.polygon" />
            <circle
              v-for="axis in snapshot.reasoningRadar.axes"
              :key="`reasoning-point-${axis.key}`"
              class="quality-radar__point"
              :cx="axis.x"
              :cy="axis.y"
              r="3"
            />
            <text
              v-for="axis in snapshot.reasoningRadar.axes"
              :key="`reasoning-label-${axis.key}`"
              :x="axis.labelPoint.x"
              :y="axis.labelPoint.y"
              text-anchor="middle"
            >{{ axis.label }}</text>
          </svg>

          <div class="metric-list">
            <div v-for="item in snapshot.reasoningMetrics" :key="item.key" class="metric-card metric-card--reasoning">
              <div>
                <span>{{ item.label }}</span>
                <strong>{{ formatQaMetric(item.value) }}</strong>
              </div>
              <div class="metric-track" aria-hidden="true">
                <span :style="{ width: formatQaMetric(item.value) }" />
              </div>
            </div>
            <div v-if="snapshot.reasoningDepth !== null" class="reasoning-depth">
              <span>最长推理路径</span>
              <strong>{{ snapshot.reasoningDepth }} 跳</strong>
            </div>
          </div>
        </div>

        <div v-if="snapshot.routingMetrics.length" class="routing-evaluation">
          <h4>CoT / ToT 推理评估</h4>
          <div class="routing-evaluation__grid">
            <div v-for="item in snapshot.routingMetrics" :key="item.key" class="routing-metric">
              <span>{{ item.label }}</span>
              <strong>{{ formatQaMetric(item.value) }}</strong>
            </div>
          </div>
        </div>
      </section>

      <p v-if="!hasMetrics" class="quality-empty">后端未返回可展示的质量指标</p>

      <section v-if="evaluationEnabled && evaluation" class="evaluation-workspace" aria-label="回答评估">
        <div class="evaluation-entries" role="tablist" aria-label="评估方式">
          <button
            type="button"
            role="tab"
            :aria-selected="evaluation.mode === 'manual'"
            :class="{ active: evaluation.mode === 'manual' }"
            @click="setEvaluationMode('manual')"
          >
            Expert Eval
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="evaluation.mode === 'llm'"
            :class="{ active: evaluation.mode === 'llm' }"
            @click="setEvaluationMode('llm')"
          >
            LLM Judge
          </button>
        </div>

        <ManualEvaluationPanel
          v-if="evaluation.mode === 'manual'"
          :evaluation="evaluation.manual"
          :answer-summary="answerSummary"
          @patch="patchManual"
          @set-verdict="selectVerdict"
          @toggle-issue="toggleIssue"
          @clear-excerpt="patchManual({ selectedExcerpt: '', saveStatus: 'idle', errorMessage: '' })"
          @save="$emit('save-manual')"
        />

        <LlmEvaluationPanel
          v-else-if="evaluation.mode === 'llm'"
          :evaluation="evaluation.llm"
          @run="$emit('run-llm')"
          @save="$emit('save-llm')"
        />
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import LlmEvaluationPanel from './LlmEvaluationPanel.vue'
import ManualEvaluationPanel from './ManualEvaluationPanel.vue'
import {
  setManualVerdict,
  toggleManualIssue
} from './answerEvaluationModel.js'
import {
  buildQaQualitySnapshot,
  formatQaMetric,
  formatQaMetricPrecise
} from './qaQualityModel.js'

const props = defineProps({
  result: {
    type: Object,
    default: null
  },
  evaluation: {
    type: Object,
    default: null
  },
  evaluationEnabled: {
    type: Boolean,
    default: false
  },
  answerSummary: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'close',
  'update:evaluation',
  'save-manual',
  'run-llm',
  'save-llm'
])

const snapshot = computed(() => buildQaQualitySnapshot(props.result || {}))
const metricWidth = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`
const hasMetrics = computed(() => Boolean(
  snapshot.value.answerMetrics.length
  || snapshot.value.reasoningMetrics.length
  || snapshot.value.routingMetrics.length
  || snapshot.value.reasoningDepth !== null
))

function setEvaluationMode(mode) {
  emit('update:evaluation', { mode })
}

function patchManual(patch) {
  emit('update:evaluation', { manual: patch })
}

function selectVerdict(verdict) {
  emit('update:evaluation', setManualVerdict(props.evaluation, verdict))
}

function toggleIssue(issueId) {
  emit('update:evaluation', toggleManualIssue(props.evaluation, issueId))
}
</script>

<style scoped>
.quality-panel {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 0 var(--qa-space-6) var(--qa-space-6);
  border-left: 1px solid var(--qa-border-color);
  background: var(--qa-surface);
}

.quality-panel__header {
  min-height: var(--qa-topbar-h);
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--qa-space-5) 0 var(--qa-space-3);
  border-bottom: 1px solid var(--qa-border-color);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.quality-panel__header span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
  font-weight: 900;
  letter-spacing: 0.14em;
}

.quality-panel__header h2 {
  margin: var(--qa-space-1) 0 0;
  color: var(--qa-heading);
  font-size: var(--qa-heading-size);
  font-weight: var(--qa-weight-heavy);
}

.quality-panel__header button {
  width: var(--qa-control-h);
  height: var(--qa-control-h);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: var(--qa-text);
  cursor: pointer;
}

.quality-panel__body {
  display: grid;
  gap: var(--qa-space-4);
  padding-top: var(--qa-space-4);
}

.quality-section {
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
}

.quality-section__heading,
.quality-section__heading > div {
  min-height: var(--qa-panel-head-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
}

.quality-section__heading > div > span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
  font-weight: 900;
}

.quality-section__heading h3 {
  margin: 0;
  color: var(--qa-heading);
  font-size: var(--qa-font-md);
  font-weight: var(--qa-weight-heavy);
}

.quality-section__heading small {
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
}

.academic-profile {
  display: grid;
  gap: var(--qa-space-3);
  margin-top: var(--qa-space-3);
  padding: var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface);
}

.academic-profile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-3);
}

.academic-profile__header > span {
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
  font-weight: 900;
  text-transform: uppercase;
}

.academic-profile__header > strong {
  min-height: var(--qa-chip-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--qa-space-2);
  border: 1px solid var(--qa-border-strong);
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent-soft);
  color: #075985;
  font-size: var(--qa-font-xs);
  font-weight: 900;
  text-align: right;
}

.academic-profile__layout {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
  gap: var(--qa-space-4);
  align-items: center;
}

.academic-profile__radar {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 210px;
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
}

.academic-profile__domains {
  display: grid;
  gap: var(--qa-space-3);
}

.domain-metric {
  display: grid;
  gap: var(--qa-space-2);
}

.domain-metric__header {
  display: flex;
  justify-content: space-between;
  gap: var(--qa-space-2);
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
  font-weight: var(--qa-weight-heavy);
}

.domain-metric__header strong {
  flex-shrink: 0;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.domain-metric__track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef5;
}

.domain-metric__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.domain-metric--reliability .domain-metric__track i {
  background: #4338ca;
}

.domain-metric--evidence .domain-metric__track i {
  background: #0f766e;
}

.domain-metric--ontology .domain-metric__track i {
  background: #15803d;
}

.domain-metric--risk .domain-metric__track i {
  background: #a16207;
}

.answer-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--qa-space-2);
  margin-top: var(--qa-space-3);
}

.answer-metric-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
  min-height: var(--qa-control-h);
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid #bae6fd;
  border-radius: var(--qa-radius-control);
  background: #f0f9ff;
  color: #0c4a6e;
}

.answer-metric-chip span {
  min-width: 0;
  font-size: var(--qa-font-sm);
  font-weight: 850;
}

.answer-metric-chip strong {
  flex-shrink: 0;
  font-size: var(--qa-control-font);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.answer-metric-chip--excellent {
  border-color: #86efac;
  background: #f0fdf4;
  color: #14532d;
}

.answer-metric-chip--moderate {
  border-color: #fde68a;
  background: #fffbeb;
  color: #713f12;
}

.answer-metric-chip--weak {
  border-color: #fecaca;
  background: #fef2f2;
  color: #7f1d1d;
}

.quality-visual {
  display: grid;
  grid-template-columns: minmax(210px, 0.82fr) minmax(230px, 1.18fr);
  gap: var(--qa-space-4);
  align-items: center;
  margin-top: var(--qa-space-3);
}

.quality-radar {
  width: 100%;
  max-width: 250px;
  margin: 0 auto;
}

.quality-radar__ring,
.quality-radar__axis {
  fill: none;
  stroke: #d9e4eb;
  stroke-width: 1;
}

.quality-radar__area {
  fill: rgba(30, 125, 181, 0.18);
  stroke: #247fb5;
  stroke-width: 2;
}

.quality-radar--reasoning .quality-radar__area {
  fill: rgba(35, 151, 111, 0.16);
  stroke: #28956e;
}

.quality-radar__point {
  fill: #fff;
  stroke: #247fb5;
  stroke-width: 2;
}

.quality-radar--reasoning .quality-radar__point {
  stroke: #28956e;
}

.quality-radar text {
  fill: var(--asc-text);
  font-size: 10px;
  font-weight: 750;
}

.metric-list {
  display: grid;
  gap: var(--qa-space-2);
}

.metric-card {
  padding: var(--qa-space-2) var(--qa-space-3);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
}

.metric-card--reasoning {
  background: var(--qa-success-soft);
}

.metric-card > div:first-child,
.reasoning-depth {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
}

.routing-evaluation {
  margin-top: var(--qa-space-3);
  padding-top: var(--qa-space-3);
  border-top: 1px solid var(--qa-border-color);
}

.routing-evaluation h4 {
  margin: 0 0 var(--qa-space-2);
  color: var(--qa-heading);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
}

.routing-evaluation__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--qa-space-2);
}

.routing-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-2);
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
}

.routing-metric span {
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
}

.routing-metric strong {
  color: #237d5f;
  font-size: var(--qa-control-font);
}

.metric-card span,
.reasoning-depth span {
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
}

.metric-card strong,
.reasoning-depth strong {
  color: var(--qa-heading);
  font-size: var(--qa-control-font);
}

.metric-track {
  height: 4px;
  margin-top: var(--qa-space-2);
  overflow: hidden;
  border-radius: var(--qa-radius-chip);
  background: var(--qa-border-color);
}

.metric-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--qa-accent);
}

.metric-card--reasoning .metric-track span {
  background: var(--qa-success);
}

.reasoning-depth {
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
}

.quality-empty {
  margin: 0;
  padding: var(--qa-space-5);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  text-align: center;
}

.evaluation-entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--qa-space-2);
  margin-bottom: var(--qa-space-4);
  padding: var(--qa-space-1);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
}

.evaluation-entries button {
  min-height: var(--qa-control-h);
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: var(--qa-muted);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
  cursor: pointer;
}

.evaluation-entries button.active {
  background: var(--qa-surface);
  color: var(--qa-accent);
  box-shadow: 0 1px 6px rgba(25, 68, 96, 0.12);
}

.evaluation-workspace {
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
}

button:focus-visible {
  outline: 2px solid #59a8d8;
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .quality-panel {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(680px, 96vw);
    box-shadow: var(--asc-shadow);
  }
}

@media (max-width: 640px) {
  .academic-profile__layout,
  .quality-visual {
    grid-template-columns: 1fr;
  }

  .answer-metric-grid {
    grid-template-columns: 1fr;
  }

  .routing-evaluation__grid {
    grid-template-columns: 1fr;
  }
}
</style>
