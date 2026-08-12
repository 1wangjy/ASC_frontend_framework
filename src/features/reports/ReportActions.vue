<template>
  <section v-if="showActions || isGenerating" class="report-actions" aria-label="报告操作">
    <p v-if="isGenerating" class="report-actions__progress" role="status">
      正在查看生成进度
    </p>
    <div v-else class="report-actions__buttons">
      <button
        type="button"
        :aria-label="`下载${projectName || '研究项目'}报告`"
        @click="emit('download')"
      >
        下载
      </button>
      <button
        v-if="canOpenQa"
        type="button"
        class="report-actions__primary"
        @click="emit('open-qa')"
      >
        去问答
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  reportId: { type: String, required: true },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  status: { type: String, default: 'unknown' }
})

const emit = defineEmits(['download', 'open-qa'])

const normalizedStatus = computed(() => String(props.status || '').trim().toLowerCase())
const isGenerating = computed(() => normalizedStatus.value === 'generating')
const showActions = computed(() => (
  normalizedStatus.value === 'completed'
  && Boolean(String(props.reportId || '').trim())
))
const canOpenQa = computed(() => (
  showActions.value
  && Boolean(String(props.projectId || '').trim())
))
</script>

<style scoped>
.report-actions {
  width: min(920px, 100%);
  box-sizing: border-box;
  margin: 0 auto 20px;
  padding: 14px 16px;
  border: 1px solid var(--asc-border);
  border-radius: 12px;
  background: #fff;
}

.report-actions__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.report-actions button {
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid var(--asc-border);
  border-radius: 8px;
  background: #fff;
  color: var(--asc-primary);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.report-actions button.report-actions__primary {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
}

.report-actions__progress {
  margin: 0;
  color: var(--asc-muted);
  font-size: 14px;
  font-weight: 700;
}
</style>
