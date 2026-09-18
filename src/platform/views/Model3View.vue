<template>
  <div class="platform-page model3-page">
    <div class="page-header">
      <h1>服役预测</h1>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <div class="card m3-wip" role="status" aria-live="polite">
      <div class="m3-wip__art" aria-hidden="true">🚧</div>
      <h2 class="m3-wip__title">仍在建设中</h2>
      <p class="m3-wip__text">服役预测模块正在开发中，敬请期待。</p>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.m3-wip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--pl-space-2, 8px);
  min-height: var(--pl-workbench-body-min, 380px);
  text-align: center;
}

.m3-wip__art {
  font-size: 56px;
  line-height: 1;
  opacity: .9;
}

.m3-wip__title {
  margin: 0;
  font-size: var(--qa-heading-size, 18px);
  color: var(--asc-heading, #16324f);
}

.m3-wip__text {
  margin: 0;
  color: var(--asc-muted, #6b7f93);
  font-size: var(--pl-font-md, 14px);
}
</style>
