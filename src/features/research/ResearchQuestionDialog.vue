<template>
  <div v-if="open" class="research-question-backdrop" role="presentation" @mousedown.self="close">
    <section class="research-question-dialog" role="dialog" aria-modal="true" aria-labelledby="research-question-title">
      <header>
        <h2 id="research-question-title">研究问题</h2>
        <p>请说明希望基于所选文献构建和探索的研究问题。该问题将用于生成图谱。</p>
      </header>

      <form @submit.prevent="submit">
        <label for="research-question-input">研究问题</label>
        <textarea
          id="research-question-input"
          v-model="question"
          required
          rows="5"
          placeholder="例如：氧化铝-氧化锆复合材料在热震环境下的损伤机制是什么？"
          aria-describedby="research-question-error"
        />
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
import { normalizeResearchQuestion } from './researchQuestionWorkflow.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'submit'])
const question = ref('')
const validationError = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) validationError.value = ''
  }
)

function close() {
  validationError.value = ''
  emit('close')
}

function submit() {
  const normalizedQuestion = normalizeResearchQuestion(question.value)
  if (!normalizedQuestion) {
    validationError.value = '请先填写研究问题。'
    return
  }

  emit('submit', normalizedQuestion)
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
  overflow: hidden;
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
</style>
