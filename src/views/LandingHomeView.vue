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
          贯通「文献 · 知识图谱 · 问答 · 性能预测 · 报告」的全流程 AI 科研闭环，
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

    <!-- 平台能力 -->
    <section class="landing__section">
      <div class="landing__section-head">
        <h2>平台能力</h2>
        <p>从原始文献到可解释结论的完整研究链路</p>
      </div>
      <div class="landing__cards">
        <article class="landing__card">
          <div class="landing__card-icon">📚</div>
          <h3>文献与知识图谱</h3>
          <p>多源文献整理、实体抽取与图谱构建，沉淀领域知识基座。</p>
        </article>
        <article class="landing__card">
          <div class="landing__card-icon">💬</div>
          <h3>智能问答</h3>
          <p>面向配方、工艺、结构与性能的深度问答，附可追溯证据。</p>
        </article>
        <article class="landing__card">
          <div class="landing__card-icon">📈</div>
          <h3>性能预测与优化</h3>
          <p>基于配方与工况的模型预测、配方优化与服役评估。</p>
        </article>
        <article class="landing__card">
          <div class="landing__card-icon">📄</div>
          <h3>研究报告生成</h3>
          <p>自动汇总研究过程与证据，一键生成结构化工况报告。</p>
        </article>
      </div>
    </section>

    <!-- 研究流程 -->
    <section class="landing__section landing__section--flow">
      <div class="landing__section-head">
        <h2>研究流程</h2>
      </div>
      <ol class="landing__flow">
        <li><span class="landing__flow-no">01</span><strong>文献管理</strong><em>导入并整理研究资料</em></li>
        <li><span class="landing__flow-no">02</span><strong>图谱构建</strong><em>抽取实体与关系</em></li>
        <li><span class="landing__flow-no">03</span><strong>问题研究</strong><em>深度问答与推理</em></li>
        <li><span class="landing__flow-no">04</span><strong>报告生成</strong><em>沉淀研究结论</em></li>
      </ol>
    </section>

    <!-- 入口 / 页脚 -->
    <footer class="landing__foot">
      <span class="landing__foot-mark">ASC</span>
      <div class="landing__foot-links">
        <router-link :to="{ name: 'AscQa' }">问题研究</router-link>
        <router-link to="/platform/data">数据平台</router-link>
        <router-link to="/platform/models">模型入口</router-link>
      </div>
      <p class="landing__foot-note">ASC 耐火材料智能研究平台 · 内部演示环境</p>
    </footer>
  </div>
</template>

<script setup>
// 宣传首页：纯图文占位，不含业务逻辑。
// 各能力卡片与流程为静态示意，点击入口跳转到对应功能模块。
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
  border-radius: 18px;
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

.landing__section--flow { background: rgba(255, 255, 255, 0.6); border-top: 1px solid #e5edf5; border-bottom: 1px solid #e5edf5; }

.landing__section-head { margin-bottom: 32px; }
.landing__section-head h2 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.landing__section-head p { margin: 0; color: var(--asc-muted); font-size: 14px; }

.landing__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 20px;
}

.landing__card {
  padding: 26px 24px;
  border: 1px solid #e2ecf5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 55, 88, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.landing__card:hover { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(8, 105, 173, 0.12); }

.landing__card-icon { font-size: 30px; margin-bottom: 16px; }
.landing__card h3 { margin: 0 0 10px; font-size: 18px; font-weight: 700; }
.landing__card p { margin: 0; color: var(--asc-muted); font-size: 13.5px; line-height: 1.7; }

/* ── Flow ── */
.landing__flow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.landing__flow li {
  position: relative;
  padding: 20px 20px 20px 54px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2ecf5;
}
.landing__flow-no {
  position: absolute;
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
  color: var(--asc-primary);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 20px;
  font-weight: 800;
}
.landing__flow strong { display: block; font-size: 15px; }
.landing__flow em { color: var(--asc-muted); font-size: 12px; font-style: normal; }

/* ── Footer ── */
.landing__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 40px 56px;
}
.landing__foot-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
}
.landing__foot-links { display: flex; gap: 22px; }
.landing__foot-links a { color: var(--asc-text); font-size: 14px; text-decoration: none; }
.landing__foot-links a:hover { color: var(--asc-primary); }
.landing__foot-note { color: var(--asc-muted); font-size: 12px; }

@media (max-width: 860px) {
  .landing__hero { grid-template-columns: 1fr; padding-top: 56px; }
  .landing__visual { min-height: 220px; }
}
</style>
