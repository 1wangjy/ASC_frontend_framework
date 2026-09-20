<template>
  <div
    class="modal active literature-details-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="literature-details-title"
    @click.self="$emit('close')"
  >
    <section class="modal-content literature-details-modal">
      <header class="literature-details-header">
        <div>
          <span class="literature-details-eyebrow">文献详情</span>
          <h2 id="literature-details-title">{{ displayValue(literature.title) }}</h2>
        </div>
        <button type="button" class="literature-details-close" aria-label="关闭文献详情" @click="$emit('close')">
          ×
        </button>
      </header>

      <dl class="literature-details-grid">
        <div><dt>作者</dt><dd>{{ displayValue(literature.authors) }}</dd></div>
        <div><dt>文献类型</dt><dd>{{ typeLabel }}</dd></div>
        <div><dt>年份</dt><dd>{{ displayValue(literature.year) }}</dd></div>
        <div><dt>期刊</dt><dd>{{ displayValue(literature.journal) }}</dd></div>
        <div><dt>DOI</dt><dd>{{ displayValue(literature.doi) }}</dd></div>
        <div><dt>Volume</dt><dd>{{ displayValue(literature.volume) }}</dd></div>
        <div><dt>Number</dt><dd>{{ displayValue(literature.number) }}</dd></div>
        <div><dt>Pages</dt><dd>{{ displayValue(literature.pages) }}</dd></div>
        <div class="literature-details-wide">
          <dt>摘要</dt>
          <dd class="literature-details-abstract">{{ displayValue(literature.abstract) }}</dd>
        </div>
        <div class="literature-details-wide">
          <dt>备注</dt>
          <dd class="literature-details-abstract">{{ displayValue(literature.note) }}</dd>
        </div>
        <div class="literature-details-wide"><dt>PDF</dt><dd>{{ literature.attachment ? '已上传' : '未上传' }}</dd></div>
      </dl>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">关闭</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { normalizeLiteratureEntryType } from '../types/entities.js'

const props = defineProps({
  literature: {
    type: Object,
    required: true,
  },
  typeOptions: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['close'])

function displayValue(value) {
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
    : String(value ?? '').trim()
  return normalized || '—'
}

const typeLabel = computed(() => {
  const entryType = normalizeLiteratureEntryType(props.literature.entry_type)
  if (!entryType) return displayValue('')
  const option = props.typeOptions.find((item) => item.value === entryType)
  return displayValue(option?.label || entryType)
})
</script>

<style scoped>
.literature-details-overlay {
  padding: 24px;
  overflow-y: auto;
}

.literature-details-modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.literature-details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.literature-details-header h2 {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}

.literature-details-eyebrow {
  color: var(--text-secondary);
  font-size: 13px;
}

.literature-details-close {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.literature-details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 0;
}

.literature-details-grid > div {
  min-width: 0;
}

.literature-details-grid dt {
  margin-bottom: 5px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.literature-details-grid dd {
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.literature-details-wide {
  grid-column: 1 / -1;
}

.literature-details-abstract {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}

@media (max-width: 640px) {
  .literature-details-overlay {
    padding: 12px;
  }

  .literature-details-grid {
    grid-template-columns: 1fr;
  }

  .literature-details-wide {
    grid-column: auto;
  }
}
</style>
