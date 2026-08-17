<template>
  <section class="query-progress" aria-label="查询进度" aria-live="polite">
    <header class="query-progress__header">
      <div class="query-progress__status">
        <strong class="query-progress__title">正在执行全局查询</strong>
        <span class="query-progress__elapsed">
          <span aria-hidden="true">◷</span>
          {{ progress.elapsedSeconds }}s
        </span>
      </div>
      <strong class="query-progress__percent">{{ progress.percent }}%</strong>
    </header>

    <div
      class="query-progress__track"
      role="progressbar"
      aria-label="全局查询进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress.percent"
    >
      <span :style="{ width: `${progress.percent}%` }" />
    </div>

    <div class="query-progress__steps">
      <article
        v-for="(step, index) in progress.steps"
        :key="step.key"
        class="query-progress__step"
        :class="[
          `query-progress__step--${step.status}`,
          { 'query-progress__step--wide': index === progress.steps.length - 1 }
        ]"
      >
        <span class="query-progress__dot" aria-hidden="true" />
        <div class="query-progress__step-copy">
          <strong>{{ step.label }}</strong>
          <p>{{ step.detail }}</p>
        </div>
        <small>{{ step.statusText }}</small>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { buildQaQueryProgress } from './qaQueryProgressModel.js'

const elapsedMs = ref(0)
const progress = computed(() => buildQaQueryProgress(elapsedMs.value))
let startedAt = 0
let timer = null

function updateElapsed() {
  elapsedMs.value = Math.max(0, Date.now() - startedAt)
}

onMounted(() => {
  startedAt = Date.now()
  updateElapsed()
  timer = setInterval(updateElapsed, 700)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  timer = null
})
</script>

<style scoped>
.query-progress {
  padding: 24px;
  border: 1px solid #d4e1eb;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(40, 72, 99, .05);
}

.query-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.query-progress__status {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.query-progress__title {
  color: var(--asc-heading);
  font-size: 17px;
  font-weight: 750;
}

.query-progress__elapsed {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #627a91;
  font-size: 13px;
  font-weight: 650;
}

.query-progress__elapsed > span {
  color: #6a83a0;
  font-size: 16px;
}

.query-progress__percent {
  color: #174fb8;
  font-size: 17px;
  font-weight: 850;
}

.query-progress__track {
  height: 6px;
  margin: 14px 0 22px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef7;
}

.query-progress__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #1769bd;
  transition: width .35s ease;
}

.query-progress__steps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.query-progress__step {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 78px;
  padding: 15px 17px;
  border: 1px solid #dbe5ee;
  border-radius: 9px;
  background: #fbfcfe;
  color: #75889b;
  transition: border-color .25s ease, background-color .25s ease, color .25s ease;
}

.query-progress__step--wide {
  grid-column: 1 / -1;
}

.query-progress__dot {
  width: 10px;
  height: 10px;
  border: 1.5px solid #9fb2c6;
  border-radius: 50%;
  background: #fff;
}

.query-progress__step strong {
  display: block;
  color: inherit;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.4;
}

.query-progress__step p {
  margin: 6px 0 0;
  color: #8294a6;
  font-size: 12px;
  line-height: 1.5;
}

.query-progress__step small {
  white-space: nowrap;
  align-self: start;
  padding-top: 1px;
  color: inherit;
  font-size: 12px;
  font-weight: 750;
}

.query-progress__step--completed {
  border-color: #b9e4c9;
  background: #f0fbf5;
  color: #294b3e;
}

.query-progress__step--completed .query-progress__dot {
  border-color: #0aa176;
  background: #0aa176;
}

.query-progress__step--completed small {
  color: #247258;
}

.query-progress__step--in_progress {
  border-color: #6da1ff;
  background: #f2f5ff;
  color: #163e95;
}

.query-progress__step--in_progress .query-progress__dot {
  border: 2px solid #1459c7;
  background: #1459c7;
  box-shadow: 0 0 0 4px rgba(20, 89, 199, .10);
}

.query-progress__step--in_progress p,
.query-progress__step--in_progress small {
  color: #315aa5;
}

.query-progress__step--pending p,
.query-progress__step--pending small {
  color: #94a4b4;
}

@media (max-width: 820px) {
  .query-progress__steps {
    grid-template-columns: 1fr;
  }

  .query-progress__step--wide {
    grid-column: auto;
  }
}

@media (max-width: 560px) {
  .query-progress {
    padding: 16px;
  }

  .query-progress__header,
  .query-progress__status {
    align-items: flex-start;
  }

  .query-progress__status {
    flex-direction: column;
    gap: 4px;
  }

  .query-progress__step {
    grid-template-columns: 10px minmax(0, 1fr);
    min-height: 72px;
    padding: 14px;
  }

  .query-progress__step small {
    grid-column: 2;
  }
}
</style>
