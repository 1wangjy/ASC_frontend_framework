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
  padding: 0 22px 24px;
  border-left: 1px solid var(--asc-border);
  background: #fff;
}

.quality-panel__header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0 15px;
  border-bottom: 1px solid var(--asc-border);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.quality-panel__header span {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.quality-panel__header h2 {
  margin: 3px 0 0;
  color: var(--asc-heading);
  font-size: 18px;
}

.quality-panel__header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: #f3f7fa;
  color: var(--asc-text);
}

.quality-panel__body {
  display: grid;
  gap: 16px;
  padding-top: 18px;
}

.quality-section {
  padding: 15px;
  border: 1px solid var(--asc-border);
  border-radius: 11px;
  background: #fbfdfe;
}

.quality-section__heading,
.quality-section__heading > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quality-section__heading > div > span {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 900;
}

.quality-section__heading h3 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 14px;
}

.quality-section__heading small {
  color: var(--asc-muted);
  font-size: 12px;
}

.academic-profile {
  display: grid;
  gap: 12px;
  margin-top: 13px;
  padding: 12px;
  border: 1px solid #d7e3ee;
  border-radius: 8px;
  background: #fbfcfe;
}

.academic-profile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.academic-profile__header > span {
  color: #475569;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.academic-profile__header > strong {
  padding: 4px 8px;
  border: 1px solid #b7d4e8;
  border-radius: 8px;
  background: #f0f7fc;
  color: #075985;
  font-size: 11px;
  font-weight: 900;
  text-align: right;
}

.academic-profile__layout {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.academic-profile__radar {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 210px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.academic-profile__domains {
  display: grid;
  gap: 12px;
}

.domain-metric {
  display: grid;
  gap: 6px;
}

.domain-metric__header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
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
  gap: 8px;
  margin-top: 12px;
}

.answer-metric-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  background: #f0f9ff;
  color: #0c4a6e;
}

.answer-metric-chip span {
  min-width: 0;
  font-size: 12px;
  font-weight: 850;
}

.answer-metric-chip strong {
  flex-shrink: 0;
  font-size: 13px;
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
  gap: 14px;
  align-items: center;
  margin-top: 13px;
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
  gap: 8px;
}

.metric-card {
  padding: 9px 10px;
  border-radius: 8px;
  background: #f0f6fa;
}

.metric-card--reasoning {
  background: #f0f7f4;
}

.metric-card > div:first-child,
.reasoning-depth {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.routing-evaluation {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid #d7e8df;
}

.routing-evaluation h4 {
  margin: 0 0 9px;
  color: var(--asc-heading);
  font-size: 13px;
}

.routing-evaluation__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.routing-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #d7e8df;
  border-radius: 8px;
  background: #fff;
}

.routing-metric span {
  color: var(--asc-text);
  font-size: 12px;
}

.routing-metric strong {
  color: #237d5f;
  font-size: 13px;
}

.metric-card span,
.reasoning-depth span {
  color: var(--asc-text);
  font-size: 12px;
}

.metric-card strong,
.reasoning-depth strong {
  color: var(--asc-heading);
  font-size: 13px;
}

.metric-track {
  height: 4px;
  margin-top: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #dce8ef;
}

.metric-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--asc-primary);
}

.metric-card--reasoning .metric-track span {
  background: #28956e;
}

.reasoning-depth {
  padding: 10px;
  border: 1px solid #d7e8df;
  border-radius: 8px;
  background: #fff;
}

.quality-empty {
  margin: 0;
  padding: 20px;
  border-radius: 9px;
  background: #f5f7f9;
  color: var(--asc-muted);
  font-size: 12px;
  text-align: center;
}

.evaluation-entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: #f3f6f8;
}

.evaluation-entries button {
  min-height: 42px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--asc-muted);
  font-size: 13px;
  font-weight: 800;
}

.evaluation-entries button.active {
  background: #fff;
  color: var(--asc-primary);
  box-shadow: 0 1px 6px rgba(25, 68, 96, 0.12);
}

.evaluation-workspace {
  padding: 15px;
  border: 1px solid var(--asc-border);
  border-radius: 11px;
  background: #fbfdfe;
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
