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

    <section class="data-cards" aria-label="数据平台模块浏览">
      <article
        v-for="(card, i) in cards"
        :key="card.tab"
        class="data-card"
        :class="{ 'data-card--center': i === active, 'data-card--side': i !== active }"
        :style="cardStyle(offsets[i])"
        :tabindex="i === active ? 0 : -1"
        @click="clickCard(i)"
        @keydown.enter.prevent="clickCard(i)"
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

      <button
        type="button"
        class="data-cards__nav data-cards__nav--prev"
        aria-label="上一张"
        @click="step(-1)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        class="data-cards__nav data-cards__nav--next"
        aria-label="下一张"
        @click="step(1)"
      >
        <span aria-hidden="true">›</span>
      </button>

      <div class="data-cards__dots">
        <button
          v-for="(card, i) in cards"
          :key="`dot-${card.tab}`"
          type="button"
          class="data-cards__dot"
          :class="{ 'is-active': i === active }"
          :aria-label="`跳转到${card.title}`"
          :aria-current="i === active ? 'true' : undefined"
          @click="goTo(i)"
        ></button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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

const count = cards.length

/* Sweep state: which card is centered (0..count-1) */
const active = ref(0)
/* Responsive shrink factor for the whole fan (keeps it on screen when narrow) */
const fit = ref(1)

/* Per-offset geometry — px spread / depth / rotateY / base scale (outer edge recedes) */
const LAYOUT = {
  x1: 238, x2: 420,
  z1: -110, z2: -240,
  rot1: 14, rot2: 24,
  k1: 0.9, k2: 0.74
}

/* Wrap-around offset of every card relative to the active one, mapped to -2..2 */
const offsets = computed(() =>
  cards.map((_, i) => {
    let o = i - active.value
    while (o > 2) o -= count
    while (o < -2) o += count
    return o
  })
)

/* Inline style per offset: centered full rect at 0, trapezoid side faces otherwise */
function cardStyle(o) {
  const f = fit.value
  if (o === 0) {
    return {
      transform: `translate(-50%, -50%) scale(${f})`,
      zIndex: 30,
      opacity: 1
    }
  }
  const abs = Math.abs(o)
  const dir = o < 0 ? -1 : 1
  const x = dir * (abs === 1 ? LAYOUT.x1 : LAYOUT.x2) * f
  const z = abs === 1 ? LAYOUT.z1 : LAYOUT.z2
  const ry = dir * (abs === 1 ? LAYOUT.rot1 : LAYOUT.rot2)
  const k = (abs === 1 ? LAYOUT.k1 : LAYOUT.k2) * f
  return {
    transform: `translate(-50%, -50%) translate3d(${x}px, 0px, ${z}px) rotateY(${ry}deg) scale(${k})`,
    zIndex: abs === 1 ? 20 : 10,
    opacity: abs === 1 ? 0.92 : 0.6
  }
}

function openCard(card) {
  if (card.route) { router.push(card.route); return }
  router.push({ path: '/platform/data', query: { tab: card.tab } })
}

function step(dir) {
  active.value = (active.value + dir + count) % count
  restartTimer()
}

function goTo(i) {
  if (i === active.value) return
  active.value = i
  restartTimer()
}

/* Center card opens; a side card sweeps to the center first */
function clickCard(i) {
  if (i === active.value) { openCard(cards[i]); return }
  goTo(i)
}

let timer = null
function restartTimer() {
  if (timer) { clearInterval(timer); timer = null }
  if (count < 2) return
  timer = setInterval(() => {
    active.value = (active.value + 1) % count
  }, 4000)
}

function updateFit() {
  if (typeof window === 'undefined') return
  const avail = Math.min(1240, window.innerWidth) - 56
  fit.value = Math.min(1, Math.max(0.7, avail / 1180))
}

onMounted(() => {
  updateFit()
  window.addEventListener('resize', updateFit)
  restartTimer()
})

onBeforeUnmount(() => {
  if (timer) { clearInterval(timer); timer = null }
  window.removeEventListener('resize', updateFit)
})
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

/* ── Cards: perspective coverflow sweep ── */
.data-cards {
  position: relative;
  height: 472px;
  margin-top: 26px;
  perspective: 1500px;
}

.data-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 300px;
  height: 404px;
  display: flex;
  flex-direction: column;
  padding: 22px 22px 18px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #d9e5f0;
  box-shadow: 0 18px 40px rgba(15, 55, 88, 0.1), 0 2px 6px rgba(15, 55, 88, 0.06);
  cursor: pointer;
  overflow: hidden;
  transform: translate(-50%, -50%);
  transition: transform 0.62s cubic-bezier(0.24, 0.86, 0.32, 1), opacity 0.62s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  will-change: transform, opacity;
}
/* light-sweep top edge accent (subtle ::before only — no stacked ::after slab) */
.data-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  border-radius: 14px 14px 0 0;
  background: linear-gradient(90deg, #0869ad, #12a1c7, #0869ad);
  background-size: 220% 100%;
  opacity: 0.8;
  transition: opacity 0.2s ease;
}
.data-card--center {
  box-shadow: 0 30px 60px rgba(8, 70, 120, 0.18), 0 2px 8px rgba(15, 55, 88, 0.08);
}
.data-card--center:hover {
  border-color: #aecfe9;
}
.data-card--center:hover::before {
  animation: dataSweep 2.4s linear infinite;
  opacity: 1;
}
.data-card--side:hover {
  border-color: #cfe2f3;
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

/* ── Coverflow controls ── */
.data-cards__nav {
  position: absolute;
  top: 43%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0 0 3px;
  border-radius: 50%;
  border: 1px solid #cddeec;
  background: rgba(255, 255, 255, 0.92);
  color: #0869ad;
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  z-index: 40;
  box-shadow: 0 10px 22px rgba(15, 55, 88, 0.14);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}
.data-cards__nav:hover {
  background: #fff;
  border-color: #9ec4e2;
  box-shadow: 0 14px 28px rgba(8, 105, 173, 0.22);
}
.data-cards__nav:active { transform: translateY(-50%) scale(0.94); }
.data-cards__nav--prev { left: 10px; }
.data-cards__nav--next { right: 10px; }

.data-cards__dots {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 40;
}
.data-cards__dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #c6d9e9;
  cursor: pointer;
  transition: width 0.25s ease, border-radius 0.25s ease, background 0.2s ease;
}
.data-cards__dot:hover { background: #7fb0d6; }
.data-cards__dot.is-active {
  width: 26px;
  border-radius: 6px;
  background: linear-gradient(135deg, #0869ad, #12a1c7);
}

</style>
