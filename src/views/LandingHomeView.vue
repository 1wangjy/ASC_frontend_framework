<template>
  <div class="landing">
    <!-- Hero -->
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
      <div class="landing__visual" aria-hidden="true">
        <div class="landing__vis-grid"></div>
        <div class="landing__vis-orb"></div>
        <div class="landing__vis-caption">知识图谱 · 结构示意</div>
      </div>
    </section>

    <!-- 平台能力：与平台真实模块一一对应（状态 + 标题 + 一句提示） -->
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
          <div class="landing__card-top">
            <span class="landing__card-icon">{{ cap.icon }}</span>
            <span class="landing__badge" :class="cap.status === '已上线' ? 'landing__badge--live' : 'landing__badge--wip'">
              {{ cap.status }}
            </span>
          </div>
          <h3>{{ cap.title }}</h3>
          <p>{{ cap.hint }}</p>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
// 宣传首页：整页一屏（不滚动）。卡片数据在 config/landingCapabilities.js，
// 与平台真实模块一一对应（状态取自各模块实现，入口由单测校验不产生死链）。
import { landingCapabilities as capabilities } from '../config/landingCapabilities.js'

// Hero 下方的关键数据条（均为平台实测规模，保持一行）
const heroStats = [
  { value: '17,698', label: '条文献' },
  { value: '6', label: '张数据主表' },
  { value: '4 × 7', label: '性能模型（属性 × 来源）' },
  { value: 'v1', label: '图谱版本管理' },
]
</script>

<style scoped>
.landing {
  /* 外壳页脚固定 50px；首页占满其余高度，全页不产生滚动 */
  --landing-footer-h: var(--asc-footer-h);
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--landing-footer-h));
  height: calc(100dvh - var(--landing-footer-h));
  overflow: hidden;
  color: var(--asc-heading);
  background: linear-gradient(180deg, #eef4fb 0%, #f7fafd 40%, #eef3f8 100%);
}

/* ── Hero（占整页 2/3） ── */
.landing__hero {
  position: relative;
  flex: 2 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: center;
  gap: clamp(20px, 3vw, 40px);
  padding: clamp(20px, 4.2vh, 52px) 40px clamp(14px, 3vh, 34px);
  overflow: hidden;
}

.landing__glow {
  position: absolute;
  top: -140px;
  right: -80px;
  width: 520px;
  height: 380px;
  background: radial-gradient(closest-side, rgba(8, 105, 173, 0.12), transparent 72%);
  pointer-events: none;
}

.landing__hero-inner { position: relative; min-width: 0; }

.landing__eyebrow {
  margin: 0 0 clamp(8px, 1.6vh, 16px);
  color: var(--asc-primary);
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.3em;
}

.landing__title {
  margin: 0 0 clamp(10px, 1.8vh, 18px);
  font-size: clamp(26px, 3.1vw, 42px);
  font-weight: 850;
  line-height: 1.22;
  letter-spacing: -0.6px;
}

.landing__lead {
  max-width: 46em;
  margin: 0;
  color: #40566d;
  font-size: clamp(13px, 1.05vw, 15px);
  line-height: 1.75;
}

.landing__cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: clamp(14px, 2.6vh, 28px); }

.landing__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.landing__btn--primary { background: var(--asc-primary); color: #fff; box-shadow: 0 8px 20px rgba(8, 105, 173, 0.24); }
.landing__btn--primary:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(8, 105, 173, 0.3); }
.landing__btn--ghost { border-color: #cfe0ee; background: rgba(255, 255, 255, 0.8); color: var(--asc-primary); }
.landing__btn--ghost:hover { transform: translateY(-1px); background: #fff; }

/* 主视觉：在 hero 内纵向拉伸，填满 2/3 高度 */
.landing__visual {
  position: relative;
  align-self: stretch;
  justify-self: stretch;
  height: auto;
  min-height: clamp(140px, 22vh, 260px);
  max-height: 460px;
  margin: clamp(0px, 1.6vh, 18px) 0;
  border: 1px solid #dbe7f2;
  border-radius: 18px;
  background: radial-gradient(120% 120% at 78% 22%, #0a6bad 0%, #0d4a7a 46%, #072f52 100%);
  box-shadow: 0 18px 40px rgba(8, 55, 95, 0.18);
  overflow: hidden;
}
.landing__vis-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 34px 34px;
}
.landing__vis-orb {
  position: absolute; top: 50%; left: 50%;
  width: clamp(90px, 14vh, 170px); height: clamp(90px, 14vh, 170px);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(122, 214, 248, 0.85), rgba(10, 105, 173, 0.16) 62%, transparent 72%);
  box-shadow: 0 0 70px rgba(255, 255, 255, 0.25);
}
.landing__vis-caption {
  position: absolute; left: 14px; bottom: 12px;
  padding: 5px 9px; border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.86);
  font-size: 11px; letter-spacing: 0.06em;
}

/* Hero 关键数据条：填补 2/3 区域的留白，同时给出真实规模 */
.landing__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  margin: clamp(14px, 2.4vh, 26px) 0 0;
  padding: 0;
  list-style: none;
}
.landing__stats li { display: flex; align-items: baseline; gap: 6px; }
.landing__stats strong {
  color: var(--asc-primary);
  font-size: clamp(16px, 1.5vw, 20px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.landing__stats span { color: #55708a; font-size: 12.5px; }

/* ── 平台能力：固定占整页 1/3，并作为"被划定的区域"呈现 ── */
.landing__section {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: clamp(14px, 2.4vh, 26px) 40px clamp(12px, 2.2vh, 28px);
  border-top: 1px solid #dde8f3;
  border-radius: 20px 20px 0 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.72));
  box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.9) inset;
}

.landing__section-head { flex: 0 0 auto; margin-bottom: clamp(8px, 1.6vh, 18px); }
.landing__section-head h2 {
  margin: 0 0 4px;
  font-size: clamp(18px, 1.5vw, 22px);
  font-weight: 800;
  letter-spacing: -0.3px;
}
.landing__section-head p { margin: 0; color: #5b7085; font-size: 12.5px; }

/* 8 张卡：能力区固定占 1/3 高，单行 8 列排布 —— 两行会在 1/3 高度内被压到 100px 以下并裁切文字。
   列数固定（不用 auto-fit），避免出现 3+3+2 这类空位。 */
.landing__cards {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: clamp(8px, 1.2vh, 16px);
}
/* 窄屏（卡片宽度撑不开 8 列）：改为 2 / 1 列，并放宽"一屏不滚动 + 1/3 高度"约束，
   优先保证卡片可读（窄屏滚动是正常预期）。 */
/* 窄于 1180px：单行 8 列会把卡片压到 ~100px 以下（标题被省略），改为 4 / 2 / 1 列，
   同时放宽"1/3 高度 + 不滚动"（优先保证卡片可读，窄窗口出现滚动是合理预期）。 */
@media (max-width: 1180px) {
  .landing {
    height: auto;
    min-height: calc(100dvh - var(--landing-footer-h));
    overflow: visible;
  }
  .landing__section { flex: 0 0 auto; }
  .landing__cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(112px, auto);
  }
}
@media (max-width: 900px) {
  .landing__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .landing__cards { grid-template-columns: minmax(0, 1fr); }
}

.landing__card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: clamp(12px, 1.9vh, 20px) clamp(14px, 1.3vw, 20px);
  border: 1px solid #e2ecf5;
  border-radius: 14px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  box-shadow: 0 6px 18px rgba(15, 55, 88, 0.06);
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.landing__card:hover { transform: translateY(-3px); border-color: #bcd8ec; box-shadow: 0 12px 28px rgba(8, 105, 173, 0.14); }
.landing__card:focus-visible { outline: 2px solid var(--asc-primary); outline-offset: 2px; }

/* 建设中：虚线 + 降饱和 + 无悬停升起 */
.landing__card--wip { background: #fbfcfe; border-style: dashed; filter: saturate(0.85); opacity: 0.94; }
.landing__card--wip .landing__card-icon { background: #eef1f5; }
.landing__card--wip:hover { transform: none; border-color: #e2ecf5; box-shadow: 0 6px 18px rgba(15, 55, 88, 0.06); }

.landing__card-top { display: flex; align-items: center; justify-content: space-between; }
.landing__card-icon {
  display: grid; place-items: center;
  width: clamp(30px, 4.4vh, 38px); height: clamp(30px, 4.4vh, 38px);
  border-radius: 10px;
  background: var(--asc-primary-soft);
  font-size: clamp(16px, 2.2vh, 20px);
}
.landing__badge {
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
.landing__badge--live { background: #e7f7ef; border-color: #bfe9d3; color: #0e7a4c; }
.landing__badge--wip { background: #f4f7fa; border-color: #e2e8ee; color: #7c8b98; }

.landing__card h3 {
  margin: 0;
  font-size: clamp(14px, 1.05vw, 16px);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.landing__card p {
  margin: 0;
  min-height: calc(2 * 1.5em);   /* 统一两行高度，保证 8 张卡基线一致 */
  color: #4a6076;
  font-size: clamp(11.5px, 0.82vw, 12.5px);
  line-height: 1.5;
}

@media (max-width: 860px) {
  .landing__hero { grid-template-columns: 1fr; padding-top: 40px; }
  .landing__visual { display: none; }
}

/* 极矮视口：进一步压缩 Hero，保持一屏不滚动 */
@media (max-height: 720px) {
  .landing__hero { grid-template-columns: 1fr; padding-block: 18px 14px; }
  .landing__visual { display: none; }
  .landing__eyebrow { margin-bottom: 6px; }
}

</style>
