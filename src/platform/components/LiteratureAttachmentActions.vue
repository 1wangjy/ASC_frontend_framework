<template>
  <div class="literature-attachment-actions">
    <a
      v-if="literature.attachment"
      :href="getAttachmentUrl(literature.attachment)"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-secondary btn-small"
    >
      预览 PDF
    </a>
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
import { getAttachmentUrl } from '../api/attachment.js'

defineProps({
  literature: {
    type: Object,
    required: true,
  },
})

defineEmits(['upload'])
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
