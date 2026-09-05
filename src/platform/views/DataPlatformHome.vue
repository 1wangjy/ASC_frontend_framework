<template>
  <div class="data-home">
    <header class="data-hero">
      <div class="data-hero__glow" aria-hidden="true"></div>
      <div class="data-hero__grid" aria-hidden="true"></div>
      <p class="data-hero__eyebrow">DATA · INTELLIGENCE · MANAGEMENT</p>
      <h1 class="data-hero__title">数据平台</h1>
      <p class="data-hero__subtitle">文献 · 配方 · 物性 · 工况 — 数据解析、管理与图谱入库的统一入口</p>
      <div class="data-hero__rule" aria-hidden="true"><span></span></div>
    </header>

    <section class="data-cards">
      <article
        v-for="card in cards"
        :key="card.tab"
        class="data-card"
        @click="openCard(card)"
      >
        <div class="data-card__top">
          <div class="data-card__icon" aria-hidden="true">{{ card.icon }}</div>
          <span class="data-card__index">{{ card.index }}</span>
        </div>
        <h2>{{ card.title }}</h2>
        <p>{{ card.desc }}</p>
        <ul class="data-card__points">
          <li v-for="pt in card.points" :key="pt">{{ pt }}</li>
        </ul>
        <button type="button" class="data-card__cta">
          <span>进入{{ card.title }}</span>
          <span class="data-card__cta-arrow" aria-hidden="true">→</span>
        </button>
      </article>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const cards = [
  {
    index: '01',
    icon: '🧠',
    title: '智能解析',
    desc: '解析配方与测试数据，结构化提取为可入库字段',
    points: ['配方 / 测试解析', '工况 / 服役解析', '3D 重建解析'],
    tab: 'parse'
  },
  {
    index: '02',
    icon: '🗂️',
    title: '数据管理',
    desc: '维护原料、配方、物性与测试数据表',
    points: ['原料 / 配方表', '物性 / 测试表', '工况 / 服役记录'],
    tab: 'manage'
  },
  {
    index: '03',
    icon: '📚',
    title: '文献管理',
    desc: '文献库管理、附件上传与知识图谱构图选文',
    points: ['文献上传与检索', '附件管理', '图谱构图选文'],
    tab: 'literature'
  },
  {
    index: '04',
    icon: '🗺️',
    title: '图谱项目',
    desc: '知识图谱构建与图谱项目流程管理',
    points: ['文献建图', '图谱演化', '项目工作区'],
    route: '/process'
  },
  {
    index: '05',
    icon: '📊',
    title: '报告中心',
    desc: '研究报告生成、查看与归档',
    points: ['报告生成', '报告归档', '查看跟踪'],
    route: '/reports'
  }
]

function openCard(card) {
  if (card.route) { router.push(card.route); return }
  router.push({ path: '/platform/data', query: { tab: card.tab } })
}
</script>

<style scoped>
.data-home {
  min-height: 100vh;
  padding: 0 28px 56px;
  max-width: 1240px;
  margin: 0 auto;
  color: var(--asc-heading);
  background:
    radial-gradient(1100px 520px at 50% -140px, rgba(8, 105, 173, 0.12), transparent 70%),
    linear-gradient(180deg, #eef4fb 0%, #f7fafd 45%, #eef3f8 100%);
}

/* ── Hero ── */
.data-hero {
  position: relative;
  text-align: center;
  padding: 64px 20px 34px;
  overflow: hidden;
}
.data-hero__glow {
  position: absolute;
  top: -150px;
  left: 50%;
  width: 720px;
  height: 380px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(18, 161, 199, 0.16), transparent 72%);
  pointer-events: none;
}
.data-hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(8, 105, 173, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(8, 105, 173, 0.05) 1px, transparent 1px);
  background-size: 42px 42px;
  -webkit-mask-image: radial-gradient(420px 200px at 50% 0%, #000, transparent 75%);
  mask-image: radial-gradient(420px 200px at 50% 0%, #000, transparent 75%);
  pointer-events: none;
}
.data-hero__eyebrow {
  position: relative;
  margin: 0 0 14px;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.34em;
}
.data-hero__title {
  position: relative;
  margin: 0;
  font-size: clamp(30px, 4.2vw, 46px);
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
  background: linear-gradient(120deg, #0b3a5f 0%, #0869ad 60%, #12a1c7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.data-hero__subtitle {
  position: relative;
  margin: 16px auto 0;
  max-width: 640px;
  color: #5b6b7c;
  font-size: 15px;
  line-height: 1.7;
}
.data-hero__rule {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 22px auto 0;
  width: min(380px, 100%);
}
.data-hero__rule::before,
.data-hero__rule::after {
  content: '';
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, transparent, #9fc6df);
}
.data-hero__rule span {
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #0869ad, #12a1c7);
}

/* ── Cards: flat light-panel grid ── */
.data-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin-top: 34px;
}

.data-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 20px 16px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #dce8f1;
  box-shadow: 0 14px 34px rgba(15, 55, 88, 0.08);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}
/* light-sweep top edge on hover */
.data-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #0869ad, #12a1c7, #0869ad);
  background-size: 220% 100%;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}
.data-card:hover {
  transform: translateY(-5px);
  border-color: #bcdcf2;
  box-shadow: 0 22px 46px rgba(8, 105, 173, 0.16), 0 0 0 1px rgba(18, 161, 199, 0.12);
}
.data-card:hover::before {
  animation: dataSweep 2.6s linear infinite;
  opacity: 1;
}
@keyframes dataSweep { to { background-position: 220% 0; } }

.data-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.data-card__icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--asc-primary-soft);
  font-size: 23px;
  box-shadow: inset 0 0 0 1px rgba(8, 105, 173, 0.08);
}
.data-card__index {
  color: #a7bdd0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.data-card h2 {
  margin: 0 0 6px;
  color: #16324f;
  font-size: 19px;
  font-weight: 750;
  letter-spacing: 0.2px;
}
.data-card > p {
  margin: 0 0 12px;
  color: #5b7388;
  font-size: 13px;
  line-height: 1.6;
}
.data-card__points {
  flex: 1;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
  color: #647b90;
  font-size: 12.5px;
  line-height: 1.85;
}
.data-card__points li {
  position: relative;
  padding-left: 16px;
}
.data-card__points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.62em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0869ad, #12a1c7);
  opacity: 0.7;
}
.data-card__cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: linear-gradient(135deg, #0a6fb8 0%, #0869ad 55%, #0e5c94 100%);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.data-card__cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(8, 105, 173, 0.3);
}
.data-card:hover .data-card__cta-arrow {
  transform: translateX(3px);
}
.data-card__cta-arrow {
  font-size: 15px;
  transition: transform 0.18s ease;
}

@media (max-width: 1300px) {
  .data-cards { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
}

/* ══ Slim 3D tech cards ══ */
.data-cards { gap: 24px; }

.data-card {
  min-height: 380px;
  padding: 26px 20px 22px;
  border-radius: 14px;
  border: 1px solid rgba(120, 165, 205, 0.35);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,253,255,0.92));
  box-shadow:
    0 24px 46px rgba(10, 40, 70, 0.16),
    0 3px 8px rgba(10, 40, 70, 0.08);
  transform-style: preserve-3d;
  transition: transform 0.26s ease, box-shadow 0.26s ease, border-color 0.26s ease;
}

/* stacked bottom thickness (isometric edge) */
.data-card::after {
  content: '';
  position: absolute;
  inset: 6px -2px -7px 4px;
  border-radius: 16px;
  background: linear-gradient(90deg, rgba(8,105,173,0.10), rgba(8,105,173,0.20) 55%, rgba(18,161,199,0.22));
  border: 1px solid rgba(8,105,173,0.14);
  z-index: -1;
  filter: blur(0.3px);
  transform: translateZ(-14px) rotate(0.2deg);
  transition: transform 0.26s ease, opacity 0.26s ease;
}

/* keep top sweep but thinner + tech edge */
.data-card::before { height: 3px; opacity: 1; box-shadow: 0 1px 10px rgba(18,161,199,0.35); }

.data-card:hover {
  transform: perspective(900px) translateY(-8px) rotateX(3deg);
  border-color: rgba(18, 161, 199, 0.55);
  box-shadow:
    0 34px 64px rgba(8, 60, 105, 0.24),
    0 0 22px rgba(18, 161, 199, 0.18),
    0 6px 12px rgba(10,40,70,0.1);
}
.data-card:hover::after { opacity: .9; }
.data-card:hover .data-card__icon { transform: translateZ(18px); }
.data-card:hover h2 { transform: translateZ(12px); }

.data-card__icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: linear-gradient(150deg, #eef7fe, #dff0fc);
  box-shadow: inset 0 0 0 1px rgba(8,105,173,0.12), 0 6px 14px rgba(8,105,173,0.12);
  font-size: 26px;
  transition: transform 0.26s ease;
}
.data-card h2 { font-size: 20px; transition: transform 0.26s ease; }
.data-card > p { font-size: 13.5px; }
.data-card__points { font-size: 13px; line-height: 2.05; margin-bottom: 18px; }

</style>
