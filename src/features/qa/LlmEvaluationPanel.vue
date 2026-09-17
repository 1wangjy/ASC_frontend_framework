<template>
  <section class="llm-review" aria-labelledby="llm-review-title">
    <div class="review-heading">
      <div>
        <span>模型复核</span>
        <h3 id="llm-review-title">LLM 回答评估</h3>
      </div>
      <small>独立评估</small>
    </div>

    <div v-if="evaluation.runStatus === 'idle'" class="empty-state">
      <div class="model-mark" aria-hidden="true">AI</div>
      <strong>检查回答与证据的一致性</strong>
      <p>从证据关联、内容完整性和表述风险三个方向生成结构化建议。</p>
      <button type="button" :disabled="disabled" @click="$emit('run')">开始 LLM 评估</button>
    </div>

    <div v-else-if="evaluation.runStatus === 'loading'" class="loading-state" role="status">
      <div class="loading-orbit" aria-hidden="true"><span /></div>
      <strong>正在评估回答与引用证据…</strong>
      <p>正在核对结论、引用关系与可能遗漏的边界条件。</p>
      <div class="skeleton"><span /><span /><span /></div>
    </div>

    <div v-else-if="evaluation.runStatus === 'error'" class="error-state" role="alert">
      <span aria-hidden="true">!</span>
      <strong>本次评估未完成</strong>
      <p>{{ evaluation.errorMessage }}</p>
      <button type="button" :disabled="disabled" @click="$emit('run')">重新评估</button>
    </div>

    <div v-else-if="evaluation.runStatus === 'success' && evaluation.result" class="result-stack">
      <section class="summary-card">
        <div class="summary-card__top">
          <span>总体结论</span>
          <small v-if="evaluation.result.isDemo">演示数据</small>
          <small
            v-else
            class="source-badge"
            :class="`source-badge--${evaluation.result.sourceKind}`"
          >
            {{ evaluation.result.sourceLabel }}
          </small>
        </div>
        <strong>{{ evaluation.result.confidenceLabel }}</strong>
        <p>{{ evaluation.result.summary }}</p>
        <p
          v-if="evaluation.result.sourceDescription"
          class="source-description"
          :class="{ 'source-description--warning': evaluation.result.sourceKind === 'heuristic' }"
        >
          {{ evaluation.result.sourceDescription }}
          <span v-if="evaluation.result.sourceKind === 'heuristic'" class="visually-hidden">
            规则兜底评估
          </span>
        </p>
      </section>

      <section v-if="evaluation.result.dimensions.length" class="result-card">
        <h4>评估维度</h4>
        <div class="dimension-list">
          <div v-for="dimension in evaluation.result.dimensions" :key="dimension.label">
            <span>{{ dimension.label }}</span>
            <strong>{{ dimension.result }}</strong>
          </div>
        </div>
      </section>

      <section v-if="evaluation.result.risks.length" class="result-card">
        <h4>风险提示</h4>
        <ul class="risk-list">
          <li v-for="risk in evaluation.result.risks" :key="risk">{{ risk }}</li>
        </ul>
      </section>

      <section v-if="evaluation.result.suggestions.length" class="result-card">
        <h4>修改建议</h4>
        <ol class="suggestion-list">
          <li v-for="suggestion in evaluation.result.suggestions" :key="suggestion">{{ suggestion }}</li>
        </ol>
      </section>

      <div class="result-meta">
        <span>{{ evaluation.result.model }} · {{ evaluation.result.version }}</span>
        <time :datetime="evaluation.result.evaluatedAt">{{ formatTime(evaluation.result.evaluatedAt) }}</time>
      </div>

      <p v-if="evaluation.result.autoRecorded" class="record-note" role="status">
        本次模型评估已由后端自动记录；下方操作会将结果另存为反馈记录。
      </p>

      <button
        type="button"
        class="save-button"
        :disabled="disabled || evaluation.saveStatus === 'saving'"
        @click="$emit('save')"
      >
        {{ evaluation.saveStatus === 'saving'
            ? '正在保存…'
          : evaluation.saveStatus === 'error'
            ? '重新保存'
            : evaluation.result.autoRecorded
              ? '另存为反馈记录'
              : '保存 LLM 评估结果' }}
      </button>
      <p v-if="evaluation.saveStatus === 'success'" class="status status--success" role="status">
        {{ evaluation.result.autoRecorded ? '已另存为反馈记录' : 'LLM 评估结果已保存' }}
      </p>
      <p v-if="evaluation.saveStatus === 'error'" class="status status--error" role="alert">
        {{ evaluation.saveErrorMessage }}
      </p>
    </div>
  </section>
</template>

<script setup>
defineProps({
  evaluation: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['run', 'save'])

function formatTime(value) {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<style scoped>
.llm-review {
  display: grid;
  gap: var(--qa-space-4);
}

.review-heading,
.summary-card__top,
.result-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--qa-space-3);
}

.review-heading > div > span {
  color: var(--qa-accent);
  font-size: var(--qa-font-xs);
  font-weight: 850;
  letter-spacing: 0.08em;
}

.review-heading h3 {
  margin: var(--qa-space-1) 0 0;
  color: var(--qa-heading);
  font-size: var(--qa-title-size);
  font-weight: var(--qa-weight-heavy);
}

.review-heading > small,
.summary-card__top small {
  min-height: var(--qa-chip-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--qa-space-2);
  border-radius: var(--qa-radius-chip);
  background: var(--qa-surface-soft);
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
  white-space: nowrap;
}

.empty-state,
.loading-state,
.error-state {
  display: grid;
  justify-items: center;
  padding: var(--qa-space-5) var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
  text-align: center;
}

.model-mark,
.error-state > span {
  width: var(--qa-space-10);
  height: var(--qa-space-10);
  display: grid;
  place-items: center;
  margin-bottom: var(--qa-space-3);
  border-radius: var(--qa-radius-card);
  background: var(--qa-accent-soft);
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  font-weight: 900;
}

.empty-state strong,
.loading-state strong,
.error-state strong {
  color: var(--qa-heading);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
}

.empty-state p,
.loading-state p,
.error-state p {
  margin: var(--qa-space-2) 0 var(--qa-space-4);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  line-height: 1.6;
}

.empty-state button,
.error-state button,
.save-button {
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-space-4);
  border: 1px solid var(--qa-accent);
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent);
  color: #fff;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
  cursor: pointer;
}

.loading-orbit {
  width: var(--qa-space-10);
  height: var(--qa-space-10);
  display: grid;
  place-items: center;
  margin-bottom: var(--qa-space-3);
  border: 2px solid var(--qa-border-color);
  border-top-color: var(--qa-accent);
  border-radius: var(--qa-radius-chip);
  animation: rotate 0.9s linear infinite;
}

.loading-orbit span {
  width: var(--qa-space-2);
  height: var(--qa-space-2);
  border-radius: var(--qa-radius-chip);
  background: var(--qa-accent);
}

.skeleton {
  width: 100%;
  display: grid;
  gap: var(--qa-space-2);
}

.skeleton span {
  height: 9px;
  border-radius: var(--qa-space-1);
  background: var(--qa-border-color);
}

.skeleton span:nth-child(2) { width: 86%; }
.skeleton span:nth-child(3) { width: 67%; }

.error-state {
  border-color: #f0d6cb;
  background: #fff8f4;
}

.error-state > span {
  background: #ffe5da;
  color: #b4512c;
}

.result-stack {
  display: grid;
  gap: var(--qa-space-2);
}

.summary-card,
.result-card {
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface);
}

.summary-card {
  border-color: var(--qa-border-strong);
  background: linear-gradient(145deg, #f3faff, #fff);
}

.summary-card__top > span,
.result-card h4 {
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  font-weight: 850;
  letter-spacing: 0.04em;
}

.summary-card > strong {
  display: block;
  margin-top: var(--qa-space-2);
  color: var(--qa-heading);
  font-size: var(--qa-font-md);
  font-weight: var(--qa-weight-heavy);
  line-height: 1.45;
}

.summary-card > p {
  margin: var(--qa-space-2) 0 0;
  color: var(--qa-text);
  font-size: var(--qa-control-font);
  line-height: 1.65;
}

.summary-card .source-description {
  margin-top: var(--qa-space-2);
  padding: var(--qa-space-2);
  border-radius: var(--qa-radius-control);
  background: var(--qa-success-soft);
  color: #28775e;
  font-size: var(--qa-font-sm);
}

.summary-card .source-description--warning {
  background: var(--qa-warning-soft);
  color: #9a5a18;
}

.source-badge--llm {
  background: #e8f7ef !important;
  color: #237458 !important;
}

.source-badge--heuristic {
  background: #fff0dc !important;
  color: #9a5a18 !important;
}

.result-card h4 {
  margin: 0 0 var(--qa-space-3);
}

.dimension-list {
  display: grid;
  gap: var(--qa-space-2);
}

.dimension-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--qa-space-3);
  padding: var(--qa-space-2) var(--qa-space-2);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
}

.dimension-list strong {
  color: #28775e;
  font-size: var(--qa-font-sm);
}

.risk-list,
.suggestion-list {
  display: grid;
  gap: var(--qa-space-2);
  margin: 0;
  padding-left: var(--qa-space-5);
  color: var(--qa-text);
  font-size: var(--qa-font-sm);
  line-height: 1.55;
}

.risk-list li::marker { color: #da7445; }
.suggestion-list li::marker { color: var(--qa-accent); font-weight: var(--qa-weight-heavy); }

.suggestion-list li {
  white-space: pre-line;
}

.result-meta {
  align-items: center;
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
}

.save-button {
  width: 100%;
}

.record-note {
  margin: 0;
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface-soft);
  color: var(--qa-muted);
  font-size: var(--qa-font-sm);
  line-height: 1.55;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

button:focus-visible {
  outline: 2px solid #59a8d8;
  outline-offset: 2px;
}

.status {
  margin: calc(var(--qa-space-1) * -1) 0 0;
  font-size: var(--qa-font-sm);
  text-align: center;
}

.status--success { color: #21815e; }
.status--error { color: #b54b31; }

@keyframes rotate {
  to { transform: rotate(360deg); }
}
</style>
