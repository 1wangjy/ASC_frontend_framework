<template>
  <section class="manual-review" aria-labelledby="manual-review-title">
    <div class="review-heading">
      <div>
        <span>人工评审</span>
        <h3 id="manual-review-title">这条回答是否准确？</h3>
      </div>
      <small>二分类评审</small>
    </div>

    <section v-if="answerSummary" class="answer-summary-card">
      <span>回答摘要</span>
      <p>{{ answerSummary }}</p>
    </section>

    <fieldset class="verdict-fieldset" :disabled="disabled || evaluation.saveStatus === 'saving'">
      <legend class="sr-only">选择评审结果</legend>
      <button
        type="button"
        class="verdict verdict--accurate"
        :class="{ 'verdict--selected': evaluation.verdict === 'accurate' }"
        :aria-pressed="evaluation.verdict === 'accurate'"
        @click="$emit('set-verdict', 'accurate')"
      >
        <span aria-hidden="true">✓</span>
        准确
      </button>
      <button
        type="button"
        class="verdict verdict--inaccurate"
        :class="{ 'verdict--selected': evaluation.verdict === 'inaccurate' }"
        :aria-pressed="evaluation.verdict === 'inaccurate'"
        @click="$emit('set-verdict', 'inaccurate')"
      >
        <span aria-hidden="true">!</span>
        不准确
      </button>
    </fieldset>

    <div v-if="evaluation.verdict === 'accurate'" class="accurate-note">
      <span aria-hidden="true">✓</span>
      <p>回答内容与当前证据一致，可直接保存评审结果。</p>
    </div>

    <div v-if="evaluation.verdict === 'inaccurate'" class="diagnosis">
      <section class="diagnosis-block">
        <div class="block-title">
          <div>
            <strong>问题片段</strong>
            <small>选填</small>
          </div>
          <button
            v-if="evaluation.selectedExcerpt"
            type="button"
            @click="$emit('clear-excerpt')"
          >
            移除
          </button>
        </div>
        <blockquote v-if="evaluation.selectedExcerpt">{{ evaluation.selectedExcerpt }}</blockquote>
        <p v-else class="empty-excerpt">可在左侧回答中框选有问题的文字，也可以不框选直接提交。</p>
      </section>

      <section class="diagnosis-block">
        <div class="block-title">
          <div>
            <strong>错误类型</strong>
            <small>可多选</small>
          </div>
        </div>
        <div class="issue-list">
          <button
            v-for="issue in manualIssueOptions"
            :key="issue.id"
            type="button"
            :class="{ active: evaluation.issueTypes.includes(issue.id) }"
            :aria-pressed="evaluation.issueTypes.includes(issue.id)"
            @click="$emit('toggle-issue', issue.id)"
          >
            {{ issue.label }}
          </button>
        </div>
      </section>

      <label class="comment-field">
        <span>评审说明 <small>选填</small></span>
        <textarea
          :value="evaluation.comment"
          rows="4"
          maxlength="600"
          placeholder="补充错误原因或修改建议…"
          @input="$emit('patch', {
            comment: $event.target.value,
            saveStatus: 'idle',
            errorMessage: ''
          })"
        />
      </label>
    </div>

    <div v-if="evaluation.verdict" class="review-actions">
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
            : '保存人工评估' }}
      </button>
      <p v-if="evaluation.saveStatus === 'success'" class="status status--success" role="status">
        人工评估已保存
      </p>
      <p v-if="evaluation.saveStatus === 'error'" class="status status--error" role="alert">
        {{ evaluation.errorMessage }}
      </p>
    </div>
  </section>
</template>

<script setup>
import { manualIssueOptions } from './answerEvaluationModel.js'

defineProps({
  evaluation: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  answerSummary: {
    type: String,
    default: ''
  }
})

defineEmits(['patch', 'set-verdict', 'toggle-issue', 'clear-excerpt', 'save'])
</script>

<style scoped>
.manual-review {
  display: grid;
  gap: var(--qa-space-4);
}

.review-heading,
.block-title {
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
  line-height: 1.45;
}

.review-heading > small {
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

.verdict-fieldset {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--qa-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.answer-summary-card {
  padding: var(--qa-space-3);
  border-left: 3px solid #69aeda;
  border-radius: 0 var(--qa-radius-control) var(--qa-radius-control) 0;
  background: var(--qa-accent-soft);
}

.answer-summary-card span {
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  font-weight: 850;
}

.answer-summary-card p {
  display: -webkit-box;
  margin: var(--qa-space-2) 0 0;
  overflow: hidden;
  color: var(--qa-text);
  font-size: var(--qa-control-font);
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.verdict {
  min-height: var(--qa-control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--qa-space-2);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  color: var(--qa-text);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-bold);
  cursor: pointer;
}

.verdict span {
  width: var(--qa-space-5);
  height: var(--qa-space-5);
  display: grid;
  place-items: center;
  border-radius: var(--qa-radius-chip);
  background: var(--qa-surface-soft);
  font-size: var(--qa-font-xs);
}

.verdict--accurate.verdict--selected {
  border-color: #58ae89;
  background: #f0faf5;
  color: #187653;
  box-shadow: inset 0 0 0 1px #58ae89;
}

.verdict--accurate.verdict--selected span {
  background: #d8f2e5;
}

.verdict--inaccurate.verdict--selected {
  border-color: #df8c65;
  background: #fff6f1;
  color: #a64a25;
  box-shadow: inset 0 0 0 1px #df8c65;
}

.verdict--inaccurate.verdict--selected span {
  background: #ffe4d7;
}

.accurate-note {
  display: grid;
  grid-template-columns: var(--qa-chip-h) 1fr;
  gap: var(--qa-space-2);
  align-items: start;
  padding: var(--qa-space-3);
  border: 1px solid #d8eee4;
  border-radius: var(--qa-radius-control);
  background: var(--qa-success-soft);
  color: #356b56;
}

.accurate-note > span {
  width: var(--qa-chip-h);
  height: var(--qa-chip-h);
  display: grid;
  place-items: center;
  border-radius: var(--qa-radius-chip);
  background: #d9f1e4;
  font-size: var(--qa-font-xs);
  font-weight: 900;
}

.accurate-note p,
.empty-excerpt {
  margin: var(--qa-space-1) 0 0;
  font-size: var(--qa-control-font);
  line-height: 1.6;
}

.diagnosis {
  display: grid;
  gap: var(--qa-space-3);
  padding: var(--qa-panel-pad);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-card);
  background: var(--qa-surface-soft);
}

.diagnosis-block {
  display: grid;
  gap: var(--qa-space-2);
}

.block-title strong,
.comment-field > span {
  color: var(--qa-heading);
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
}

.block-title small,
.comment-field small {
  margin-left: var(--qa-space-1);
  color: var(--qa-muted);
  font-size: var(--qa-font-xs);
  font-weight: 500;
}

.block-title > button {
  min-height: var(--qa-control-h-sm);
  padding: 0 var(--qa-space-2);
  border: 0;
  border-radius: var(--qa-radius-control);
  background: transparent;
  color: var(--qa-accent);
  font-size: var(--qa-font-sm);
  cursor: pointer;
}

blockquote {
  margin: 0;
  padding: var(--qa-space-2) var(--qa-space-3);
  border-left: 3px solid #69aeda;
  border-radius: 0 var(--qa-radius-control) var(--qa-radius-control) 0;
  background: var(--qa-surface);
  color: #345069;
  font-size: var(--qa-control-font);
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.empty-excerpt {
  padding: var(--qa-space-2) var(--qa-space-3);
  border: 1px dashed var(--qa-border-strong);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  color: var(--qa-muted);
}

.issue-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--qa-space-2);
}

.issue-list button {
  min-height: var(--qa-control-h);
  padding: 0 var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-chip);
  background: var(--qa-surface);
  color: #536b80;
  font-size: var(--qa-control-font);
  cursor: pointer;
}

.issue-list button.active {
  border-color: #df8c65;
  background: #fff0e8;
  color: #9c4523;
  font-weight: var(--qa-weight-bold);
}

.comment-field {
  display: grid;
  gap: var(--qa-space-2);
}

.comment-field textarea {
  width: 100%;
  resize: vertical;
  min-height: 82px;
  padding: var(--qa-space-3);
  border: 1px solid var(--qa-border-color);
  border-radius: var(--qa-radius-control);
  background: var(--qa-surface);
  color: var(--qa-text);
  font: inherit;
  font-size: var(--qa-control-font);
  line-height: 1.55;
}

.review-actions {
  display: grid;
  gap: var(--qa-space-2);
}

.save-button {
  min-height: var(--qa-control-h);
  border: 1px solid var(--qa-accent);
  border-radius: var(--qa-radius-control);
  background: var(--qa-accent);
  color: #fff;
  font-size: var(--qa-control-font);
  font-weight: var(--qa-weight-heavy);
  cursor: pointer;
}

.save-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.status {
  margin: 0;
  font-size: var(--qa-font-sm);
  text-align: center;
}

.status--success { color: #21815e; }
.status--error { color: #b54b31; }

button:focus-visible,
textarea:focus-visible {
  outline: 2px solid #59a8d8;
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
