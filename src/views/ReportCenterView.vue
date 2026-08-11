<template>
  <main class="report-center-view">
    <section class="report-center-view__empty" aria-labelledby="report-center-title">
      <span class="report-center-view__mark">REPORT</span>
      <h1 id="report-center-title">尚无报告</h1>
      <p>请先完成图谱演化，再生成并查看对应的研究报告。</p>
      <router-link to="/process">前往图谱演化</router-link>
    </section>
  </main>
</template>

<script setup>
defineOptions({ name: 'ReportCenterView' })
</script>

<style scoped>
.report-center-view {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px;
  background: var(--asc-canvas);
}

.report-center-view__empty {
  width: min(560px, 100%);
  padding: 48px 36px;
  border: 1px solid var(--asc-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--asc-shadow);
  color: var(--asc-muted);
  text-align: center;
}

.report-center-view__mark {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .1em;
}

.report-center-view__empty h1 {
  margin: 18px 0 10px;
  color: var(--asc-heading);
  font-size: 26px;
}

.report-center-view__empty p {
  margin: 0;
  line-height: 1.7;
}

.report-center-view__empty a {
  display: inline-flex;
  margin-top: 24px;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--asc-primary);
  color: #fff;
  font-weight: 700;
}

.report-center-view__empty a:hover {
  background: var(--asc-primary-hover);
}

@media (max-width: 760px) {
  .report-center-view { padding: 24px 16px; }
  .report-center-view__empty { padding: 38px 22px; }
}
</style>
