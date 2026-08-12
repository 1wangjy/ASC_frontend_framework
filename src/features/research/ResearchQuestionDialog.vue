<template>
  <div v-if="open" class="research-question-backdrop" role="presentation" @mousedown.self="close">
    <section class="research-question-dialog" role="dialog" aria-modal="true" aria-labelledby="research-question-title">
      <header>
        <h2 id="research-question-title">研究问题</h2>
        <p>请说明希望基于所选文献构建和探索的研究问题。该问题将用于生成图谱。</p>
      </header>

      <form novalidate @submit.prevent="submit">
        <label for="graph-project-name-input">图谱名称</label>
        <input
          id="graph-project-name-input"
          v-model="projectName"
          required
          type="text"
          placeholder="例如：project_1"
          aria-describedby="research-question-error"
        />

        <label for="research-question-input">研究问题</label>
        <textarea
          id="research-question-input"
          v-model="question"
          required
          rows="5"
          placeholder="例如：氧化铝-氧化锆复合材料在热震环境下的损伤机制是什么？"
          aria-describedby="research-question-error"
        />
        <div class="recommended-questions" aria-label="推荐研究问题">
          <span>推荐问题</span>
          <button
            v-for="item in recommendations"
            :key="`${item.categoryId}:${item.question}`"
            type="button"
            class="recommended-question"
            :title="item.question"
            @click="selectRecommendation(item.question)"
          >
            <small>{{ item.categoryTitle }}</small>
            <strong>{{ item.question }}</strong>
          </button>
        </div>
        <p v-if="validationError" id="research-question-error" class="error-message" role="alert">{{ validationError }}</p>

        <footer>
          <button type="button" class="secondary" @click="close">取消</button>
          <button type="submit" class="primary">开始构建</button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { createResearchQuestionSuggestions } from '../qa/questionGuideModel.js'
import { validateResearchBuildDialogSubmission } from './researchQuestionWorkflow.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  defaultProjectName: {
    type: String,
    default: 'project_1'
  }
})

const emit = defineEmits(['close', 'submit'])
const projectName = ref('')
const question = ref('')
const validationError = ref('')
const recommendations = ref(createResearchQuestionSuggestions())

watch(
  () => props.open,
  (open) => {
    if (open) {
      projectName.value = props.defaultProjectName
      question.value = ''
      validationError.value = ''
      recommendations.value = createResearchQuestionSuggestions()
    }
  },
  { immediate: true }
)

function selectRecommendation(recommendedQuestion) {
  question.value = recommendedQuestion
  validationError.value = ''
}

function close() {
  projectName.value = ''
  question.value = ''
  validationError.value = ''
  emit('close')
}

function submit() {
  const result = validateResearchBuildDialogSubmission({
    projectName: projectName.value,
    question: question.value
  })
  if (!result.canSubmit) {
    validationError.value = result.error
    return
  }

  emit('submit', result)
}
</script>

<style scoped>
.research-question-backdrop {
  position: fixed;
  z-index: 60;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(7, 38, 62, 0.48);
}

.research-question-dialog {
  width: min(560px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  border-radius: 10px;
  background: #fff;
  box-shadow: var(--asc-shadow);
}

header {
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--asc-border);
}

h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 18px;
}

header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

form {
  padding: 22px;
}

label {
  display: block;
  margin-bottom: 7px;
  color: var(--asc-heading);
  font-size: 11px;
  font-weight: 750;
}

input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  outline: 0;
  font: inherit;
  font-size: 12px;
  resize: vertical;
}

textarea:focus {
  border-color: #75afd1;
}

input:focus {
  border-color: #75afd1;
}

input { margin-bottom: 16px; }

.recommended-questions {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.recommended-questions > span {
  color: var(--asc-muted);
  font-size: 10px;
  font-weight: 750;
}

.recommended-question {
  display: grid;
  grid-template-columns: 102px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dbe7ef;
  border-radius: 6px;
  background: #f8fbfd;
  color: var(--asc-heading);
  text-align: left;
  cursor: pointer;
}

.recommended-question:hover,
.recommended-question:focus-visible {
  border-color: #75afd1;
  background: var(--asc-primary-soft);
  outline: none;
}

.recommended-question small {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 750;
}

.recommended-question strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-message {
  margin: 14px 0 0;
  padding: 9px 10px;
  border-radius: 6px;
  background: #fff1ef;
  color: #a53d33;
  font-size: 10px;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

footer button {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 750;
}

.secondary {
  border: 1px solid var(--asc-border);
  background: #fff;
}

.primary {
  border: 0;
  background: var(--asc-primary);
  color: #fff;
}

@media (max-width: 560px) {
  .recommended-question {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}
</style>
