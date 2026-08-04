<template>
  <div v-if="mode" class="modal-backdrop" role="presentation" @mousedown.self="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header>
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p>{{ modalDescription }}</p>
        </div>
        <button type="button" aria-label="关闭导入窗口" @click="$emit('close')">
          <AscIcon name="close" />
        </button>
      </header>

      <form @submit.prevent="complete">
        <label class="file-drop">
          <AscIcon name="paperclip" />
          <strong>{{ selectedFileNames || '选择 PDF 文献' }}</strong>
          <span>支持一次选择单篇或多篇 PDF</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            required
            @change="selectFile"
          />
        </label>

        <div class="metadata-fields">
          <label>
            <span>分类</span>
            <input v-model="category" placeholder="例如：期刊论文" />
          </label>
          <label>
            <span>文件说明（可选）</span>
            <textarea v-model="description" rows="3" placeholder="这批文献的简短说明" />
          </label>
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

        <footer>
          <button type="button" class="secondary" :disabled="busy" @click="$emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="!files.length || busy">
            {{ busy ? '正在上传…' : '上传到后端' }}
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
  },
  busy: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'complete'])
const files = ref([])
const category = ref('未分类')
const description = ref('')
const titleId = 'document-import-title'

const title = computed(() => '上传 PDF 文献')
const modalDescription = computed(() => '文件会保存到当前本地用户对应的后端 PDF 文件库。')
const selectedFileNames = computed(() => files.value.map((file) => file.name).join('、'))

watch(
  () => props.mode,
  () => {
    files.value = []
    category.value = '未分类'
    description.value = ''
  }
)

function selectFile(event) {
  files.value = [...event.target.files]
}

function complete() {
  if (!files.value.length || props.busy) return
  emit('complete', {
    files: [...files.value],
    category: category.value.trim() || '未分类',
    description: description.value.trim()
  })
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

.modal textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--asc-border);
  border-radius: 6px;
  outline: 0;
  font: inherit;
  font-size: 11px;
  resize: vertical;
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

.metadata-fields {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.error-message {
  margin: 14px 0 0;
  padding: 9px 10px;
  border-radius: 6px;
  background: #fff1ef;
  color: #a53d33;
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
