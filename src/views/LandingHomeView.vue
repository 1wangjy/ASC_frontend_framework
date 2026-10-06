<template>
  <div class="landing">
    <!-- Hero（占 2/3） -->
    <section class="landing__hero">
      <div class="landing__glow" aria-hidden="true"></div>
      <div class="landing__hero-inner">
        <p class="landing__eyebrow">MATERIALS INTELLIGENCE · RESEARCH PLATFORM</p>
        <h1 class="landing__title">面向耐火材料研究的<br />智能设计平台</h1>
        <p class="landing__lead">
          贯通「文献 · 数据平台 · 知识图谱 · 问答 · 性能预测 · 报告」的 AI 科研闭环
        </p>
        <div class="landing__cta">
          <router-link class="landing__btn landing__btn--primary" :to="{ name: 'AscQa' }">
            开始问题研究 <span aria-hidden="true">→</span>
          </router-link>
          <router-link class="landing__btn landing__btn--ghost" :to="{ path: '/platform/data' }">
            浏览数据平台
          </router-link>
        </div>
        <ul class="landing__stats">
          <li v-for="stat in heroStats" :key="stat.label">
            <strong>{{ stat.value }}</strong><span>{{ stat.label }}</span>
          </li>
        </ul>
      </div>
      <div class="landing__visual">
        <p class="landing__vis-caption">研究链路 · 贯通式</p>
        <img
          class="landing__vis-art"
          src="/landing-hero.png"
          alt="研究链路示意：文献入库、图谱构建、问题研究、性能预测、报告沉淀"
          loading="eager"
          decoding="async"
        />
      </div>
    </section>

    <!-- 平台能力（占 1/3）：细横条目 + 线性图标 + 细分隔线 -->
    <section class="landing__section">
      <div class="landing__section-head">
        <h2>平台能力</h2>
      </div>
      <div class="landing__cards">
        <router-link
          v-for="cap in capabilities"
          :key="cap.title"
          class="landing__card"
          :class="[{ 'landing__card--wip': cap.status !== '已上线' }, `landing__card--${cap.tone}`]"
          :to="cap.route"
        >
          <span class="landing__card-icon"><AscIcon :name="cap.icon" /></span>
          <span class="landing__card-text">
            <span class="landing__card-title">
              {{ cap.title }}
              <em v-if="cap.status !== '已上线'" class="landing__badge">建设中</em>
            </span>
            <span class="landing__card-hint">{{ cap.hint }}</span>
          </span>
          <AscIcon
            name="chevron"
            class="landing__card-arrow"
            :class="{ 'landing__card-arrow--muted': cap.status !== '已上线' }"
          />
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
// 宣传首页：整页一屏（≥1180px 宽不滚动）。卡片数据在 config/landingCapabilities.js，
// 与平台真实模块一一对应（状态取自各模块实现，入口由单测校验不产生死链）。
import AscIcon from '../components/ui/AscIcon.vue'
import { landingCapabilities as capabilities } from '../config/landingCapabilities.js'

// Hero 关键数据（平台实测规模）
const heroStats = [
  { value: '17,698', label: '条文献' },
  { value: '6', label: '张数据主表' },
  { value: '4 × 7', label: '性能模型（属性 × 来源）' },
  { value: '4', label: '个模型服务' },
]
</script>

<style scoped>
/* 首页样式全部基于 tokens.css 的设计令牌：字体栈 / 字阶 / 字距 / 间距 / 圆角 / 渐变 / 阴影 / 缓动 */
.landing {
  /* 外壳页脚固定高度；首页占满其余高度，桌面宽度下不产生滚动 */
  --landing-footer-h: var(--asc-footer-h);
  --landing-gutter: clamp(28px, 4.2vw, 76px);   /* hero 与能力区共用同一侧边距，保证左右对齐 */
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--landing-footer-h));
  height: calc(100dvh - var(--landing-footer-h));
  overflow: hidden;
  color: var(--asc-heading);
  background: var(--asc-grad-page);
}

/* ── Hero（3/4） ── */
.landing__hero {
  position: relative;
  flex: 3 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  align-items: center;
  gap: clamp(24px, 4vw, 64px);
  padding: clamp(24px, 5vh, 64px) var(--landing-gutter) clamp(20px, 4vh, 44px);
  overflow: hidden;
}

.landing__glow {
  position: absolute;
  top: -160px;
  right: -60px;
  width: 620px;
  height: 460px;
  background: radial-gradient(closest-side, rgba(8, 105, 173, 0.14), transparent 70%);
  pointer-events: none;
}

.landing__hero-inner { position: relative; min-width: 0; }

.landing__eyebrow {
  margin: 0 0 clamp(12px, 2.2vh, 22px);
  color: #0a6bad;
  font-size: var(--asc-fs-micro);
  font-weight: 700;
  letter-spacing: var(--asc-track-caps);
  text-transform: uppercase;
}

.landing__title {
  margin: 0 0 clamp(14px, 2.4vh, 24px);
  font-size: var(--asc-fs-display);
  font-weight: 800;
  line-height: var(--asc-lh-tight);
  letter-spacing: var(--asc-track-tight);
  text-wrap: balance;
}

.landing__lead {
  max-width: 38em;
  margin: 0;
  color: #4a5f74;
  font-size: clamp(13.5px, 1.05vw, 16px);
  line-height: 1.75;
  letter-spacing: 0.002em;
}

.landing__cta { display: flex; flex-wrap: wrap; gap: var(--asc-sp-3); margin-top: clamp(18px, 3vh, 32px); }

.landing__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--asc-sp-2);
  padding: 12px 22px;
  border: 1px solid transparent;
  border-radius: var(--asc-radius-pill);
  font-size: var(--asc-fs-body);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-decoration: none;
  transition: transform var(--asc-transition-base), box-shadow var(--asc-transition-base),
    background var(--asc-transition-base), border-color var(--asc-transition-base);
}
.landing__btn--primary {
  background: var(--asc-grad-brand);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), var(--asc-shadow-md);
}
.landing__btn--primary:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 14px 30px rgba(8, 105, 173, 0.3); }
.landing__btn--ghost {
  border-color: rgba(8, 105, 173, 0.2);
  background: rgba(255, 255, 255, 0.86);
  color: var(--asc-primary);
}
.landing__btn--ghost:hover { transform: translateY(-2px); background: #fff; border-color: rgba(8, 105, 173, 0.34); }

/* 关键数据条：等宽数字 + 发丝竖分隔，强调纵向基线一致 */
.landing__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 6px;
  margin: clamp(18px, 3vh, 34px) 0 0;
  padding: 0;
  list-style: none;
}
.landing__stats li {
  display: flex;
  align-items: baseline;
  gap: var(--asc-sp-1);
  padding: 0 clamp(16px, 1.8vw, 30px);
  white-space: nowrap;
  border-left: 1px solid var(--asc-hairline);
}
.landing__stats li:first-child { padding-left: 0; border-left: 0; }
.landing__stats strong {
  color: #0a5c96;
  font-size: clamp(18px, 1.7vw, 24px);
  font-weight: 800;
  letter-spacing: var(--asc-track-tight);
  font-variant-numeric: tabular-nums;
}
.landing__stats span { color: #5c7591; font-size: var(--asc-fs-caption); font-weight: 500; }

/* 主视觉：品牌渐变面板 + 链路插画 */
.landing__visual {
  position: relative;
  align-self: stretch;
  justify-self: stretch;
  height: auto;
  min-height: clamp(150px, 24vh, 300px);
  max-height: 520px;
  margin: clamp(0px, 2vh, 22px) 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--asc-radius-xl);
  background: var(--asc-grad-panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), var(--asc-shadow-lg);
  overflow: hidden;
}
.landing__vis-caption {
  position: absolute;
  z-index: 1;
  inset: 0 0 auto;
  margin: 0;
  padding: var(--asc-sp-4) var(--asc-sp-4) var(--asc-sp-5);
  color: #eaf6fe;
  font-size: var(--asc-fs-caption);
  font-weight: 600;
  letter-spacing: 0.08em;
  /* 主视觉为不透明图片，图注改用顶部渐变蒙层保证可读性 */
  background: linear-gradient(180deg, rgba(6, 41, 70, 0.72) 0%, rgba(6, 41, 70, 0) 100%);
  pointer-events: none;
}

.landing__vis-art {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* ── 平台能力（1/4）：无框细栏 + 发丝分隔线界定区域 ── */
.landing__section {
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: clamp(10px, 1.6vh, 20px) var(--landing-gutter) clamp(8px, 1.4vh, 18px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.66));
  backdrop-filter: blur(6px);
}
.landing__section::before {
  content: '';
  position: absolute; inset: 0 0 auto 0; height: 1px;
  background: var(--asc-hairline);
}

.landing__section-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.4vw, 22px);
  margin-bottom: clamp(6px, 1vh, 12px);
}
.landing__section-head h2 {
  flex: 0 0 auto;
  margin: 0;
  color: #10243c;
  font-size: var(--asc-fs-h2);
  font-weight: 800;
  letter-spacing: 0;
}
/* 仅用一条发丝延长线收尾，不堆小字 */
.landing__section-head::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, var(--asc-hairline), rgba(16, 42, 67, 0));
}

.landing__cards {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 0;
}

.landing__card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--asc-sp-2);
  padding: clamp(4px, 0.9vh, 10px) clamp(10px, 1vw, 18px);
  border: 0;
  border-top: 1px solid var(--asc-hairline);
  border-radius: var(--asc-radius);
  background: transparent;
  color: inherit;
  text-decoration: none;
  transition: background var(--asc-transition-base);
}
.landing__card:nth-child(-n + 4) { border-top: 0; }
.landing__card:hover { background: rgba(10, 140, 200, 0.06); }
.landing__card:focus-visible { outline: 2px solid rgba(8, 105, 173, 0.55); outline-offset: -2px; }

.landing__card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: clamp(24px, 2.7vh, 30px);
  height: clamp(24px, 2.7vh, 30px);
  border-radius: 9px;
  background: var(--tile-bg, var(--asc-grad-brand-soft));
  box-shadow: inset 0 0 0 1px var(--tile-ring, rgba(8, 105, 173, 0.08));
  color: var(--tile-fg, #0a6bad);
  transition: transform var(--asc-transition-base), box-shadow var(--asc-transition-base);
}
.landing__card-icon :deep(.asc-icon) {
  width: clamp(14px, 1.7vh, 17px);
  height: clamp(14px, 1.7vh, 17px);
  stroke-width: 2;
}
.landing__card:hover .landing__card-icon { transform: scale(1.06); box-shadow: inset 0 0 0 1px var(--tile-ring, rgba(8, 105, 173, 0.12)), 0 4px 12px var(--tile-glow, rgba(8, 105, 173, 0.16)); }

/* 模块色彩分组（同一品牌内四个色相，避免杂色） */
/* 色调提高到"一眼可辨"的强度：底色更实、描边更亮，缩略图下也能读出分组 */
.landing__card--blue   { --tile-bg: linear-gradient(135deg, #d9eafb, #eef6ff); --tile-ring: rgba(8, 105, 173, 0.22);  --tile-fg: #0a6bad; --tile-glow: rgba(8, 105, 173, 0.2); }
.landing__card--indigo { --tile-bg: linear-gradient(135deg, #d9ddfb, #ecefff); --tile-ring: rgba(79, 70, 229, 0.28);  --tile-fg: #4f46e5; --tile-glow: rgba(79, 70, 229, 0.22); }
.landing__card--amber  { --tile-bg: linear-gradient(135deg, #fae6c8, #fff6e6); --tile-ring: rgba(183, 121, 31, 0.26); --tile-fg: #a86c12; --tile-glow: rgba(183, 121, 31, 0.2); }
.landing__card--teal   { --tile-bg: linear-gradient(135deg, #d6f1ec, #eefaf7); --tile-ring: rgba(15, 118, 110, 0.22);  --tile-fg: #0f766e; --tile-glow: rgba(15, 118, 110, 0.2); }

.landing__card-text { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.landing__card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #14293f;
  font-size: clamp(12.5px, 0.9vw, 13.5px);
  font-weight: 700;
  letter-spacing: 0;
  white-space: nowrap;
}
.landing__card-hint {
  color: #4a6076;
  font-size: clamp(11.5px, 0.76vw, 12px);
  line-height: 1.5;
}
.landing__badge {
  padding: 1px 6px;
  border: 1px solid rgba(16, 42, 67, 0.1);
  border-radius: var(--asc-radius-pill);
  background: #f5f7fa;
  color: #8296a8;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
}
.landing__card-arrow {
  width: 16px;
  height: 16px;
  margin-left: auto;
  flex: 0 0 auto;
  color: #9db4c8;
  transform: rotate(-90deg);
  transition: color var(--asc-transition-base), transform var(--asc-transition-base);
}
.landing__card:hover .landing__card-arrow { color: var(--asc-primary); transform: rotate(-90deg) translateX(3px); }
.landing__card-arrow--muted { color: #cbd8e3; }
.landing__card--wip:hover .landing__card-arrow { color: #cbd8e3; transform: rotate(-90deg); }

.landing__card--wip { opacity: 0.8; }
.landing__card--wip .landing__card-icon { background: #f2f5f9; box-shadow: none; color: #8ea2b5; }
.landing__card--wip .landing__card-title { color: #55708a; }
.landing__card--wip .landing__card-hint { color: #7d8fa3; }
.landing__card--wip:hover { background: rgba(10, 140, 200, 0.03); cursor: default; }

/* 窄屏：列数递减；宽度不足时放宽"一屏不滚动"，优先保证可读 */
@media (max-width: 1180px) {
  .landing {
    height: auto;
    min-height: calc(100dvh - var(--landing-footer-h));
    overflow: visible;
  }
  .landing__section { flex: 0 0 auto; }
  .landing__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(56px, auto); }
  .landing__hero { grid-template-columns: 1fr; }
  .landing__visual { display: none; }
}
@media (max-width: 720px) {
  .landing__cards { grid-template-columns: minmax(0, 1fr); }
}
</style>
