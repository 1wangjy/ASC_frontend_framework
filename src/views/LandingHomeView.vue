<template>
  <div class="landing">
    <!-- Hero -->
    <section class="landing__hero">
      <div class="landing__glow" aria-hidden="true"></div>
      <div class="landing__hero-inner">
        <p class="landing__eyebrow">MATERIALS INTELLIGENCE · RESEARCH PLATFORM</p>
        <h1 class="landing__title">
          面向耐火材料研究的<br />智能设计平台
        </h1>
        <p class="landing__lead">
          贯通「文献 · 数据平台 · 知识图谱 · 问题研究 · 性能预测与配方优化 · 报告」的全流程 AI 科研闭环，
          让每一次材料决策都有据可依。
        </p>
        <div class="landing__cta">
          <router-link class="landing__btn landing__btn--primary" :to="{ name: 'AscQa' }">
            开始问题研究 <span aria-hidden="true">→</span>
          </router-link>
          <router-link class="landing__btn landing__btn--ghost" :to="{ path: '/platform/data' }">
            浏览数据平台
          </router-link>
        </div>
      </div>
      <!-- 主视觉占位 -->
      <div class="landing__visual" aria-hidden="true">
        <div class="landing__vis-grid"></div>
        <div class="landing__vis-orb"></div>
        <div class="landing__vis-caption">知识图谱 · 结构示意占位</div>
      </div>
    </section>

    <!-- 平台能力：与平台真实模块一一对应 -->
    <section class="landing__section">
      <div class="landing__section-head">
        <h2>平台能力</h2>
        <p>对应平台真实模块，卡片入口需登录后使用</p>
      </div>
      <div class="landing__cards">
        <router-link
          v-for="cap in capabilities"
          :key="cap.title"
          class="landing__card landing__card--link"
          :class="{ 'landing__card--wip': cap.status !== '已上线' }"
          :to="cap.route"
        >
          <div class="landing__card-top">
            <div class="landing__card-icon">{{ cap.icon }}</div>
            <span class="landing__badge" :class="cap.status === '已上线' ? 'landing__badge--live' : 'landing__badge--wip'">
              {{ cap.status }}
            </span>
          </div>
          <h3>{{ cap.title }}</h3>
          <p>{{ cap.desc }}</p>
          <ul class="landing__facts">
            <li v-for="fact in cap.facts" :key="fact">{{ fact }}</li>
          </ul>
          <span class="landing__more">{{ cap.status === '已上线' ? '进入 →' : '建设中 · 敬请期待' }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
// 宣传首页：静态展示。能力卡片数据在 config/landingCapabilities.js，
// 与平台真实模块一一对应（状态与事实取自各模块实现与本机实测，入口由单测校验不产生死链）。
import { landingCapabilities as capabilities } from '../config/landingCapabilities.js'
</script>

<style scoped>
.landing {
  min-height: 100vh;
  color: var(--asc-heading);
  background: linear-gradient(180deg, #eef4fb 0%, #f7fafd 40%, #eef3f8 100%);
}

/* ── Hero ── */
.landing__hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  align-items: center;
  gap: 40px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 84px 40px 72px;
  overflow: hidden;
}

.landing__glow {
  position: absolute;
  top: -140px;
  right: -80px;
  width: 560px;
  height: 420px;
  background: radial-gradient(closest-side, rgba(8, 105, 173, 0.12), transparent 72%);
  pointer-events: none;
}

.landing__hero-inner { position: relative; }

.landing__eyebrow {
  margin: 0 0 18px;
  color: var(--asc-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.32em;
}

.landing__title {
  margin: 0 0 22px;
  font-size: clamp(34px, 4.6vw, 54px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.12;
  background: linear-gradient(120deg, #0b3a5f 0%, #0869ad 60%, #12a1c7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.landing__lead {
  margin: 0 0 34px;
  max-width: 560px;
  color: var(--asc-text);
  font-size: 16px;
  line-height: 1.8;
}

.landing__cta { display: flex; gap: 14px; flex-wrap: wrap; }

.landing__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 24px;
  border-radius: 9px;
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.landing__btn--primary {
  background: linear-gradient(135deg, #0a6fb8, #0869ad 60%, #0e5c94);
  color: #fff;
  box-shadow: 0 12px 28px rgba(8, 105, 173, 0.3);
}
.landing__btn--primary:hover { transform: translateY(-2px); }

.landing__btn--ghost {
  border: 1px solid var(--asc-border-strong);
  background: #fff;
  color: var(--asc-primary);
}
.landing__btn--ghost:hover { transform: translateY(-2px); }

/* Hero visual placeholder */
.landing__visual {
  position: relative;
  min-height: 340px;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(160deg, #0a3d6b, #0869ad 70%, #12a1c7);
  box-shadow: 0 30px 60px rgba(8, 60, 105, 0.24);
}

.landing__vis-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 34px 34px;
}

.landing__vis-orb {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180px;
  height: 180px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.06) 60%);
  box-shadow: 0 0 70px rgba(255, 255, 255, 0.25);
}

.landing__vis-caption {
  position: absolute;
  left: 16px;
  bottom: 14px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.86);
  font-size: 11px;
  letter-spacing: 0.08em;
}

/* ── Sections ── */
.landing__section {
  max-width: 1240px;
  margin: 0 auto;
  padding: 48px 40px;
}

.landing__section-head { margin-bottom: 32px; }
.landing__section-head h2 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.landing__section-head p { margin: 0; color: var(--asc-muted); font-size: 14px; }

/* 8 张能力卡：按 4 / 2 / 1 列排版，避免 auto-fit 出现 3+3+2 的空位 */
.landing__cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (min-width: 1080px) {
  .landing__cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .landing__cards { grid-template-columns: minmax(0, 1fr); }
}

.landing__card {
  display: flex;
  flex-direction: column;
  padding: 24px 22px;
  border: 1px solid #e2ecf5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 55, 88, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.landing__card:hover { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(8, 105, 173, 0.12); }
.landing__card--link { color: inherit; text-decoration: none; }
.landing__card--link:hover { border-color: #bcd8ec; }
.landing__card--link:focus-visible { outline: 2px solid var(--asc-primary); outline-offset: 2px; }

/* 建设中：整体弱化（虚线边框 + 降饱和 + 无悬停升起），与 7 张已上线卡片区分 */
.landing__card--wip {
  background: #fbfcfe; border-style: dashed;
  filter: saturate(0.85); opacity: 0.94;
}
.landing__card--wip .landing__card-icon { background: #eef1f5; }
.landing__card--wip:hover { transform: none; box-shadow: 0 8px 24px rgba(15, 55, 88, 0.06); border-color: #e2ecf5; }

.landing__card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.landing__card-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--asc-primary-soft); font-size: 22px; }
.landing__badge {
  padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.02em;
  border: 1px solid transparent; white-space: nowrap;
}
.landing__badge--live { background: #e7f7ef; border-color: #bfe9d3; color: #0e7a4c; }
.landing__badge--wip { background: #f4f7fa; border-color: #e2e8ee; color: #7c8b98; }

.landing__card h3 { margin: 0 0 8px; font-size: 17px; font-weight: 700; }
/* 能力卡正文用更深的灰（4.5:1 以上），比 --asc-muted 更易读 */
.landing__card p { margin: 0; color: #40566d; font-size: 13.5px; line-height: 1.7; }

.landing__facts { margin: 14px 0 16px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
.landing__facts li {
  position: relative; padding-left: 15px; color: #33495e; font-size: 12.5px; line-height: 1.6;
}
.landing__facts li::before {
  content: ''; position: absolute; left: 2px; top: 8px;
  width: 5px; height: 5px; border-radius: 50%; background: var(--asc-primary); opacity: .55;
}
.landing__more {
  margin-top: auto; padding-top: 12px; border-top: 1px solid #eef3f8;
  color: var(--asc-primary); font-size: 12.5px; font-weight: 700;
}
.landing__card--wip .landing__more { color: #8a9aa9; }

@media (max-width: 860px) {
  .landing__hero { grid-template-columns: 1fr; padding-top: 56px; }
  .landing__visual { min-height: 220px; }
}
</style>
