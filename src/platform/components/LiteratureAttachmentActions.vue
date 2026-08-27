<template>
  <div class="literature-attachment-actions">
    <template v-if="literature.attachment">
      <a
        :href="getAttachmentUrl(literature.attachment)"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-secondary btn-small"
      >
        预览 PDF
      </a>
      <button
        type="button"
        class="btn btn-secondary btn-small"
        :disabled="isDownloading"
        @click="handleDownload"
      >
        {{ isDownloading ? '下载中...' : '下载 PDF' }}
      </button>
    </template>
    <template v-else>
      <span class="attachment-empty">未上传 PDF</span>
      <button
        type="button"
        class="btn btn-secondary btn-small"
        @click="$emit('upload', literature.lit_id)"
      >
        上传 PDF
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { downloadAttachment, getAttachmentUrl } from '../api/attachment.js'

const props = defineProps({
  literature: {
    type: Object,
    required: true,
  },
})

defineEmits(['upload'])

const isDownloading = ref(false)

async function handleDownload() {
  if (!props.literature.attachment || isDownloading.value) return
  isDownloading.value = true
  try {
    await downloadAttachment(props.literature.attachment)
  } catch (error) {
    alert('PDF 下载失败：' + (error?.message || '请重试'))
  } finally {
    isDownloading.value = false
  }
}

</script>

<style scoped>
.literature-attachment-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.attachment-empty {
  color: #6c757d;
  font-size: 13px;
}
</style>
