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
  gap: 16px;
}

.review-heading,
.block-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-heading > div > span {
  color: var(--asc-primary);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.review-heading h3 {
  margin: 4px 0 0;
  color: var(--asc-heading);
  font-size: 15px;
  line-height: 1.45;
}

.review-heading > small {
  padding: 4px 7px;
  border-radius: 999px;
  background: #eff6fb;
  color: #5d7890;
  font-size: 11px;
  white-space: nowrap;
}

.verdict-fieldset {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}

.answer-summary-card {
  padding: 12px;
  border-left: 3px solid #69aeda;
  border-radius: 0 8px 8px 0;
  background: #f4f9fc;
}

.answer-summary-card span {
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 850;
}

.answer-summary-card p {
  display: -webkit-box;
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--asc-text);
  font-size: 13px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.verdict {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: var(--asc-text);
  font-size: 13px;
  font-weight: 780;
}

.verdict span {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eef3f7;
  font-size: 11px;
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
  grid-template-columns: 24px 1fr;
  gap: 9px;
  align-items: start;
  padding: 12px;
  border: 1px solid #d8eee4;
  border-radius: 8px;
  background: #f4fbf7;
  color: #356b56;
}

.accurate-note > span {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #d9f1e4;
  font-size: 11px;
  font-weight: 900;
}

.accurate-note p,
.empty-excerpt {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.6;
}

.diagnosis {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e5ecf2;
  border-radius: 9px;
  background: #f8fafc;
}

.diagnosis-block {
  display: grid;
  gap: 9px;
}

.block-title strong,
.comment-field > span {
  color: var(--asc-heading);
  font-size: 13px;
  font-weight: 800;
}

.block-title small,
.comment-field small {
  margin-left: 4px;
  color: var(--asc-muted);
  font-size: 11px;
  font-weight: 500;
}

.block-title > button {
  border: 0;
  background: transparent;
  color: var(--asc-primary);
  font-size: 12px;
}

blockquote {
  margin: 0;
  padding: 10px 11px;
  border-left: 3px solid #69aeda;
  border-radius: 0 6px 6px 0;
  background: #fff;
  color: #345069;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.empty-excerpt {
  padding: 10px 11px;
  border: 1px dashed #cfdce7;
  border-radius: 6px;
  background: #fff;
  color: var(--asc-muted);
}

.issue-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.issue-list button {
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid #d5e1ea;
  border-radius: 999px;
  background: #fff;
  color: #536b80;
  font-size: 13px;
}

.issue-list button.active {
  border-color: #df8c65;
  background: #fff0e8;
  color: #9c4523;
  font-weight: 760;
}

.comment-field {
  display: grid;
  gap: 8px;
}

.comment-field textarea {
  width: 100%;
  resize: vertical;
  min-height: 82px;
  padding: 10px 11px;
  border: 1px solid #d5e1ea;
  border-radius: 7px;
  background: #fff;
  color: var(--asc-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.review-actions {
  display: grid;
  gap: 8px;
}

.save-button {
  min-height: 40px;
  border: 1px solid var(--asc-primary);
  border-radius: 7px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.save-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.status {
  margin: 0;
  font-size: 12px;
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
