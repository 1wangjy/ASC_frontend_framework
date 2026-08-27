<template>
  <span v-if="entryType" class="literature-type-badge">{{ typeLabel }}</span>
  <div v-else class="literature-type-confirmation">
    <span class="literature-type-pending">类型待确认</span>
    <select v-model="selectedType" aria-label="确认文献类型" :disabled="busy">
      <option value="">请选择类型</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <button
      type="button"
      class="btn btn-secondary btn-small"
      :disabled="busy || !selectedType"
      @click="$emit('confirm', selectedType)"
    >
      {{ busy ? '保存中…' : '确认类型' }}
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  entryType: {
    type: String,
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  busy: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['confirm'])

const selectedType = ref('')
const typeLabel = computed(() => (
  props.options.find((option) => option.value === props.entryType)?.label || props.entryType
))
</script>

<style scoped>
.literature-type-badge,
.literature-type-pending {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.literature-type-badge {
  color: #6b7280;
  background: #f3f4f6;
}

.literature-type-confirmation {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.literature-type-pending {
  color: #92400e;
  background: #fef3c7;
}

.literature-type-confirmation select {
  min-width: 112px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary);
  font-size: 12px;
}
</style>
