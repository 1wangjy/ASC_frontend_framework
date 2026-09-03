<template>
  <div class="platform-page platform-home">
    <header class="platform-hero">
      <div class="platform-hero__glow" aria-hidden="true"></div>
      <p class="platform-hero__eyebrow">MATERIALS · AI · DESIGN</p>
      <h1 class="platform-hero-title">ASC Design Platform</h1>
      <p class="platform-hero-subtitle">数智材料设计平台 — 性能预测 · 配方优化 · 服役评估 · 三维重建</p>
      <div class="platform-hero__rule" aria-hidden="true"><span></span></div>
    </header>

    <div class="platform-models-grid">
      <div v-for="model in models" :key="model.route" class="platform-model-card" @click="router.push(model.route)">
        <div class="platform-model-card__top">
          <div class="platform-model-icon">{{ model.icon }}</div>
          <span class="platform-model-index">{{ model.index }}</span>
        </div>
        <h2>{{ model.title }}</h2>
        <p>{{ model.desc }}</p>
        <button class="platform-model-cta">
          <span>进入模型</span>
          <span class="platform-model-cta__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
const models = [
  { index: '01', icon: '📈', title: '性能预测', desc: '提交配方信息，生成原料向量，预测材料性能', route: '/platform/model1' },
  { index: '02', icon: '⚗️', title: '配方优化', desc: '提交测试指标，优化配方参数，提高材料性能', route: '/platform/model2' },
  { index: '03', icon: '🌡️', title: '服役预测', desc: '提交工况指标，生成环境嵌入，评估服役性能', route: '/platform/model3' },
  { index: '04', icon: '🎨', title: '3D温度场重建', desc: '加载结构拓扑文件和温度点文件，重构3D可视化图形', route: '/platform/model4' },
]
</script>

<style scoped>
.platform-home { padding: 0 24px 48px; max-width: 1320px; margin: 0 auto; }

/* ── Hero ─────────────────────────────────────────── */
.platform-hero {
  position: relative;
  text-align: center;
  padding: 72px 20px 28px;
  overflow: hidden;
}
.platform-hero__glow {
  position: absolute;
  top: -180px;
  left: 50%;
  width: 720px;
  height: 380px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(8,105,173,.14), transparent 72%);
  pointer-events: none;
}
.platform-hero__eyebrow {
  margin: 0 0 14px;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .34em;
}
.platform-hero-title {
  position: relative;
  margin: 0;
  font-size: clamp(30px, 4.2vw, 46px);
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
  background: linear-gradient(120deg, #005bac 0%, #0869ad 42%, #12a1c7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.platform-hero-subtitle {
  position: relative;
  margin: 16px auto 0;
  max-width: 640px;
  color: #5b6b7c;
  font-size: 15px;
  line-height: 1.7;
}
.platform-hero__rule {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 26px auto 0;
  width: min(420px, 100%);
}
.platform-hero__rule::before,
.platform-hero__rule::after {
  content: '';
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, transparent, #a9c9e0);
}
.platform-hero__rule span {
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #0869ad, #12a1c7);
}

/* ── Cards grid: fixed 4 columns, same row ───────── */
.platform-models-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-top: 36px;
}

/* ── Card ─────────────────────────────────────────── */
.platform-model-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 26px 22px 22px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e2ecf5;
  box-shadow: 0 10px 30px rgba(15, 55, 88, .08);
  cursor: pointer;
  overflow: hidden;
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
}
.platform-model-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, #0869ad, #12a1c7, #0869ad);
  background-size: 200% 100%;
  opacity: .9;
  transition: background-position .5s ease;
}
.platform-model-card:hover::before {
  background-position: 100% 0;
}
.platform-model-card:hover {
  transform: translateY(-6px);
  border-color: #bcdcf2;
  box-shadow: 0 22px 44px rgba(8, 105, 173, .16), 0 0 0 1px rgba(8,105,173,.08);
}

.platform-model-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}
.platform-model-icon {
  font-size: 40px;
  line-height: 1;
  filter: drop-shadow(0 6px 14px rgba(8,105,173,.28));
  transition: transform .22s ease;
}
.platform-model-card:hover .platform-model-icon {
  transform: translateY(-2px);
}
.platform-model-index {
  color: #a7bdd0;
  font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .08em;
}
.platform-model-card h2 {
  margin: 0 0 10px;
  color: #16324f;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: .2px;
}
.platform-model-card p {
  flex: 1;
  margin: 0 0 20px;
  color: #647b90;
  font-size: 13.5px;
  line-height: 1.65;
  min-height: 3.3em;
}

/* ── CTA ──────────────────────────────────────────── */
.platform-model-cta {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 11px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: linear-gradient(135deg, #0a6fb8 0%, #0869ad 55%, #0e5c94 100%);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.platform-model-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(8,105,173,.32);
  filter: brightness(1.04);
}
.platform-model-cta__arrow {
  font-size: 15px;
  transition: transform .18s ease;
}
.platform-model-card:hover .platform-model-cta__arrow {
  transform: translateX(3px);
}

/* ── Responsive ───────────────────────────────────── */
@media (max-width: 1180px) {
  .platform-models-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .platform-models-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .platform-hero { padding-top: 48px; }
  .platform-model-card p { min-height: 0; }
}
</style>
