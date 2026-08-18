<template>
  <div class="workflow-progress-bar">
    <div class="workflow-progress-header">
      <span class="workflow-step-label">步骤 {{ currentStep }}/{{ steps.length }}</span>
    </div>

    <div
      class="workflow-steps"
      :style="{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }"
    >
      <div
        v-for="step in steps"
        :key="step.id"
        class="workflow-step"
        :class="{
          done: step.id < currentStep,
          active: step.id === currentStep,
          pending: step.id > currentStep,
        }"
      >
        <span class="step-dot">{{ step.id }}</span>
        <span class="step-name">{{ step.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentStep: { type: Number, required: true },
  steps: {
    type: Array,
    default: () => ([
      { id: 1, name: '图谱构建' },
      { id: 2, name: '环境搭建' },
      { id: 3, name: '开始模拟' },
    ]),
  },
})

</script>

<style scoped>
.workflow-progress-bar {
  padding: 10px 24px 12px;
  border-bottom: 1px solid #f1f1f1;
  background: #fff;
}

.workflow-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.workflow-step-label {
  font-weight: 600;
  color: #222;
}

.workflow-steps {
  display: grid;
  gap: 8px;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #888;
}

.step-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}

.workflow-step.done {
  color: #16a34a;
}

.workflow-step.active {
  color: #2563eb;
  font-weight: 600;
}

.workflow-step.pending {
  color: #999;
}

.step-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 900px) {
  .workflow-progress-bar {
    padding: 8px 12px 10px;
  }

  .workflow-steps {
    grid-template-columns: 1fr;
  }
}
</style>
