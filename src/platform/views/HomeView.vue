<template>
  <div class="platform-home">
    <header class="platform-hero">
      <div class="platform-hero__glow" aria-hidden="true"></div>
      <p class="platform-hero__eyebrow">MATERIALS · AI · DESIGN</p>
      <h1 class="platform-hero-title">ASC Design Platform</h1>
      <p class="platform-hero-subtitle">数智材料设计平台 — 性能预测 · 配方优化 · 服役评估 · 三维重建</p>
      <div class="platform-hero__rule" aria-hidden="true"><span></span></div>
    </header>

    <section class="carousel-3d" aria-label="模型入口">
      <!-- ambient floor glow -->
      <div class="carousel-3d__floor" aria-hidden="true"></div>

      <div class="carousel-3d__stage" :style="{ perspective: perspective }">
        <div
          v-for="(card, i) in displayCards"
          :key="card.route"
          class="carousel-3d__card"
          :style="card.style"
          :class="{ 'is-active': card.pos === 0 }"
          @click="onCardClick(card)"
        >
          <div class="platform-model-card__top">
            <div class="platform-model-icon">{{ card.icon }}</div>
            <span class="platform-model-index">{{ card.index }}</span>
          </div>
          <h2>{{ card.title }}</h2>
          <p>{{ card.desc }}</p>
          <button type="button" class="platform-model-cta">
            <span>进入模型</span>
            <span class="platform-model-cta__arrow" aria-hidden="true">→</span>
          </button>
          <span class="platform-model-front" aria-hidden="true">tap → {{ card.title }}</span>
        </div>
      </div>

      <div class="carousel-3d__controls">
        <button type="button" class="carousel-3d__arrow" aria-label="上一个" @click.stop="step(-1)">
          <span aria-hidden="true">‹</span>
        </button>
        <div class="carousel-3d__dots">
          <button
            v-for="(m, i) in models"
            :key="m.route"
            type="button"
            class="carousel-3d__dot"
            :class="{ 'is-active': i === activeIndex }"
            :aria-label="`查看 ${m.title}`"
            @click.stop="goTo(i)"
          />
        </div>
        <button type="button" class="carousel-3d__arrow" aria-label="下一个" @click.stop="step(1)">
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const models = [
  { index: '01', icon: '📈', title: '性能预测', desc: '提交配方信息，生成原料向量，预测材料性能', route: '/platform/model1' },
  { index: '02', icon: '⚗️', title: '配方优化', desc: '提交测试指标，优化配方参数，提高材料性能', route: '/platform/model2' },
  { index: '03', icon: '🌡️', title: '服役预测', desc: '提交工况指标，生成环境嵌入，评估服役性能', route: '/platform/model3' },
  { index: '04', icon: '🎨', title: '3D温度场重建', desc: '加载结构拓扑文件和温度点文件，重构3D可视化图形', route: '/platform/model4' },
]

const N = models.length
const activeIndex = ref(0)
const perspective = '1500px'
let timer = null

/* pos: 0 = front(center), 1 = next-right, 3 = left(-1), 2 = far/back */
const displayCards = computed(() =>
  models.map((m, i) => {
    let pos = (i - activeIndex.value + N) % N
    const style = positionStyle(pos)
    return { ...m, pos, style }
  })
)

function positionStyle(pos) {
  const base = {}
  if (pos === 0) {
    // front, facing viewer — keep modest Z lift so it doesn't swallow the controls
    Object.assign(base, { zIndex: 30, opacity: 1 })
    base.transform = 'translate(-50%, -50%) translateX(0) translateZ(40px) rotateY(0deg) scale(1)'
  } else if (pos === 1) {
    // next on the right, angled back-in toward center
    Object.assign(base, { zIndex: 15, opacity: 0.84, filter: 'brightness(.94)' })
    base.transform = 'translate(-50%, -50%) translateX(104%) translateZ(-70px) rotateY(-38deg) scale(.82)'
  } else if (pos === 3) {
    // previous on the left
    Object.assign(base, { zIndex: 15, opacity: 0.84, filter: 'brightness(.94)' })
    base.transform = 'translate(-50%, -50%) translateX(-104%) translateZ(-70px) rotateY(38deg) scale(.82)'
  } else {
    // trailing card sunk behind for depth (no mirror flip)
    Object.assign(base, { zIndex: 6, opacity: 0.55, filter: 'brightness(.82) blur(1.2px)' })
    base.transform = 'translate(-50%, -50%) translateX(0) translateZ(-320px) rotateY(8deg) scale(.72)'
  }
  return base
}

function step(dir) {
  activeIndex.value = (activeIndex.value + dir + N) % N
  restart()
}

function goTo(i) {
  activeIndex.value = i
  restart()
}

function onCardClick(card) {
  if (card.pos === 0) {
    // front card → enter model
    router.push(card.route)
    return
  }
  // side/back card → bring it to front first
  const i = models.findIndex(m => m.route === card.route)
  activeIndex.value = i
  restart()
}

function auto() {
  timer = setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % N
  }, 3800)
}
function restart() {
  clearInterval(timer)
  auto()
}

onMounted(auto)
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.platform-home {
  padding: 0 24px 56px;
  max-width: 1280px;
  margin: 0 auto;
  overflow: hidden;
}

/* ── Hero ── */
.platform-hero { position: relative; text-align: center; padding: 40px 20px 22px; overflow: hidden; }
.platform-hero__glow { position: absolute; top: -180px; left: 50%; width: 720px; height: 380px; transform: translateX(-50%); background: radial-gradient(closest-side, rgba(8,105,173,.14), transparent 72%); pointer-events: none; }
  .platform-hero__eyebrow { margin: 0 0 12px; color: var(--asc-primary); font-size: 12px; font-weight: 800; letter-spacing: .34em; }
.platform-hero-title { position: relative; margin: 0; font-size: clamp(30px, 4.2vw, 46px); font-weight: 800; letter-spacing: -1px; line-height: 1.1; background: linear-gradient(120deg, #005bac 0%, #0869ad 42%, #12a1c7 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.platform-hero-subtitle { position: relative; margin: 16px auto 0; max-width: 640px; color: #5b6b7c; font-size: 15px; line-height: 1.7; }
.platform-hero__rule { position: relative; display: flex; align-items: center; justify-content: center; gap: 10px; margin: 18px auto 0; width: min(420px, 100%); }
.platform-hero__rule::before, .platform-hero__rule::after { content: ''; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, #a9c9e0); }
.platform-hero__rule span { width: 7px; height: 7px; transform: rotate(45deg); background: linear-gradient(135deg, #0869ad, #12a1c7); }

/* ── 3D stage ── */
.carousel-3d {
  position: relative;
  margin-top: 4px;
  padding: 30px 0 6px;
}

.carousel-3d__stage {
  position: relative;
  height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective-origin: 50% 46%;
}

.carousel-3d__floor {
  position: absolute;
  left: 50%;
  bottom: 6px;
  width: min(760px, 92%);
  height: 60px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(8,105,173,.18), transparent 72%);
  filter: blur(6px);
  pointer-events: none;
}

/* ── Card ── */
.carousel-3d__card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(320px, 78vw);
  min-height: 430px;
  padding: 32px 28px 36px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  border: 1px solid rgba(120, 165, 205, 0.4);
  box-shadow: 0 30px 70px rgba(15, 55, 88, 0.2), inset 0 1px 0 #fff;
  cursor: pointer;
  transform-style: preserve-3d;
  will-change: transform;
  transition: transform .8s cubic-bezier(.4,0,.2,1), opacity .5s ease, filter .5s ease, box-shadow .3s ease;
}
.carousel-3d__card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(90deg, #0869ad, #12a1c7, #0e94c0, #0869ad);
  background-size: 260% 100%;
}
.carousel-3d__card.is-active {
  border-color: rgba(18, 161, 199, 0.5);
  box-shadow: 0 40px 80px rgba(8, 105, 173, 0.24), 0 0 0 1px rgba(18,161,199,.18), inset 0 1px 0 #fff;
}
.carousel-3d__card.is-active::before { animation: shimmer 4s linear infinite; }
@keyframes shimmer { to { background-position: 260% 0; } }

.carousel-3d__card:hover { }

.platform-model-card__top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; }
.platform-model-icon { font-size: 44px; line-height: 1; filter: drop-shadow(0 8px 16px rgba(8,105,173,.3)); }
.platform-model-index { color: #a7bdd0; font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace; font-size: 15px; font-weight: 800; letter-spacing: .08em; }
.carousel-3d__card h2 { margin: 0 0 12px; color: #16324f; font-size: 24px; font-weight: 800; letter-spacing: .2px; }
.carousel-3d__card p { flex: 1; margin: 0 0 24px; color: #5b7388; font-size: 15px; line-height: 1.75; }

.platform-model-cta {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 13px 18px; box-sizing: border-box;
  border: 1px solid transparent; border-radius: 10px;
  background: linear-gradient(135deg, #0a6fb8 0%, #0869ad 55%, #0e5c94 100%);
  color: #fff; font: inherit; font-size: 15px; font-weight: 650; cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.platform-model-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 26px rgba(8,105,173,.35); filter: brightness(1.05); }
.platform-model-cta__arrow { font-size: 16px; transition: transform .18s ease; }
.carousel-3d__card.is-active:hover .platform-model-cta__arrow { transform: translateX(3px); }

/* subtle float animation on active card */

/* hint on non-front cards */
.platform-model-front {
  display: none;
}

/* ── Controls ── */
.carousel-3d__controls { position: relative; z-index: 40; display: flex; align-items: center; justify-content: center; gap: 26px; margin-top: 30px; }
.carousel-3d__arrow {
  width: 42px; height: 42px; display: grid; place-items: center;
  border: 1px solid var(--asc-border-strong); border-radius: 50%;
  background: #fff; color: var(--asc-primary); font-size: 26px; line-height: 1;
  cursor: pointer; box-shadow: 0 6px 16px rgba(15,55,88,.1);
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
}
.carousel-3d__arrow:hover { transform: translateY(-2px); background: var(--asc-primary-soft); box-shadow: 0 10px 22px rgba(8,105,173,.2); }
.carousel-3d__dots { display: flex; gap: 9px; }
.carousel-3d__dot { width: 9px; height: 9px; padding: 0; border: 0; border-radius: 999px; background: #c3d5e4; cursor: pointer; transition: width .25s ease, background .25s ease; }
.carousel-3d__dot.is-active { width: 26px; background: linear-gradient(90deg, #0869ad, #12a1c7); }

@media (prefers-reduced-motion: reduce) {
  .carousel-3d__card.is-active::before { animation: none; }
}
</style>
