<template>
  <main class="knowledge-entry">
    <header class="entry-header">
      <h1>知识图谱</h1>
      <p>从统一入口进入 ASC 耐火材料知识图谱工作区</p>
    </header>

    <section class="entry-stage">
      <article class="launch-card">
        <span class="launch-card__icon"><AscIcon name="graph" /></span>
        <h2>ASC 知识图谱</h2>
        <p>检索材料、组分、物相、性能与服役关系，并精准定位目标节点。</p>
        <button type="button" @click="launchGraph">
          <span>进入知识图谱</span>
          <AscIcon name="chevron" />
        </button>
      </article>
    </section>
  </main>
</template>

<script setup>
import { useRouter } from 'vue-router'
import AscIcon from '../components/ui/AscIcon.vue'

const router = useRouter()

function launchGraph() {
  router.push('/process/new')
}
</script>

<style scoped>
.knowledge-entry {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--asc-bg);
}

.entry-header {
  min-height: 82px;
  padding: 22px 28px 16px;
  border-bottom: 1px solid var(--asc-border);
  background: #fff;
}

.entry-header h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 24px;
}

.entry-header p {
  margin: 5px 0 0;
  color: var(--asc-muted);
  font-size: 11px;
}

.entry-stage {
  display: grid;
  place-items: center;
  padding: 36px 24px 80px;
}

.launch-card {
  width: min(360px, 100%);
  padding: 32px 28px 28px;
  border: 1px solid var(--asc-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 14px 36px rgba(28, 68, 94, 0.08);
  text-align: center;
}

.launch-card__icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
  border-radius: 14px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 27px;
}

.launch-card h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 18px;
}

.launch-card > p {
  margin: 9px auto 19px;
  color: var(--asc-muted);
  font-size: 11px;
  line-height: 1.7;
}

.launch-card > button {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.launch-card > button:hover:not(:disabled) {
  background: var(--asc-primary-hover);
}

@media (max-width: 760px) {
  .knowledge-entry {
    min-height: calc(100vh - 56px);
  }

  .entry-header {
    padding-inline: 16px;
  }

  .entry-stage {
    padding-inline: 16px;
  }
}
</style>
