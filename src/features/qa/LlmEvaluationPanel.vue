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
        </div>
        <strong>{{ evaluation.result.confidenceLabel }}</strong>
        <p>{{ evaluation.result.summary }}</p>
      </section>

      <section class="result-card">
        <h4>评估维度</h4>
        <div class="dimension-list">
          <div v-for="dimension in evaluation.result.dimensions" :key="dimension.label">
            <span>{{ dimension.label }}</span>
            <strong>{{ dimension.result }}</strong>
          </div>
        </div>
      </section>

      <section class="result-card">
        <h4>风险提示</h4>
        <ul class="risk-list">
          <li v-for="risk in evaluation.result.risks" :key="risk">{{ risk }}</li>
        </ul>
      </section>

      <section class="result-card">
        <h4>修改建议</h4>
        <ol class="suggestion-list">
          <li v-for="suggestion in evaluation.result.suggestions" :key="suggestion">{{ suggestion }}</li>
        </ol>
      </section>

      <div class="result-meta">
        <span>{{ evaluation.result.model }} · {{ evaluation.result.version }}</span>
        <time :datetime="evaluation.result.evaluatedAt">{{ formatTime(evaluation.result.evaluatedAt) }}</time>
      </div>

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
            : '保存 LLM 评估结果' }}
      </button>
      <p v-if="evaluation.saveStatus === 'success'" class="status status--success" role="status">
        LLM 评估结果已保存
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
  gap: 15px;
}

.review-heading,
.summary-card__top,
.result-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-heading > div > span {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.review-heading h3 {
  margin: 4px 0 0;
  color: var(--asc-heading);
  font-size: 15px;
}

.review-heading > small,
.summary-card__top small {
  padding: 4px 7px;
  border-radius: 999px;
  background: #eff6fb;
  color: #5d7890;
  font-size: 9px;
  white-space: nowrap;
}

.empty-state,
.loading-state,
.error-state {
  display: grid;
  justify-items: center;
  padding: 22px 16px;
  border: 1px solid var(--asc-border);
  border-radius: 9px;
  background: #f8fbfd;
  text-align: center;
}

.model-mark,
.error-state > span {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  margin-bottom: 11px;
  border-radius: 12px;
  background: #e5f3fc;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 900;
}

.empty-state strong,
.loading-state strong,
.error-state strong {
  color: var(--asc-heading);
  font-size: 13px;
}

.empty-state p,
.loading-state p,
.error-state p {
  margin: 7px 0 15px;
  color: var(--asc-muted);
  font-size: 10px;
  line-height: 1.6;
}

.empty-state button,
.error-state button,
.save-button {
  min-height: 39px;
  padding: 0 16px;
  border: 1px solid var(--asc-primary);
  border-radius: 7px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

.loading-orbit {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  margin-bottom: 11px;
  border: 2px solid #cfe5f3;
  border-top-color: var(--asc-primary);
  border-radius: 50%;
  animation: rotate 0.9s linear infinite;
}

.loading-orbit span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--asc-primary);
}

.skeleton {
  width: 100%;
  display: grid;
  gap: 7px;
}

.skeleton span {
  height: 9px;
  border-radius: 4px;
  background: #e2ebf1;
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
  gap: 10px;
}

.summary-card,
.result-card {
  padding: 13px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
}

.summary-card {
  border-color: #bcdcec;
  background: linear-gradient(145deg, #f3faff, #fff);
}

.summary-card__top > span,
.result-card h4 {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.04em;
}

.summary-card > strong {
  display: block;
  margin-top: 9px;
  color: var(--asc-heading);
  font-size: 14px;
  line-height: 1.45;
}

.summary-card > p {
  margin: 7px 0 0;
  color: var(--asc-text);
  font-size: 10px;
  line-height: 1.65;
}

.result-card h4 {
  margin: 0 0 10px;
}

.dimension-list {
  display: grid;
  gap: 7px;
}

.dimension-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 9px;
  border-radius: 6px;
  background: #f5f8fa;
  color: var(--asc-text);
  font-size: 10px;
}

.dimension-list strong {
  color: #28775e;
  font-size: 10px;
}

.risk-list,
.suggestion-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: var(--asc-text);
  font-size: 10px;
  line-height: 1.55;
}

.risk-list li::marker { color: #da7445; }
.suggestion-list li::marker { color: var(--asc-primary); font-weight: 800; }

.result-meta {
  align-items: center;
  color: var(--asc-muted);
  font-size: 9px;
}

.save-button {
  width: 100%;
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
  margin: -2px 0 0;
  font-size: 10px;
  text-align: center;
}

.status--success { color: #21815e; }
.status--error { color: #b54b31; }

@keyframes rotate {
  to { transform: rotate(360deg); }
}
</style>
