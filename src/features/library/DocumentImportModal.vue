<template>
  <div v-if="mode" class="modal-backdrop" role="presentation" @mousedown.self="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header>
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p>{{ description }}</p>
        </div>
        <button type="button" aria-label="关闭导入窗口" @click="$emit('close')">
          <AscIcon name="close" />
        </button>
      </header>

      <form @submit.prevent="complete">
        <label v-if="mode === 'doi'">
          <span>DOI</span>
          <input v-model="value" required placeholder="例如 10.1016/j.ceramint.2024.12.001" />
        </label>

        <label v-else class="file-drop">
          <AscIcon name="paperclip" />
          <strong>{{ value || (mode === 'batch' ? '选择 BibTeX / CSV 文件' : '选择 PDF 文献') }}</strong>
          <span>{{ mode === 'batch' ? '支持 .bib、.csv' : '支持单篇或多篇 PDF' }}</span>
          <input
            type="file"
            :accept="mode === 'batch' ? '.bib,.csv' : '.pdf'"
            :multiple="mode === 'upload'"
            required
            @change="selectFile"
          />
        </label>

        <p v-if="completed" class="success-message">
          <AscIcon name="check" />
          已完成前端模拟导入，元数据将在接入接口后写入文献库。
        </p>

        <footer>
          <button type="button" class="secondary" @click="$emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="!value">
            {{ completed ? '再次导入' : '开始导入' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  mode: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'complete'])
const value = ref('')
const completed = ref(false)
const titleId = 'document-import-title'

const title = computed(() => ({
  doi: '导入 DOI',
  batch: '批量导入',
  upload: '上传文献'
}[props.mode] || '导入文献'))

const description = computed(() => ({
  doi: '输入 DOI 后将自动补全标题、作者、年份和期刊信息。',
  batch: '通过 BibTeX 或 CSV 一次导入多条文献元数据。',
  upload: '上传 PDF 后进入解析、切片和 QA 索引流程。'
}[props.mode] || ''))

watch(
  () => props.mode,
  () => {
    value.value = ''
    completed.value = false
  }
)

function selectFile(event) {
  const files = [...event.target.files]
  value.value = files.map(file => file.name).join('、')
}

function complete() {
  if (!value.value) return
  completed.value = true
  emit('complete', { mode: props.mode, value: value.value })
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  z-index: 60;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(7, 38, 62, 0.48);
}

.modal {
  width: min(520px, 100%);
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  box-shadow: var(--asc-shadow);
}

.modal > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--asc-border);
}

.modal h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 18px;
}

.modal header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

.modal header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--asc-text);
  font-size: 18px;
}

.modal form {
  padding: 22px;
}

.modal label > span {
  display: block;
  margin-bottom: 7px;
  color: var(--asc-heading);
  font-size: 11px;
  font-weight: 750;
}

.modal input:not([type="file"]) {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  outline: 0;
  font-size: 12px;
}

.modal input:focus {
  border-color: #75afd1;
}

.file-drop {
  min-height: 160px;
  display: grid;
  place-content: center;
  justify-items: center;
  padding: 20px;
  border: 1px dashed #92b8cf;
  border-radius: 8px;
  background: #f7fbfd;
  color: var(--asc-primary);
  text-align: center;
}

.file-drop > svg {
  font-size: 28px;
}

.file-drop strong {
  margin-top: 9px;
  color: var(--asc-heading);
  font-size: 12px;
}

.file-drop > span {
  margin: 4px 0 9px;
  color: var(--asc-muted);
  font-size: 10px;
}

.file-drop input {
  max-width: 220px;
  color: var(--asc-muted);
  font-size: 10px;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 14px 0 0;
  padding: 9px 10px;
  border-radius: 6px;
  background: var(--asc-success-soft);
  color: var(--asc-success);
  font-size: 10px;
}

.modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.modal footer button {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 750;
}

.modal .secondary {
  border: 1px solid var(--asc-border);
  background: #fff;
}

.modal .primary {
  border: 0;
  background: var(--asc-primary);
  color: #fff;
}

.modal .primary:disabled {
  opacity: 0.45;
}
</style>
