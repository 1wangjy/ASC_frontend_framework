<template>
  <div class="platform-page model2-page m2-page">
    <!-- ════ Compact page header ════ -->
    <div class="page-header m2-header">
      <div class="m2-header__titles">
        <h1>配方优化</h1>
        <div class="m2-header__chips">
          <span class="m2-chip m2-chip--brand"><i class="m2-dot m2-dot--live" />代理预测模型 · 96 原料</span>
          <span class="m2-chip">19 项性能属性</span>
          <span v-if="hasRun && optResult" class="m2-chip m2-chip--ok">
            最近 · {{ algoName(optResult.algorithm) }} / {{ optResult.iterations }} 轮 · 最优 {{ fmt(optResult.best_objective) }}
          </span>
          <span v-else-if="status === 'running'" class="m2-chip m2-chip--running"><i class="m2-spin" /> 实时搜索中</span>
        </div>
      </div>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <!-- ════ One card · two columns: LEFT config / RIGHT live results ════ -->
    <div class="card m2-shell m2-layout">
      <!-- ── LEFT: 目标定义 + 搜索配置 (compact, stacked) ── -->
      <aside class="m2-left" aria-label="优化配置">
        <!-- 目标定义 -->
        <section class="m2-sec" aria-label="目标定义">
          <header class="m2-sec__head">
            <div>
              <h3 class="m2-sec__title">目标定义</h3>
              <p class="m2-sec__sub">性能目标 · 方向 · 阈值</p>
            </div>
            <span class="m2-count-pill">已设 {{ targets.length }} 项目标</span>
          </header>

          <div class="m2-presets" role="group" aria-label="目标预设">
            <span class="m2-presets__label">预设</span>
            <button
              v-for="ps in PRESETS"
              :key="ps.id"
              type="button"
              class="m2-preset-chip"
              :disabled="status === 'running'"
              @click="applyPreset(ps)"
            >{{ ps.label }}</button>
          </div>

          <div v-if="targets.length" class="m2-goals">
            <div v-for="(t, i) in targets" :key="i" class="m2-goal-row">
              <div class="m2-goal-row__line1">
                <label class="m2-sr" :for="`goal-prop-${i}`">目标属性 {{ i + 1 }}</label>
                <select :id="`goal-prop-${i}`" v-model="t.name" class="m2-select m2-select--prop" :disabled="status === 'running'">
                  <optgroup v-for="g in propGroups" :key="g.label" :label="g.label">
                    <option v-for="p in g.items" :key="p" :value="p">{{ p }}</option>
                  </optgroup>
                </select>
                <button type="button" class="m2-remove" :disabled="status === 'running' || targets.length <= 1" aria-label="删除此目标" title="删除此目标" @click="removeTarget(i)">✕</button>
              </div>
              <div class="m2-goal-row__line2">
                <div class="m2-goal__dir" role="radiogroup" :aria-label="`目标 ${i + 1} 方向`">
                  <button
                    type="button" role="radio" :aria-checked="t.direction === 'maximize'"
                    class="m2-seg" :class="{ 'is-on': t.direction === 'maximize' }"
                    :disabled="status === 'running'" :title="'越大越好'" @click="setDir(t, 'maximize')"
                  >↑ 越大</button>
                  <button
                    type="button" role="radio" :aria-checked="t.direction === 'minimize'"
                    class="m2-seg" :class="{ 'is-on': t.direction === 'minimize' }"
                    :disabled="status === 'running'" :title="'越小越好'" @click="setDir(t, 'minimize')"
                  >↓ 越小</button>
                  <button
                    type="button" role="radio" :aria-checked="t.direction === 'constrain'"
                    class="m2-seg" :class="{ 'is-on': t.direction === 'constrain' }"
                    :disabled="status === 'running'" :title="'约束在区间内'" @click="setDir(t, 'constrain')"
                  >≋ 区间</button>
                </div>
                <div class="m2-goal__bounds">
                  <div v-if="t.direction === 'maximize'" class="m2-bound">
                    <span class="m2-bound__label">≥目标</span>
                    <div class="m2-stepper">
                      <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="减小下限" @click="bump(t,'lower',-stepFor(t))">−</button>
                      <input class="m2-step-val" type="number" step="any" v-model.number="t.lower" :disabled="status==='running'" :aria-label="`目标 ${i + 1} 下限`">
                      <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="增大下限" @click="bump(t,'lower',stepFor(t))">+</button>
                    </div>
                  </div>
                  <div v-else-if="t.direction === 'minimize'" class="m2-bound">
                    <span class="m2-bound__label">≤目标</span>
                    <div class="m2-stepper">
                      <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="减小上限" @click="bump(t,'upper',-stepFor(t))">−</button>
                      <input class="m2-step-val" type="number" step="any" v-model.number="t.upper" :disabled="status==='running'" :aria-label="`目标 ${i + 1} 上限`">
                      <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="增大上限" @click="bump(t,'upper',stepFor(t))">+</button>
                    </div>
                  </div>
                  <template v-else>
                    <div class="m2-bound">
                      <span class="m2-bound__label">下限</span>
                      <div class="m2-stepper">
                        <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="减小下限" @click="bump(t,'lower',-stepFor(t))">−</button>
                        <input class="m2-step-val" type="number" step="any" v-model.number="t.lower" :disabled="status==='running'" :aria-label="`目标 ${i + 1} 区间下限`">
                        <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="增大下限" @click="bump(t,'lower',stepFor(t))">+</button>
                      </div>
                    </div>
                    <div class="m2-bound">
                      <span class="m2-bound__label">上限</span>
                      <div class="m2-stepper">
                        <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="减小上限" @click="bump(t,'upper',-stepFor(t))">−</button>
                        <input class="m2-step-val" type="number" step="any" v-model.number="t.upper" :disabled="status==='running'" :aria-label="`目标 ${i + 1} 区间上限`">
                        <button type="button" class="m2-step-btn" :disabled="status==='running'" aria-label="增大上限" @click="bump(t,'upper',stepFor(t))">+</button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="m2-goals-empty">
            尚未定义目标 —— 将使用系统默认目标。
            <button type="button" class="m2-link-btn" @click="applyPreset(PRESETS[0])">载入默认</button>
          </div>

          <div class="m2-goal__actions">
            <button type="button" class="m2-link-btn" :disabled="status==='running'" @click="addTarget">＋ 添加目标属性</button>
          </div>
        </section>

        <!-- 搜索配置 -->
        <section class="m2-sec" aria-label="搜索配置">
          <header class="m2-sec__head">
            <div>
              <h3 class="m2-sec__title">搜索配置</h3>
              <p class="m2-sec__sub">优化器 · 采样预算</p>
            </div>
          </header>

          <div class="m2-opt-list" role="radiogroup" aria-label="优化算法">
            <button
              v-for="a in ALGORITHMS" :key="a.id"
              type="button" role="radio" :aria-checked="algorithm === a.id"
              class="m2-opt-tile" :class="{ 'is-on': algorithm === a.id }"
              :disabled="status === 'running'"
              @click="algorithm = a.id"
            >
              <span class="m2-opt-tile__top">
                <span class="m2-opt-tile__name">{{ a.name }}</span>
                <span class="m2-opt-tag">{{ a.tag }}</span>
                <span v-if="algorithm === a.id" class="m2-opt-check" aria-hidden="true">✓</span>
              </span>
              <span class="m2-opt-tile__note">{{ a.note }}</span>
            </button>
          </div>

          <div class="m2-budget">
            <div class="m2-budget__head">
              <label for="m2-budget" class="m2-budget__label">搜索预算（迭代 / 采样轮次）</label>
              <output class="m2-budget__val" for="m2-budget">{{ budget }}</output>
            </div>
            <input id="m2-budget" v-model.number="budget" type="range" min="10" max="300" step="5"
                   :disabled="status === 'running'" class="m2-budget__range">
            <div class="m2-budget__ticks"><span>10</span><span>150</span><span>300</span></div>
          </div>

          <p class="m2-opt-hint">
            在 96 种原料配比空间内迭代采样，实时回传 best-so-far 收敛轨迹，返回 <strong>{{ algoName(algorithm) }}</strong> 的最优配方与 Pareto 前沿。
          </p>
        </section>

        <!-- action row -->
        <div class="m2-left__actions">
          <div v-if="errorMsg" class="status-message error" role="alert" style="margin:0">{{ errorMsg }}</div>
          <div class="m2-left__btns">
            <button type="button" class="m2-run-btn" :disabled="status === 'running'" @click="runOptimize">
              <span v-if="status === 'running'" class="m2-run__spinner" aria-hidden="true"></span>
              <span v-if="status === 'running'">搜索中 · 已评估 {{ evaluatedCount }}/{{ budget }}</span>
              <span v-else>开始优化</span>
              <span v-if="status === 'running'" class="m2-dots" aria-hidden="true"><i /><i /><i /></span>
            </button>
            <button type="button" class="m2-reset-btn" :disabled="status === 'running'" @click="resetAll">重置</button>
          </div>
        </div>
      </aside>

      <!-- ── RIGHT: header chips + sub-tabs panel ── -->
      <section class="m2-right" aria-label="优化结果面板">
        <div class="m2-right__chips">
          <span v-if="status === 'running'" class="m2-chip m2-chip--running"><i class="m2-spin" />实时搜索中 · 已评估 {{ evaluatedCount }}/{{ budget }}</span>
          <span v-else-if="hasRun && optResult" class="m2-chip m2-chip--ok">
            <i class="m2-dot m2-dot--ok" />最近完成 · {{ algoName(optResult.algorithm) }} · {{ optResult.iterations }} 轮 · 最优 {{ fmt(optResult.best_objective) }}
          </span>
          <span v-else class="m2-chip">优化结果将在此实时呈现</span>
        </div>

        <div class="m2-panel">
          <div v-if="errorMsg" class="m2-panel__err" role="alert">{{ errorMsg }}</div>
          <div class="m2-tabs" role="tablist" aria-label="优化结果子页">
            <button
              type="button" role="tab" id="m2-tab-traj" aria-selected="activeTab === 'traj'"
              :aria-controls="'m2-tabpanel-traj'"
              class="m2-tab" :class="{ 'is-on': activeTab === 'traj' }"
              @click="activeTab = 'traj'"
            >优化轨迹 · 收敛状态</button>
            <button
              type="button" role="tab" id="m2-tab-best" aria-selected="activeTab === 'best'"
              :aria-controls="'m2-tabpanel-best'"
              class="m2-tab" :class="{ 'is-on': activeTab === 'best' }"
              @click="activeTab = 'best'"
            >最优配方与预测性能</button>
          </div>

          <div class="m2-tab-body">
            <!-- ── Tab 1: 优化轨迹 · 收敛状态 ── -->
            <div v-show="activeTab === 'traj'" id="m2-tabpanel-traj" role="tabpanel" aria-labelledby="m2-tab-traj">
              <!-- running: live trajectory -->
              <template v-if="status === 'running'">
                <div class="m2-live">
                  <div class="m2-live__top">
                    <span class="m2-live__pulse"><i class="m2-pulse-dot" aria-hidden="true" />实时搜索中</span>
                    <span class="m2-live__hint">best-so-far 目标值随每个评估实时更新（越小越好）</span>
                  </div>
                  <div class="m2-live-tiles">
                    <div class="m2-live-tile">
                      <span class="m2-live-tile__label">算法</span>
                      <span class="m2-live-tile__value">{{ algoName(algorithm) }}</span>
                    </div>
                    <div class="m2-live-tile">
                      <span class="m2-live-tile__label">已评估迭代</span>
                      <span class="m2-live-tile__value m2-live-tile__value--brand">{{ evaluatedCount }}<i class="m2-live-tile__denom"> / {{ budget }}</i></span>
                    </div>
                    <div class="m2-live-tile">
                      <span class="m2-live-tile__label">当前最优目标值</span>
                      <span class="m2-live-tile__value" :class="currentBest != null ? 'm2-live-tile__value--brand' : ''">{{ currentBestText }}</span>
                    </div>
                    <div class="m2-live-tile">
                      <span class="m2-live-tile__label">已用时间</span>
                      <span class="m2-live-tile__value">{{ elapsedText }}</span>
                    </div>
                  </div>
                </div>
                <div class="m2-chart-card">
                  <div class="m2-chart-card__head">
                    <span class="m2-chart-card__title">收敛曲线 <span class="m2-chart-card__live" v-if="status==='running'">（实时）</span></span>
                    <span class="m2-chart-legend"><i class="m2-lg-dot" />best-so-far</span>
                  </div>
                  <svg v-if="chart.points.length > 1" :viewBox="`0 0 ${chart.W} ${chart.H}`" class="m2-chart" role="img"
                       aria-label="目标值收敛曲线，横轴迭代轮次，纵轴最优目标值">
                    <defs>
                      <linearGradient id="m2Area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#0aa3d8" stop-opacity="0.30" />
                        <stop offset="100%" stop-color="#0aa3d8" stop-opacity="0.02" />
                      </linearGradient>
                      <linearGradient id="m2Line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#005bac" />
                        <stop offset="100%" stop-color="#0aa3d8" />
                      </linearGradient>
                    </defs>
                    <g v-for="gy in chart.gridY" :key="'gy'+gy">
                      <line :x1="chart.padL" :y1="gy" :x2="chart.W-chart.padR" :y2="gy" class="m2-gridline" />
                      <text :x="chart.padL-8" :y="gy+4" class="m2-axis" text-anchor="end">{{ chart.yTick(gy) }}</text>
                    </g>
                    <g v-for="gx in chart.gridX" :key="'gx'+gx">
                      <line :x1="gx" :y1="chart.H-chart.padB" :x2="gx" :y2="chart.padT" class="m2-gridline" />
                      <text :x="gx" :y="chart.H-chart.padB+16" class="m2-axis" text-anchor="middle">{{ chart.xTick(gx) }}</text>
                    </g>
                    <polygon :points="chart.areaPts" fill="url(#m2Area)" />
                    <polyline :points="chart.linePts" fill="none" stroke="url(#m2Line)" class="m2-line" />
                    <g v-for="(pt,i) in chart.points" :key="'b'+i">
                      <circle :cx="pt.x" :cy="pt.y" r="2.4" class="m2-dot" />
                    </g>
                    <circle v-if="chart.last" :cx="chart.last.x" :cy="chart.last.y" r="4" class="m2-end-dot" />
                    <text v-if="chart.last" :x="Math.min(chart.last.x+8, chart.W-chart.padR-60)" :y="chart.last.y-9" class="m2-best-label">
                      最优 {{ fmt(chart.last.v) }}
                    </text>
                  </svg>
                  <div v-else class="m2-chart-empty">
                    {{ chart.points.length === 1 ? '已评估 1 个采样点，轨迹展开中…' : (evaluatedCount === 0 ? '正在加载预测模型并启动搜索，等待首个评估结果…' : '暂无轨迹数据') }}
                  </div>
                </div>
              </template>

              <!-- done: finalized trajectory -->
              <template v-else-if="optResult">
                <header class="m2-panel-head">
                  <div>
                    <h3 class="m2-panel-title">优化轨迹 · 收敛状态</h3>
                    <p class="m2-panel-sub">best-so-far 目标值随迭代单调收敛（越小越好）</p>
                  </div>
                  <span class="m2-chip m2-chip--ok" v-if="metTotal.total && metTotal.met === metTotal.total">
                    <i class="m2-dot m2-dot--ok" />全部目标达标
                  </span>
                  <span class="m2-chip m2-chip--warn" v-else-if="metTotal.total">部分目标未达标</span>
                </header>

                <div class="m2-tiles">
                  <div v-for="(s, i) in statTiles" :key="i" class="m2-tile">
                    <span class="m2-tile__label">{{ s.label }}</span>
                    <span class="m2-tile__value" :class="s.tone ? `m2-tile__value--${s.tone}` : ''">{{ s.value }}</span>
                    <span v-if="s.sub" class="m2-tile__sub">{{ s.sub }}</span>
                  </div>
                </div>

                <div class="m2-chart-card">
                  <div class="m2-chart-card__head">
                    <span class="m2-chart-card__title">收敛曲线</span>
                    <span class="m2-chart-legend"><i class="m2-lg-dot" />best-so-far</span>
                  </div>
                  <svg v-if="chart.points.length > 1" :viewBox="`0 0 ${chart.W} ${chart.H}`" class="m2-chart" role="img"
                       aria-label="目标值收敛曲线，横轴迭代轮次，纵轴最优目标值">
                    <defs>
                      <linearGradient id="m2Area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#0aa3d8" stop-opacity="0.30" />
                        <stop offset="100%" stop-color="#0aa3d8" stop-opacity="0.02" />
                      </linearGradient>
                      <linearGradient id="m2Line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#005bac" />
                        <stop offset="100%" stop-color="#0aa3d8" />
                      </linearGradient>
                    </defs>
                    <g v-for="gy in chart.gridY" :key="'gy'+gy">
                      <line :x1="chart.padL" :y1="gy" :x2="chart.W-chart.padR" :y2="gy" class="m2-gridline" />
                      <text :x="chart.padL-8" :y="gy+4" class="m2-axis" text-anchor="end">{{ chart.yTick(gy) }}</text>
                    </g>
                    <g v-for="gx in chart.gridX" :key="'gx'+gx">
                      <line :x1="gx" :y1="chart.H-chart.padB" :x2="gx" :y2="chart.padT" class="m2-gridline" />
                      <text :x="gx" :y="chart.H-chart.padB+16" class="m2-axis" text-anchor="middle">{{ chart.xTick(gx) }}</text>
                    </g>
                    <polygon :points="chart.areaPts" fill="url(#m2Area)" />
                    <polyline :points="chart.linePts" fill="none" stroke="url(#m2Line)" class="m2-line" />
                    <g v-for="(pt,i) in chart.points" :key="'b'+i">
                      <circle :cx="pt.x" :cy="pt.y" r="2.4" class="m2-dot" />
                    </g>
                    <circle v-if="chart.last" :cx="chart.last.x" :cy="chart.last.y" r="4" class="m2-end-dot" />
                    <text v-if="chart.last" :x="Math.min(chart.last.x+8, chart.W-chart.padR-60)" :y="chart.last.y-9" class="m2-best-label">
                      最优 {{ fmt(chart.last.v) }}
                    </text>
                  </svg>
                  <div v-else class="m2-chart-empty">
                    {{ chart.points.length === 1 ? '仅 1 个采样点，轨迹不足' : '暂无轨迹数据' }}
                  </div>
                </div>

                <div v-if="metEntries.length" class="m2-met">
                  <span class="m2-met__label">达标情况</span>
                  <div class="m2-met__chips">
                    <span
                      v-for="e in metEntries" :key="e.key"
                      class="m2-met-chip" :class="e.met ? 'm2-met-chip--ok' : 'm2-met-chip--no'"
                      :title="e.key"
                    >
                      <i class="m2-met-chip__icon">{{ e.met ? '✓' : '✕' }}</i>
                      <span class="m2-met-chip__name">{{ e.key }}</span>
                      <span class="m2-met-chip__val">{{ predVal(e.key) }}</span>
                    </span>
                  </div>
                </div>
              </template>

              <!-- idle / error: empty state -->
              <template v-else>
                <div class="m2-tab-empty">
                  <div class="m2-tab-empty__art" aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 78 78" fill="none">
                      <circle cx="39" cy="39" r="36" stroke="#0aa3d8" stroke-opacity="0.25" stroke-width="2" />
                      <path d="M13 50 C 22 44, 30 48, 38 38 S 56 24, 65 26" stroke="#005bac" stroke-width="3" stroke-linecap="round" />
                      <circle cx="65" cy="26" r="4.5" fill="#0aa3d8" />
                      <circle cx="13" cy="50" r="4.5" fill="#9fc9e8" />
                    </svg>
                  </div>
                  <h3 class="m2-tab-empty__title">尚未开始优化…</h3>
                  <p class="m2-tab-empty__text">在左侧定义目标性能、选择优化器与预算，点击 <strong>开始优化</strong>。搜索将在此实时绘制收敛轨迹。</p>
                </div>
              </template>
            </div>

            <!-- ── Tab 2: 最优配方与预测性能 ── -->
            <div v-show="activeTab === 'best'" id="m2-tabpanel-best" role="tabpanel" aria-labelledby="m2-tab-best">
              <template v-if="optResult">
                <header class="m2-panel-head">
                  <div>
                    <h3 class="m2-panel-title">最优配方与预测性能</h3>
                    <p class="m2-panel-sub">按 {{ algoName(optResult.algorithm) }} 在 {{ optResult.iterations }} 轮内搜索到的当前最优解</p>
                  </div>
                </header>

                <div class="m2-result__grid">
                  <!-- composition -->
                  <div class="m2-recipe">
                    <div class="m2-recipe__title">组分构成</div>
                    <div class="m2-comp-bar" role="img" :aria-label="'配方组分占比'">
                      <div
                        v-for="(seg, i) in compSegments" :key="i"
                        class="m2-comp-seg" :style="{ width: seg.w + '%', background: segColor(i) }"
                        :title="`${seg.name} ${fmtPct(seg.pct)}`"
                      />
                    </div>
                    <ul v-if="visibleComps.length" class="m2-comp-list">
                      <li v-for="(c, i) in visibleComps" :key="c.name" class="m2-comp-row">
                        <span class="m2-comp-swatch" :style="{ background: segColor(i) }" />
                        <span class="m2-comp-name" :title="c.name">{{ c.name }}</span>
                        <span class="m2-comp-pct">{{ fmtPct(c.pct) }}</span>
                        <span class="m2-comp-track"><span class="m2-comp-fill" :style="{ width: miniW(c.pct) + '%', background: segColor(i) }" /></span>
                      </li>
                      <li v-if="hiddenComps > 0">
                        <button type="button" class="m2-more-btn" @click="showAllComps = !showAllComps">
                          {{ showAllComps ? '收起' : `＋ ${hiddenComps} 种低占比组分` }}
                        </button>
                      </li>
                    </ul>
                    <p v-else class="m2-recipe-empty">未返回配方组分</p>
                  </div>

                  <!-- predicted properties -->
                  <div class="m2-pred">
                    <div class="m2-recipe__title">预测性能</div>
                    <div v-if="predProps.length" class="m2-pred-grid">
                      <div
                        v-for="p in predProps" :key="p.key"
                        class="m2-pred-cell"
                        :class="p.met == null ? '' : (p.met ? 'm2-pred-cell--ok' : 'm2-pred-cell--no')"
                        :title="p.met == null ? '未设为目标' : (p.met ? '目标已达标' : '目标未达标')"
                      >
                        <span class="m2-pred-cell__name">{{ p.key }}</span>
                        <span class="m2-pred-cell__val">{{ fmt(p.v) }}</span>
                        <span v-if="p.met != null" class="m2-pred-cell__flag">{{ p.met ? '✓ 达标' : '✕ 未达' }}</span>
                      </div>
                    </div>
                    <p v-else class="m2-recipe-empty">未返回预测性能</p>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="m2-tab-empty">
                  <div class="m2-tab-empty__art m2-tab-empty__art--pulse" aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 78 78" fill="none">
                      <circle cx="39" cy="39" r="36" stroke="#0aa3d8" stroke-opacity="0.25" stroke-width="2" />
                      <path d="M13 50 C 22 44, 30 48, 38 38 S 56 24, 65 26" stroke="#005bac" stroke-width="3" stroke-linecap="round" />
                      <circle cx="65" cy="26" r="4.5" fill="#0aa3d8" />
                      <circle cx="13" cy="50" r="4.5" fill="#9fc9e8" />
                    </svg>
                  </div>
                  <h3 class="m2-tab-empty__title">{{ status === 'running' ? '搜索进行中…' : '尚未开始优化…' }}</h3>
                  <p class="m2-tab-empty__text">
                    {{ status === 'running'
                      ? '完成后将在此展示最优配方组分构成与全部 19 项预测性能的达标情况。'
                      : '完成一次优化后，最优配方、组分占比与预测性能将在此展示。' }}
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { streamOptimizeModel2 } from '../api/models'

const router = useRouter()

/* ── 可搜索的性能属性（19 项，recipe_opt 真实 property_names） ── */
const PROPS = [
  '体密[110℃]', '体密[1100℃]', '体密[1450℃]', '体密[1500℃]',
  '吸水率[1450℃]', '气孔率[1450℃]',
  '抗折强度[110℃]', '抗折强度[1100℃]', '抗折强度[1450℃]', '抗折强度[1500℃]',
  '耐压强度[110℃]', '耐压强度[1100℃]', '耐压强度[1450℃]', '耐压强度[1500℃]',
  '高温抗折[1450℃]', '高温抗折[1500℃]',
  '线变化率[1100℃]', '线变化率[1450℃]', '线变化率[1500℃]',
]
function buildPropGroups(list) {
  const map = new Map()
  for (const p of list) {
    const base = p.split('[')[0]
    if (!map.has(base)) map.set(base, [])
    map.get(base).push(p)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
}
const propGroups = buildPropGroups(PROPS)

/* ── 目标预设 ── */
const defaultTargets = () => [
  { name: '耐压强度[110℃]', direction: 'maximize', lower: 50, upper: null },
  { name: '高温抗折[1450℃]', direction: 'maximize', lower: 3, upper: null },
  { name: '线变化率[1450℃]', direction: 'constrain', lower: -0.5, upper: 0.5 },
]
const PRESETS = [
  { id: 'default', label: '默认', targets: defaultTargets },
  { id: 'strength', label: '仅耐压强度', targets: () => [
    { name: '耐压强度[110℃]', direction: 'maximize', lower: 50, upper: null },
  ] },
  { id: 'stbend', label: '耐压 + 抗折', targets: () => [
    { name: '耐压强度[110℃]', direction: 'maximize', lower: 50, upper: null },
    { name: '高温抗折[1450℃]', direction: 'maximize', lower: 3, upper: null },
  ] },
  { id: 'shrink', label: '低线变化率', targets: () => [
    { name: '线变化率[1450℃]', direction: 'constrain', lower: -0.5, upper: 0.5 },
    { name: '高温抗折[1450℃]', direction: 'maximize', lower: 3, upper: null },
  ] },
]

/* ── 优化器选项 ── */
const ALGORITHMS = [
  { id: 'nsga2', name: 'NSGA-II', tag: '多目标遗传', note: 'Pareto 前沿探索，在多目标间权衡' },
  { id: 'evolutionary', name: '进化算法', tag: 'EA', note: '单目标进化寻优，收敛方向直接' },
  { id: 'bayesian', name: '贝叶斯优化', tag: 'BO', note: '代理模型引导采样，样本效率高' },
  { id: 'hybrid', name: '混合搜索', tag: 'BO+EA', note: '贝叶斯冷启动 + 进化精细收敛' },
  { id: 'random', name: '随机搜索', tag: '基线', note: '随机采样，作为对照基线' },
]
function algoName(id) {
  return (ALGORITHMS.find(a => a.id === id) || {}).name || (id || '—')
}

/* ── 编辑状态 ── */
const targets = ref(defaultTargets())
const algorithm = ref('nsga2')
const budget = ref(80)

/* ── 运行 / 流式状态 ── */
const status = ref('idle') // idle | running | done | error
const errorMsg = ref('')
const optResult = ref(null)
const hasRun = ref(false)
const showAllComps = ref(false)
const activeTab = ref('traj') // traj | best
const trajectory = ref([]) // live [{iteration, best_objective}] — fed by SSE progress, finalized by result.trace
const startedAt = ref(null)
const elapsedMs = ref(0)
const streamHandle = ref(null)
let clockTimer = null

function startClock() {
  stopClock()
  startedAt.value = Date.now()
  elapsedMs.value = 0
  clockTimer = setInterval(() => {
    if (startedAt.value) elapsedMs.value = Date.now() - startedAt.value
  }, 500)
}
function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null }
}

function cloneTargets(list) {
  return list.map(t => ({ name: t.name, direction: t.direction, lower: t.lower, upper: t.upper }))
}
function applyPreset(ps) { targets.value = cloneTargets(ps.targets()) }
function addTarget() {
  targets.value.push({ name: PROPS[0], direction: 'maximize', lower: 0, upper: null })
}
function removeTarget(i) {
  if (targets.value.length <= 1) return
  targets.value.splice(i, 1)
}
function setDir(t, dir) {
  t.direction = dir
  if (dir === 'maximize') { t.upper = null; if (t.lower == null) t.lower = 0 }
  else if (dir === 'minimize') { t.lower = null; if (t.upper == null) t.upper = 0 }
  else { if (t.lower == null) t.lower = 0; if (t.upper == null) t.upper = 1 }
}
function stepFor(t) {
  const v = Math.abs(t.lower ?? t.upper ?? 0)
  if (v >= 50) return 5
  if (v >= 10) return 1
  return 0.5
}
function bump(t, key, d) {
  const cur = t[key] == null ? 0 : t[key]
  const next = Math.round((cur + d) * 100) / 100
  t[key] = next
  if (t.direction === 'constrain' && t.lower != null && t.upper != null && t.lower > t.upper) {
    if (key === 'lower') t.upper = t.lower
    else t.lower = t.upper
  }
}

function resetAll() {
  if (streamHandle.value) { streamHandle.value.abort(); streamHandle.value = null }
  stopClock()
  optResult.value = null
  hasRun.value = false
  status.value = 'idle'
  errorMsg.value = ''
  showAllComps.value = false
  activeTab.value = 'traj'
  trajectory.value = []
  startedAt.value = null
  elapsedMs.value = 0
  targets.value = defaultTargets()
  algorithm.value = 'nsga2'
  budget.value = 80
}

async function runOptimize() {
  if (status.value === 'running') return
  errorMsg.value = ''
  const cleanTargets = targets.value
    .filter(t => t && t.name)
    .map(t => ({
      name: t.name,
      direction: t.direction,
      lower: t.lower == null ? null : Number(t.lower),
      upper: t.upper == null ? null : Number(t.upper),
    }))
  status.value = 'running'
  optResult.value = null
  hasRun.value = false
  showAllComps.value = false
  activeTab.value = 'traj'
  trajectory.value = []
  startClock()
  try {
    const data = await new Promise((resolve, reject) => {
      streamHandle.value = streamOptimizeModel2(
        {
          targets: cleanTargets.length ? cleanTargets : [],
          algorithm: algorithm.value,
          budget: Math.max(5, Math.min(100000, Number(budget.value) || 60)),
        },
        (p) => {
          if (status.value !== 'running') return
          if (!p || !Number.isFinite(Number(p.best_objective))) return
          trajectory.value.push({
            iteration: Number.isFinite(Number(p.iteration)) ? Number(p.iteration) : trajectory.value.length + 1,
            best_objective: Number(p.best_objective),
          })
        },
        (d) => resolve(d),
        (e) => reject(e),
      )
    })
    if (data && data.ok === false) {
      errorMsg.value = (data && (data.message || data.error)) || '优化失败'
      status.value = 'error'
      hasRun.value = false
      return
    }
    optResult.value = data || null
    if (data && Array.isArray(data.trace) && data.trace.length) {
      trajectory.value = data.trace
    }
    hasRun.value = true
    status.value = 'done'
  } catch (e) {
    errorMsg.value = '优化请求失败：' + (e?.message || e || '服务不可用')
    console.error(e)
    status.value = 'error'
  } finally {
    stopClock()
    streamHandle.value = null
  }
}

onBeforeUnmount(() => {
  stopClock()
  if (streamHandle.value) streamHandle.value.abort()
})

/* ── 数字格式化 ── */
function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  const a = Math.abs(n)
  if (a >= 1000) return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  if (a >= 100) return n.toFixed(1)
  if (a >= 1) return n.toFixed(2)
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0'
}
function fmtPct(p) {
  const n = Number(p)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2) + '%'
}

/* ── live 状态 ── */
const evaluatedCount = computed(() => trajectory.value.length)
const currentBest = computed(() => {
  const arr = trajectory.value
  if (!arr.length) return null
  const v = Number(arr[arr.length - 1].best_objective)
  return Number.isFinite(v) ? v : null
})
const currentBestText = computed(() => (currentBest.value == null ? '—' : fmt(currentBest.value)))
const elapsedText = computed(() => {
  if (!startedAt.value) return '0s'
  const s = Math.max(0, Math.floor(elapsedMs.value / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}分${s % 60}秒`
})

/* ── 统计 tiles（完成态） ── */
const metEntries = computed(() => {
  const tm = optResult.value?.target_met
  if (!tm || typeof tm !== 'object') return []
  return Object.keys(tm).map(key => ({ key, met: !!tm[key] }))
})
const metTotal = computed(() => {
  const list = metEntries.value
  return { met: list.filter(e => e.met).length, total: list.length }
})
const statTiles = computed(() => {
  const r = optResult.value
  if (!r) return []
  const hv = r.hypervolume == null ? '—' : fmt(r.hypervolume)
  const pareto = Array.isArray(r.pareto_front) ? r.pareto_front.length : null
  const mats = Array.isArray(r.best_recipe?.materials) ? r.best_recipe.materials.length : null
  return [
    { label: '最优目标值', value: fmt(r.best_objective), tone: 'brand' },
    { label: '迭代数', value: r.iterations != null ? String(r.iterations) : '—', sub: '采样轮次' },
    { label: '超体积', value: hv, sub: hv === '—' ? '未计算' : 'HV' },
    { label: 'Pareto 解数', value: pareto != null ? String(pareto) : '—', sub: pareto != null && pareto === 0 ? '单目标模式' : '' },
    { label: '配方组分种数', value: mats != null ? String(mats) : '—' },
    { label: '达标项数', value: metTotal.value.total ? `${metTotal.value.met}/${metTotal.value.total}` : '—', tone: metTotal.value.total && metTotal.value.met === metTotal.value.total ? 'ok' : (metTotal.value.total ? 'warn' : '') },
  ]
})

/* ── 收敛曲线（live + 最终共用：trajectory 流） ── */
const chart = computed(() => {
  const trace = Array.isArray(trajectory.value) ? trajectory.value : []
  const W = 900, H = 300, padL = 70, padR = 26, padT = 26, padB = 38
  // best-so-far (monotone improving)
  const vals = []
  let best = Infinity
  for (const s of trace) {
    const v = Number(s && s.best_objective)
    if (Number.isFinite(v)) { if (v < best) best = v; vals.push(best) }
  }
  const n = vals.length
  const xMax = Math.max(1, n - 1)
  const xPos = i => padL + (i / xMax) * (W - padL - padR)
  let lo, hi
  if (n) { lo = Math.min(...vals); hi = Math.max(...vals) }
  if (!n) { lo = 0; hi = 1 }
  else if (hi - lo < 1e-9) { hi = lo * 1.05 + 1e-6; lo = lo * 0.95 - 1e-6 }
  const Y0 = hi + (hi - lo) * 0.12, Y1 = lo - (hi - lo) * 0.12
  const yPos = v => padT + ((Y0 - v) / (Y0 - Y1)) * (H - padT - padB)
  const points = vals.map((v, i) => ({ v, i, x: xPos(i), y: yPos(v) }))
  const linePts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const bottom = padT + (H - padT - padB)
  const areaPts = points.length ? `${xPos(0).toFixed(1)},${bottom} ${linePts} ${xPos(n - 1).toFixed(1)},${bottom}` : ''
  const gridY = []
  for (let k = 0; k <= 4; k++) gridY.push(padT + (k / 4) * (H - padT - padB))
  const gridX = []
  for (let k = 0; k <= 4; k++) { const i = Math.round((k / 4) * xMax); gridX.push(xPos(i)) }
  const yTick = px => fmt(Y0 - ((px - padT) / (H - padT - padB)) * (Y0 - Y1))
  const xTick = px => String(Math.round(((px - padL) / (W - padL - padR)) * xMax))
  const last = points.length ? points[points.length - 1] : null
  return { W, H, padL, padR, padT, padB, points, linePts, areaPts, gridY, gridX, yTick, xTick, last }
})

/* ── 配方组分 ── */
const compList = computed(() => {
  const m = optResult.value?.best_recipe?.materials
  const p = optResult.value?.best_recipe?.proportions
  if (!Array.isArray(m) || !Array.isArray(p)) return []
  const rows = []
  for (let i = 0; i < m.length; i++) {
    const v = Number(p[i])
    if (!Number.isFinite(v)) continue
    rows.push({ name: m[i], pct: v })
  }
  return rows.sort((a, b) => b.pct - a.pct)
})
const compTotal = computed(() => compList.value.reduce((s, c) => s + c.pct, 0) || 1)
const compSegments = computed(() => compList.value.map(c => ({ name: c.name, pct: c.pct, w: (c.pct / compTotal.value) * 100 })))
const visibleComps = computed(() => showAllComps.value ? compList.value : compList.value.slice(0, 8))
const hiddenComps = computed(() => Math.max(0, compList.value.length - 8))
const maxPct = computed(() => { const r = compList.value; return r.length ? r[0].pct : 1 })
function miniW(p) { return Math.max(2, (p / maxPct.value) * 100) }
const COMP_COLORS = [
  '#005bac', '#0aa3d8', '#0869ad', '#14b8a6', '#e08a1e', '#7a5cbd',
  '#d9485c', '#3b82c4', '#2f9e6e', '#b26bc9', '#c09a3a', '#4a90b8',
  '#8b5cf6', '#0d9488', '#e11d48', '#0e7490',
]
function segColor(i) { return COMP_COLORS[i % COMP_COLORS.length] }

/* ── 预测性能网格 ── */
const predProps = computed(() => {
  const bp = optResult.value?.best_predicted
  const tm = optResult.value?.target_met
  if (!bp || typeof bp !== 'object') return []
  const out = []
  for (const key of Object.keys(bp)) {
    const v = Number(bp[key])
    if (!Number.isFinite(v)) continue
    const met = tm && key in tm ? !!tm[key] : null
    out.push({ key, v, met })
  }
  // put targeted first, then others
  return out.sort((a, b) => (b.met == null ? 0 : 1) - (a.met == null ? 0 : 1))
})
function predVal(key) {
  const bp = optResult.value?.best_predicted
  return bp && key in bp ? fmt(bp[key]) : '—'
}
</script>

<style scoped>
/* ── page / deck shells (override platform .card for density) ── */
.model2-page { color: #16324f; }
.m2-page .card {
  padding: 18px 20px 20px;
  margin-bottom: 18px;
  border-radius: 12px;
}
.m2-page .card h2 { margin-bottom: 0; }
.m2-page .card::before { height: 3px; border-radius: 12px 12px 0 0; }

/* header */
.m2-header { align-items: flex-start; }
.m2-header__titles { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.m2-header__chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.m2-chip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 12px; border-radius: 999px;
  background: #eef4fb; border: 1px solid #dbe7f2;
  color: #2c4a63; font-size: 12px; font-weight: 650; line-height: 1.4;
}
.m2-chip--brand { background: linear-gradient(135deg, rgba(0,91,172,.1), rgba(10,163,216,.12)); border-color: rgba(0,91,172,.22); color: #005bac; }
.m2-chip--ok { background: #e7f7ef; border-color: #bfe9d3; color: #0e7a4c; }
.m2-chip--warn { background: #fdf3e4; border-color: #f0d9b4; color: #b26a14; }
.m2-chip--running { background: #f0f8ff; border-color: #cfe8f7; color: #0869ad; }
.m2-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: currentColor; opacity: .85; }
.m2-dot--live { background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.5); animation: m2-pulse 1.6s infinite; }
.m2-dot--ok { background: #16a34a; }
.m2-spin { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #9fc9e8; border-top-color: #0869ad; animation: m2-rot .8s linear infinite; display: inline-block; }

/* ── two-column layout ── */
.m2-layout { display: grid; grid-template-columns: minmax(320px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
.m2-left { display: flex; flex-direction: column; gap: 12px; min-width: 0; font-size: 12.5px; color: #2c4a63; }
.m2-right { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

/* left sections (compact) */
.m2-sec {
  background: #fbfdff; border: 1px solid #e6edf3; border-radius: 11px;
  padding: 12px 13px 13px; display: flex; flex-direction: column; gap: 10px;
}
.m2-sec__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.m2-sec__title { margin: 0; font-size: 13.5px; font-weight: 750; color: #17324d; letter-spacing: -.1px; }
.m2-sec__sub { margin: 2px 0 0; font-size: 11px; color: #72879c; }
.m2-count-pill {
  flex: none; font-size: 11px; font-weight: 700; color: #005bac;
  background: rgba(0,91,172,.08); border: 1px solid rgba(0,91,172,.18);
  padding: 3px 9px; border-radius: 999px; white-space: nowrap; margin-top: 1px;
}

/* presets */
.m2-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; line-height: 1.15; }
.m2-presets__label { font-size: 11px; color: #7c8b98; font-weight: 600; }
.m2-preset-chip {
  font: inherit; font-size: 11.5px; font-weight: 650; color: #2c4a63;
  background: #fff; border: 1px solid #d9e3ec; border-radius: 999px;
  padding: 3px 10px; cursor: pointer; transition: all .16s ease;
}
.m2-preset-chip:hover:not(:disabled) { border-color: #0aa3d8; color: #0869ad; background: #f0faff; }
.m2-preset-chip:disabled { opacity: .5; cursor: not-allowed; }

/* goal rows (compact stacked) */
.m2-goals { display: flex; flex-direction: column; gap: 8px; }
.m2-goal-row {
  display: flex; flex-direction: column; gap: 7px;
  padding: 8px 9px; border: 1px solid #e5ecf2; border-radius: 9px;
  background: #fff; line-height: 1.15;
}
.m2-goal-row__line1 { display: flex; align-items: center; gap: 6px; }
.m2-goal-row__line2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.m2-select {
  font: inherit; font-size: 12px; color: #17324d; background: #fff;
  border: 1px solid #d5e0ea; border-radius: 7px; padding: 5px 6px;
  width: 100%; min-width: 0; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease;
}
.m2-select:focus, .m2-step-val:focus { outline: none; border-color: #0aa3d8; box-shadow: 0 0 0 3px rgba(10,163,216,.14); }
.m2-select:disabled, .m2-step-val:disabled { background: #f4f7fa; color: #8a9aa9; cursor: not-allowed; }
.m2-goal__dir { display: flex; gap: 3px; background: #eef2f6; border-radius: 7px; padding: 2px; flex: none; }
.m2-seg {
  font: inherit; font-size: 11px; font-weight: 650; color: #5b6b7c;
  background: transparent; border: none; border-radius: 5px; padding: 4px 7px;
  cursor: pointer; transition: all .15s ease; white-space: nowrap;
}
.m2-seg.is-on { background: #fff; color: #005bac; box-shadow: 0 1px 4px rgba(23,50,77,.14); }
.m2-seg:disabled { opacity: .5; cursor: not-allowed; }
.m2-goal__bounds { display: flex; gap: 6px; align-items: center; min-width: 0; flex-wrap: wrap; }
.m2-bound { display: flex; align-items: center; gap: 4px; }
.m2-bound__label { font-size: 10px; color: #7c8b98; font-weight: 600; white-space: nowrap; }
.m2-stepper { display: flex; align-items: center; gap: 2px; }
.m2-step-btn {
  font: inherit; width: 20px; height: 22px; line-height: 1; flex: none;
  border: 1px solid #d5e0ea; background: #fff; color: #2c4a63;
  border-radius: 5px; cursor: pointer; font-size: 13px; padding: 0;
}
.m2-step-btn:hover:not(:disabled) { border-color: #0aa3d8; color: #0869ad; }
.m2-step-btn:disabled { opacity: .45; cursor: not-allowed; }
.m2-step-val {
  font: inherit; font-size: 11.5px; font-weight: 650; color: #17324d; text-align: center;
  width: 46px; padding: 3px 1px; border: 1px solid #d5e0ea; border-radius: 5px; background: #fff;
  -moz-appearance: textfield;
}
.m2-step-val::-webkit-outer-spin-button, .m2-step-val::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.m2-remove {
  font: inherit; width: 22px; height: 22px; border-radius: 6px; cursor: pointer; flex: none;
  border: 1px solid transparent; background: transparent; color: #a3b0bd; font-size: 12px; line-height: 1;
}
.m2-remove:hover:not(:disabled) { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.m2-remove:disabled { opacity: .4; cursor: not-allowed; }
.m2-goals-empty { font-size: 12px; color: #72879c; background: #f6f9fc; border: 1px dashed #cbd9e6; border-radius: 9px; padding: 10px 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.m2-goal__actions { display: flex; }
.m2-link-btn {
  font: inherit; font-size: 12px; font-weight: 650; color: #0869ad; background: none;
  border: none; padding: 2px 2px; cursor: pointer;
}
.m2-link-btn:hover:not(:disabled) { color: #005bac; text-decoration: underline; }
.m2-link-btn:disabled { opacity: .5; cursor: not-allowed; }

/* optimizer tiles */
.m2-opt-list { display: flex; flex-direction: column; gap: 7px; }
.m2-opt-tile {
  font: inherit; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid #e2e9f0; border-radius: 8px; background: #fff;
  padding: 7px 10px; transition: all .15s ease; line-height: 1.3;
}
.m2-opt-tile:hover:not(:disabled) { border-color: #b7d6ec; }
.m2-opt-tile.is-on { border-color: #0aa3d8; background: linear-gradient(180deg, rgba(10,163,216,.06), #fff 60%); box-shadow: 0 0 0 2px rgba(10,163,216,.12); }
.m2-opt-tile:disabled { opacity: .55; cursor: not-allowed; }
.m2-opt-tile__top { display: flex; align-items: center; gap: 7px; }
.m2-opt-tile__name { font-size: 12.5px; font-weight: 750; color: #17324d; }
.m2-opt-tag {
  font-size: 10px; font-weight: 700; color: #0869ad; background: rgba(8,105,173,.1);
  padding: 1px 6px; border-radius: 999px; letter-spacing: .2px;
}
.m2-opt-check { margin-left: auto; color: #0aa3d8; font-weight: 800; font-size: 13px; }
.m2-opt-tile__note { font-size: 11px; color: #7c8b98; line-height: 1.4; }

/* budget (compact) */
.m2-budget { padding: 9px 11px; background: #f6f9fc; border: 1px solid #e6edf3; border-radius: 9px; display: flex; flex-direction: column; gap: 4px; }
.m2-budget__head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.m2-budget__label { font-size: 11.5px; font-weight: 650; color: #2c4a63; }
.m2-budget__val {
  font-size: 14px; font-weight: 800; color: #005bac;
  background: #fff; border: 1px solid #dbe7f2; border-radius: 6px; padding: 0 9px;
}
.m2-budget__range { width: 100%; margin: 6px 0 0; accent-color: #0aa3d8; cursor: pointer; height: 4px; }
.m2-budget__range:disabled { cursor: not-allowed; }
.m2-budget__ticks { display: flex; justify-content: space-between; font-size: 10px; color: #9aa8b7; }
.m2-opt-hint { margin: 2px 0 0; font-size: 11px; color: #72879c; line-height: 1.65; }
.m2-opt-hint strong { color: #0869ad; }

/* action bar */
.m2-left__actions { display: flex; flex-direction: column; gap: 8px; }
.m2-left__btns { display: flex; gap: 10px; align-items: center; }
.m2-run-btn {
  font: inherit; font-size: 14px; font-weight: 750; color: #fff;
  background: linear-gradient(135deg, #005bac 0%, #0869ad 55%, #0aa3d8 130%);
  border: none; border-radius: 9px; padding: 10px 22px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px; min-width: 0;
  box-shadow: 0 8px 22px rgba(8,105,173,.28);
  transition: transform .16s ease, box-shadow .16s ease;
}
.m2-run-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(8,105,173,.34); }
.m2-run-btn:disabled { opacity: .7; cursor: not-allowed; transform: none; }
.m2-run__spinner { width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; animation: m2-rot .8s linear infinite; display: inline-block; flex: none; }
.m2-dots { display: inline-flex; gap: 3px; }
.m2-dots i { width: 4px; height: 4px; border-radius: 50%; background: #fff; animation: m2-blink 1.2s infinite; }
.m2-dots i:nth-child(2) { animation-delay: .2s; }
.m2-dots i:nth-child(3) { animation-delay: .4s; }
.m2-reset-btn {
  font: inherit; font-size: 13px; font-weight: 650; color: #5b6b7c;
  background: #fff; border: 1px solid #d9e3ec; border-radius: 9px; padding: 10px 18px; cursor: pointer;
}
.m2-reset-btn:hover:not(:disabled) { border-color: #b7c6d4; color: #17324d; }
.m2-reset-btn:disabled { opacity: .5; cursor: not-allowed; }

/* right header chips */
.m2-right__chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 26px; }

/* panel + sub-tabs */
.m2-panel {
  background: #fff; border: 1px solid #e6edf3; border-radius: 11px;
  padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0;
}
.m2-panel__err {
  font-size: 12.5px; font-weight: 650; color: #b23a2e; background: #fdeeec;
  border: 1px solid #f5c6c1; border-radius: 9px; padding: 8px 12px;
}
.m2-tabs {
  display: inline-flex; gap: 3px; background: #eef2f6; border-radius: 9px;
  padding: 3px; align-self: flex-start; flex-wrap: wrap;
}
.m2-tab {
  font: inherit; font-size: 12.5px; font-weight: 700; color: #5b6b7c;
  background: transparent; border: none; border-radius: 7px; padding: 7px 16px;
  cursor: pointer; transition: all .15s ease; white-space: nowrap;
}
.m2-tab.is-on { background: #fff; color: #005bac; box-shadow: 0 1px 5px rgba(23,50,77,.16); }
.m2-tab-body { min-width: 0; }

/* live state */
.m2-live { display: flex; flex-direction: column; gap: 12px; margin-bottom: 4px; }
.m2-live__top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.m2-live__pulse {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12.5px; font-weight: 750; color: #0869ad;
  background: #f0f8ff; border: 1px solid #cfe8f7; border-radius: 999px; padding: 4px 12px;
}
.m2-pulse-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex: none;
  animation: m2-pulse 1.4s infinite;
}
.m2-live__hint { font-size: 11.5px; color: #72879c; }
.m2-live-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.m2-live-tile {
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
  background: linear-gradient(180deg, #f7fafd, #fbfdff);
  border: 1px solid #e6edf3; border-radius: 10px; padding: 9px 11px;
}
.m2-live-tile__label { font-size: 10.5px; color: #72879c; font-weight: 650; }
.m2-live-tile__value { font-size: 17px; font-weight: 800; color: #17324d; letter-spacing: -.2px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m2-live-tile__value--brand { color: #005bac; }
.m2-live-tile__denom { font-style: normal; font-size: 12px; font-weight: 700; color: #7c8b98; }

/* panel head */
.m2-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.m2-panel-title { margin: 0; font-size: 15px; font-weight: 750; color: #17324d; letter-spacing: -.1px; }
.m2-panel-sub { margin: 3px 0 0; font-size: 11.5px; color: #72879c; }

/* stat tiles */
.m2-tiles { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; }
.m2-tile {
  display: flex; flex-direction: column; gap: 3px;
  background: linear-gradient(180deg, #f7fafd, #fbfdff);
  border: 1px solid #e6edf3; border-radius: 11px; padding: 11px 13px;
  min-height: 66px; justify-content: center;
}
.m2-tile__label { font-size: 11px; color: #72879c; font-weight: 650; }
.m2-tile__value { font-size: 21px; font-weight: 800; color: #17324d; letter-spacing: -.3px; line-height: 1.1; }
.m2-tile__value--brand { color: #005bac; }
.m2-tile__value--ok { color: #16a34a; }
.m2-tile__value--warn { color: #d97706; }
.m2-tile__sub { font-size: 10.5px; color: #9aa8b7; }

/* chart */
.m2-chart-card { background: #fff; border: 1px solid #e8eef4; border-radius: 11px; padding: 8px 6px 4px; }
.m2-chart-card__head { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; }
.m2-chart-card__title { font-size: 12.5px; font-weight: 700; color: #17324d; }
.m2-chart-card__live { font-weight: 650; color: #0e7a4c; }
.m2-chart-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #7c8b98; }
.m2-lg-dot { width: 14px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #005bac, #0aa3d8); display: inline-block; }
.m2-chart { width: 100%; height: auto; display: block; }
.m2-gridline { stroke: #edf2f7; stroke-width: 1; }
.m2-axis { fill: #9aa8b7; font-size: 11px; }
.m2-line { stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.m2-dot { fill: #0aa3d8; }
.m2-end-dot { fill: #005bac; stroke: #fff; stroke-width: 2; }
.m2-best-label { fill: #005bac; font-size: 12px; font-weight: 700; }
.m2-chart-empty { display: grid; place-items: center; height: 190px; color: #9aa8b7; font-size: 12.5px; text-align: center; padding: 0 18px; }

/* met chips */
.m2-met { display: flex; align-items: flex-start; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.m2-met__label { font-size: 11.5px; font-weight: 700; color: #5b6b7c; padding-top: 6px; }
.m2-met__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.m2-met-chip {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 600; padding: 5px 10px 5px 6px; border-radius: 999px;
}
.m2-met-chip__icon { width: 17px; height: 17px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 10px; color: #fff; flex: none; }
.m2-met-chip--ok { background: #e7f7ef; border: 1px solid #bfe9d3; color: #0e7a4c; }
.m2-met-chip--ok .m2-met-chip__icon { background: #16a34a; }
.m2-met-chip--no { background: #fdeeec; border: 1px solid #f5c6c1; color: #b23a2e; }
.m2-met-chip--no .m2-met-chip__icon { background: #dc2626; }
.m2-met-chip__name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m2-met-chip__val { opacity: .85; font-variant-numeric: tabular-nums; }

/* result grid */
.m2-result__grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; }
.m2-recipe__title { font-size: 12.5px; font-weight: 700; color: #5b6b7c; margin-bottom: 10px; text-transform: none; letter-spacing: .2px; }
.m2-comp-bar { display: flex; width: 100%; height: 22px; border-radius: 7px; overflow: hidden; background: #eef2f6; margin-bottom: 12px; }
.m2-comp-seg { height: 100%; transition: filter .15s ease; }
.m2-comp-seg:hover { filter: brightness(1.08); }
.m2-comp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.m2-comp-row { display: grid; grid-template-columns: 12px minmax(0,1fr) auto minmax(60px, 110px); gap: 9px; align-items: center; font-size: 12.5px; color: #2c4a63; }
.m2-comp-swatch { width: 11px; height: 11px; border-radius: 3px; }
.m2-comp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m2-comp-pct { font-weight: 700; color: #17324d; font-variant-numeric: tabular-nums; min-width: 46px; text-align: right; }
.m2-comp-track { height: 7px; border-radius: 4px; background: #eef2f6; overflow: hidden; }
.m2-comp-fill { display: block; height: 100%; border-radius: 4px; }
.m2-more-btn { font: inherit; font-size: 12px; font-weight: 650; color: #0869ad; background: none; border: none; padding: 4px 0; cursor: pointer; }
.m2-more-btn:hover { text-decoration: underline; }
.m2-recipe-empty { color: #9aa8b7; font-size: 13px; }

/* predicted grid */
.m2-pred-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.m2-pred-cell {
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid #e6edf3; border-radius: 10px; padding: 8px 11px;
  background: #fbfdff; min-width: 0;
}
.m2-pred-cell__name { font-size: 11px; color: #72879c; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m2-pred-cell__val { font-size: 17px; font-weight: 750; color: #17324d; letter-spacing: -.2px; font-variant-numeric: tabular-nums; }
.m2-pred-cell__flag { align-self: flex-start; font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 1px 8px; }
.m2-pred-cell--ok { background: #f4fbf7; border-color: #c9ecda; }
.m2-pred-cell--ok .m2-pred-cell__flag { background: #16a34a; color: #fff; }
.m2-pred-cell--no { background: #fdf6f5; border-color: #f2d0cc; }
.m2-pred-cell--no .m2-pred-cell__flag { background: #dc2626; color: #fff; }

/* tab empty states */
.m2-tab-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 44px 26px; text-align: center; }
.m2-tab-empty__art { margin-bottom: 4px; opacity: .9; }
.m2-tab-empty__title { margin: 0; font-size: 16px; font-weight: 750; color: #17324d; }
.m2-tab-empty__text { margin: 0; font-size: 12.5px; color: #72879c; line-height: 1.8; max-width: 460px; }
.m2-tab-empty__text strong { color: #0869ad; }

.m2-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* animations */
@keyframes m2-rot { to { transform: rotate(360deg); } }
@keyframes m2-blink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }
@keyframes m2-pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.45); } 70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }

/* responsive */
@media (max-width: 1180px) {
  .m2-layout { grid-template-columns: minmax(300px, 340px) minmax(0, 1fr); }
  .m2-tiles { grid-template-columns: repeat(3, 1fr); }
  .m2-live-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 960px) {
  .m2-layout { grid-template-columns: 1fr; }
  .m2-result__grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .m2-tiles { grid-template-columns: repeat(2, 1fr); }
  .m2-live-tiles { grid-template-columns: 1fr; }
  .m2-tab { padding: 7px 10px; font-size: 12px; }
}
</style>
