<template>
  <div
    class="literature-list-status"
    :role="status === 'error' ? 'alert' : 'status'"
    :aria-live="status === 'loading' ? 'polite' : undefined"
  >
    <span v-if="status === 'loading'" class="loading" aria-hidden="true"></span>
    <div v-else class="literature-list-status__icon" aria-hidden="true">
      {{ status === 'error' ? '⚠️' : '📚' }}
    </div>

    <p v-if="status === 'loading'">文献加载中...</p>
    <p v-else-if="status === 'error'">文献加载失败，请稍后重试</p>
    <p v-else-if="status === 'empty'">暂无文献，可通过“导入 PDF”添加第一篇文献</p>
    <p v-else-if="status === 'no-results'">未找到符合当前条件的文献</p>

    <button
      v-if="status === 'error'"
      type="button"
      class="btn btn-secondary btn-small"
      @click="$emit('retry')"
    >
      重新加载
    </button>
  </div>
</template>

<script setup>
defineProps({
  status: {
    type: String,
    required: true,
  },
})

defineEmits(['retry'])
</script>

<style scoped>
.literature-list-status {
  display: flex;
  min-height: 220px;
  padding: 48px 20px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
  text-align: center;
}

.literature-list-status p {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.literature-list-status__icon {
  font-size: 56px;
  line-height: 1;
}
</style>
