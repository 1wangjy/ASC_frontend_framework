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
        <div class="landing__vis-grid" aria-hidden="true"></div>
        <div class="landing__vis-orb" aria-hidden="true"></div>
        <p class="landing__vis-caption">研究链路 · 贯通式</p>
        <ol class="landing__vis-steps">
          <li v-for="(step, i) in pipelineSteps" :key="step">
            <span>{{ String(i + 1).padStart(2, '0') }}</span>{{ step }}
          </li>
        </ol>
      </div>
    </section>

    <!-- 平台能力（占 1/3）：细横条目 + 线性图标 + 细分隔线 -->
    <section class="landing__section">
      <div class="landing__section-head">
        <h2>平台能力</h2>
        <p>对应平台真实模块 · 入口需登录后使用</p>
      </div>
      <div class="landing__cards">
        <router-link
          v-for="cap in capabilities"
          :key="cap.title"
          class="landing__card"
          :class="{ 'landing__card--wip': cap.status !== '已上线' }"
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

// 主视觉里的真实研究链路（与平台模块一致）
const pipelineSteps = ['文献入库', '图谱构建', '问题研究', '性能预测', '报告沉淀']

// Hero 关键数据（平台实测规模）
const heroStats = [
  { value: '17,698', label: '条文献' },
  { value: '6', label: '张数据主表' },
  { value: '4 × 7', label: '性能模型（属性 × 来源）' },
  { value: '4', label: '个模型服务' },
]
</script>

<style scoped>
.landing {
  /* 外壳页脚固定高度；首页占满其余高度，桌面宽度下不产生滚动 */
  --landing-footer-h: var(--asc-footer-h);
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--landing-footer-h));
  height: calc(100dvh - var(--landing-footer-h));
  overflow: hidden;
  color: var(--asc-heading);
  background:
    radial-gradient(120% 90% at 88% 6%, rgba(10, 163, 216, 0.1), transparent 60%),
    linear-gradient(180deg, #f3f7fc 0%, #fbfcfe 46%, #eef3f9 100%);
}

/* ── Hero（2/3） ── */
.landing__hero {
  position: relative;
  flex: 2 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  align-items: center;
  gap: clamp(24px, 4vw, 64px);
  padding: clamp(24px, 5vh, 64px) 56px clamp(20px, 4vh, 44px);
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
  color: var(--asc-primary);
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.34em;
  text-transform: uppercase;
}

.landing__title {
  margin: 0 0 clamp(14px, 2.4vh, 24px);
  font-size: clamp(30px, 3.5vw, 52px);
  font-weight: 800;
  line-height: 1.16;
  letter-spacing: -1px;
}

.landing__lead {
  max-width: 40em;
  margin: 0;
  color: #45596e;
  font-size: clamp(13.5px, 1.05vw, 16px);
  line-height: 1.8;
}

.landing__cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: clamp(18px, 3vh, 32px); }

.landing__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 22px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.landing__btn--primary {
  background: linear-gradient(135deg, #0a6bad, #0d8ecb);
  color: #fff;
  box-shadow: 0 10px 26px rgba(8, 105, 173, 0.28);
}
.landing__btn--primary:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(8, 105, 173, 0.34); }
.landing__btn--ghost { border-color: #cededf; background: rgba(255, 255, 255, 0.85); color: var(--asc-primary); }
.landing__btn--ghost:hover { transform: translateY(-2px); background: #fff; border-color: #b6d3e8; }

/* 关键数据条：细分隔线而非方块，整体更疏朗 */
.landing__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 0;
  margin: clamp(18px, 3vh, 34px) 0 0;
  padding: 0;
  list-style: none;
}
.landing__stats li {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 0 clamp(14px, 1.5vw, 24px);
  border-left: 1px solid #d8e4ef;
}
.landing__stats li:first-child { padding-left: 0; border-left: 0; }
.landing__stats strong {
  color: #0a5c96;
  font-size: clamp(18px, 1.7vw, 24px);
  font-weight: 800;
  letter-spacing: -0.4px;
  font-variant-numeric: tabular-nums;
}
.landing__stats span { color: #5c7591; font-size: 12.5px; }

/* 主视觉：在 hero 内纵向拉伸 */
.landing__visual {
  position: relative;
  align-self: stretch;
  justify-self: stretch;
  height: auto;
  min-height: clamp(150px, 24vh, 280px);
  max-height: 440px;
  margin: clamp(0px, 2vh, 22px) 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 24px;
  background: radial-gradient(115% 120% at 76% 20%, #0f7fbe 0%, #0d4d7d 45%, #072b4b 100%);
  box-shadow: 0 24px 60px rgba(6, 42, 74, 0.22);
  overflow: hidden;
}
.landing__vis-caption {
  position: absolute; top: clamp(12px, 2vh, 20px); left: clamp(14px, 1.4vw, 22px);
  margin: 0; color: rgba(255, 255, 255, 0.72); font-size: 11px; letter-spacing: 0.16em;
}
.landing__vis-steps {
  position: absolute; left: clamp(14px, 1.4vw, 22px); right: clamp(14px, 1.4vw, 22px); bottom: clamp(12px, 2vh, 20px);
  display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; padding: 0; list-style: none;
}
.landing__vis-steps li {
  display: inline-flex; align-items: center; gap: 6px;
  color: rgba(255, 255, 255, 0.9); font-size: 11.5px; font-weight: 600;
}
.landing__vis-steps span {
  color: rgba(173, 222, 250, 0.85);
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; font-weight: 700;
}
.landing__vis-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 40px 40px;
}
.landing__vis-orb {
  position: absolute; top: 50%; left: 50%;
  width: clamp(110px, 16vh, 200px); height: clamp(110px, 16vh, 200px);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(140, 222, 252, 0.9), rgba(10, 105, 173, 0.14) 60%, transparent 72%);
  box-shadow: 0 0 90px rgba(190, 240, 255, 0.35);
}

/* ── 平台能力（1/3）：细横条目 4 × 2 ── */
.landing__section {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: clamp(16px, 2.4vh, 28px) 56px clamp(14px, 2.2vh, 26px);
  border-top: 1px solid #e1eaf3;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(6px);
}

.landing__section-head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: clamp(10px, 1.8vh, 18px);
}
.landing__section-head h2 {
  margin: 0;
  font-size: clamp(15px, 1.2vw, 18px);
  font-weight: 800;
  letter-spacing: -0.2px;
}
.landing__section-head p { margin: 0; color: #64798f; font-size: 12px; }

.landing__cards {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 0;
}

/* 无框细栏：仅用发丝分隔线与悬停高亮，避免 8 个方框造成的拥挤感 */
.landing__card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 clamp(10px, 1.1vw, 20px);
  border: 0;
  border-top: 1px solid #e8eff6;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-decoration: none;
  transition: background 0.16s ease;
}
.landing__card:nth-child(-n + 4) { border-top: 0; }
.landing__card:hover { background: rgba(10, 140, 200, 0.06); }
.landing__card:focus-visible { outline: 2px solid var(--asc-primary); outline-offset: -2px; }

.landing__card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: clamp(30px, 3.6vh, 38px);
  height: clamp(30px, 3.6vh, 38px);
  border-radius: 10px;
  background: linear-gradient(135deg, #eaf4fd, #f5fafe);
  color: #0a6bad;
}
.landing__card-icon :deep(.asc-icon) { width: 18px; height: 18px; }

.landing__card-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.landing__card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #17324d;
  font-size: clamp(13px, 0.98vw, 14.5px);
  font-weight: 700;
  white-space: nowrap;
}
.landing__card-hint {
  color: #52687f;
  font-size: clamp(11.5px, 0.8vw, 12.5px);
  line-height: 1.45;
  /* 允许两行：窄窗口下不至于被省略号截断（行高足够容纳两行） */
}
.landing__badge {
  padding: 1px 6px;
  border: 1px solid #e2e8ee;
  border-radius: 999px;
  background: #f5f7fa;
  color: #8296a8;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.landing__card-arrow {
  width: 16px;
  height: 16px;
  margin-left: auto;
  flex: 0 0 auto;
  color: #9db4c8;
  transform: rotate(-90deg);
  transition: color 0.16s ease, transform 0.16s ease;
}
.landing__card:hover .landing__card-arrow { color: var(--asc-primary); transform: rotate(-90deg) translateX(3px); }
/* 建设中：保留箭头以维持行内节奏，但明显弱化 */
.landing__card-arrow--muted { color: #cbd8e3; }
.landing__card--wip:hover .landing__card-arrow { color: #cbd8e3; transform: rotate(-90deg); }

.landing__card--wip { opacity: 0.72; }
.landing__card--wip .landing__card-icon { background: #f2f5f9; color: #8ea2b5; }
.landing__card--wip .landing__card-title { color: #55708a; }
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
  .landing__hero, .landing__section { padding-inline: 24px; }
}
</style>
