<template>
  <div class="literature-import-actions">
    <input
      ref="fileInput"
      class="pdf-file-input"
      type="file"
      accept=".pdf,application/pdf"
      :disabled="busy"
      @change="selectPdf"
    />
    <button type="button" class="btn" :disabled="busy" @click="openFilePicker">
      {{ busy ? '导入中…' : '导入 PDF' }}
    </button>
    <button type="button" class="btn btn-secondary" :disabled="busy" @click="$emit('manual-create')">
      手动新增
    </button>
    <span v-if="status" class="import-status" role="status">{{ status }}</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  busy: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['file-selected', 'manual-create'])
const fileInput = ref(null)

function openFilePicker() {
  fileInput.value?.click()
}

function selectPdf(event) {
  const file = event.target.files?.[0]
  if (file) emit('file-selected', file)
  event.target.value = ''
}
</script>

<style scoped>
.literature-import-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pdf-file-input {
  display: none;
}

.import-status {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
