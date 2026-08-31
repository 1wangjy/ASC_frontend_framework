<template>
  <select :value="modelValue" class="formula-select" :disabled="options.length === 0" @change="$emit('update:modelValue', $event.target.value)">
    <option value="" disabled>{{ options.length ? '请选择一个配方' : '暂无可用配方，请先创建配方' }}</option>
    <option v-for="formula in options" :key="formula.mr_id" :value="formula.mr_id">{{ formula.formula_name?.trim() || '未命名配方' }}（{{ formula.mr_id }}）</option>
  </select>
</template>
<script setup>
defineProps({ modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } })
defineEmits(['update:modelValue'])
</script>
<style scoped>
.formula-select { width: 100%; min-height: 42px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.formula-select:disabled { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
</style>
