<template>
  <aside v-if="document" class="document-details">
    <header>
      <h2>文献详情</h2>
      <button type="button" aria-label="关闭文献详情" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <section class="detail-title">
      <span>{{ document.typeLabel }}</span>
      <h3>{{ document.title }}</h3>
    </section>

    <section class="detail-section">
      <h4>摘要</h4>
      <p>{{ document.abstract }}</p>
    </section>

    <section class="detail-section">
      <h4>关键词</h4>
      <div class="keyword-list">
        <span v-for="keyword in document.keywords" :key="keyword">{{ keyword }}</span>
      </div>
    </section>
  </aside>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

defineProps({
  document: {
    type: Object,
    default: null
  }
})

defineEmits(['close'])
</script>

<style scoped>
.document-details {
  min-width: 0;
  min-height: 560px;
  padding: 20px 18px;
  overflow-y: auto;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.document-details > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--asc-border);
}

.document-details h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 15px;
}

.document-details > header button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--asc-text);
  font-size: 18px;
}

.document-details > header button:hover {
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
}

.detail-title {
  padding: 18px 0 17px;
  border-bottom: 1px solid #e8eef3;
}

.detail-title > span {
  display: inline-block;
  margin-bottom: 9px;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 9px;
  font-weight: 800;
}

.detail-title h3 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 13px;
  line-height: 1.55;
}

.detail-section {
  padding-top: 19px;
}

.detail-section h4 {
  margin: 0 0 10px;
  color: var(--asc-heading);
  font-size: 11px;
}

.detail-section p {
  margin: 0;
  color: var(--asc-text);
  font-size: 11px;
  line-height: 1.8;
}

.keyword-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.keyword-list span {
  padding: 5px 8px;
  border: 1px solid #c9deea;
  border-radius: 6px;
  background: #f4f9fc;
  color: #356c8d;
  font-size: 9px;
}

@media (max-width: 1180px) {
  .document-details {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(390px, 94vw);
    min-height: 100vh;
    border-radius: 0;
    box-shadow: var(--asc-shadow);
  }
}
</style>
