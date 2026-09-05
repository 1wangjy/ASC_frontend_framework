<template>
  <div class="platform-page model2-page">
    <div class="page-header">
      <h1>配方优化</h1>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <!-- 反向优化主卡片 -->
    <div class="card">
      <h2>反向优化 · AlphaEvolve 探索</h2>
      <p class="m2-hint">给定目标性能，通过基于代理模型的探索优化器（贝叶斯 / 进化 / 混合 / NSGA-II 等）在 96 种原料的配方空间内迭代搜索最优配比，并实时呈现优化探索轨迹。</p>

      <form @submit.prevent="runOptimize">
        <div class="m2-grid">
          <div class="form-group">
            <label>优化算法</label>
            <select v-model="algorithm">
              <option value="nsga2">NSGA-II（多目标遗传算法）</option>
              <option value="evolutionary">进化算法（EA）</option>
              <option value="bayesian">贝叶斯优化（代理模型）</option>
              <option value="hybrid">混合搜索（贝叶斯+进化）</option>
              <option value="random">随机搜索（基线）</option>
            </select>
          </div>
          <div class="form-group">
            <label>搜索预算（迭代数）</label>
            <input v-model.number="budget" type="number" min="10" max="500" step="5">
            <div class="m2-range"><input v-model.number="budget" type="range" min="10" max="300" step="5"></div>
          </div>
        </div>

        <!-- 目标性能编辑 -->
        <div class="form-group">
          <label>目标性能（留空则使用系统默认：耐压强度↑ / 高温抗折↑ / 线变化率≈0）</label>
          <div class="m2-target-head">
            <span>属性</span><span>方向</span><span>下界</span><span>上界</span><span></span>
          </div>
          <div v-for="(t, i) in targets" :key="i" class="m2-target-row">
            <select v-model="t.name">
              <option v-for="p in allProps" :key="p" :value="p">{{ p }}</option>
            </select>
            <select v-model="t.direction">
              <option value="maximize">越大越好</option>
              <option value="minimize">越小越好</option>
              <option value="constrain">约束区间</option>
            </select>
            <input v-model.number="t.lower" type="number" step="0.1" placeholder="下界">
            <input v-model.number="t.upper" type="number" step="0.1" placeholder="上界">
            <button type="button" class="btn btn-danger btn-small" @click="removeTarget(i)">✕</button>
          </div>
          <button type="button" class="btn btn-secondary btn-small m2-add" @click="addTarget">+ 添加目标属性</button>
        </div>

        <button type="submit" class="btn" :disabled="optimizing">
          <span v-if="optimizing" class="loading" />
          {{ optimizing ? '优化中（代理模型采样迭代）...' : '开始优化' }}
        </button>
      </form>
    </div>

    <div v-if="errorMsg" class="status-message error">{{ errorMsg }}</div>

    <!-- 结果 -->
    <template v-if="optResult">
      <div class="card">
        <h2>优化结果</h2>
        <div class="result-item">
          <span class="result-label">最优配方</span>
          <div class="optimized-recipe">
            <ul class="ingredient-list" v-if="optResult.best_recipe?.materials?.length">
              <li v-for="(m, i) in optResult.best_recipe.materials" :key="i">
                <span class="ing-name">{{ m }}</span>
                <span class="ing-pct">{{ pctText(optResult.best_recipe.proportions[i]) }}</span>
              </li>
            </ul>
            <p v-else style="color:var(--text-secondary)">未返回配方</p>
          </div>
        </div>
        <div class="m2-prop-grid">
          <div v-for="(v, key) in optResult.best_predicted" :key="key" class="m2-prop-cell">
            <div class="m2-prop-name">{{ key }}</div>
            <div class="m2-prop-val">{{ fmt(v) }}</div>
            <div v-if="optResult.target_met && key in optResult.target_met"
                 class="m2-target-badge" :class="optResult.target_met[key] ? 'ok' : 'no'">
              {{ optResult.target_met[key] ? '✓ 达标' : '未达标' }}
            </div>
          </div>
        </div>
        <div class="m2-meta">
          算法 {{ optResult.algorithm }} · 迭代 {{ optResult.iterations }}
          <template v-if="optResult.hypervolume != null"> · 超体积 {{ optResult.hypervolume.toFixed(3) }}</template>
        </div>
      </div>

      <!-- 探索轨迹可视化 -->
      <div class="card">
        <h2>优化 / 探索轨迹</h2>
        <div v-if="tracePoints.length > 1" class="m2-chart-wrap">
          <svg :viewBox="`0 0 ${W} ${H}`" class="m2-chart" role="img" aria-label="目标值收敛曲线">
            <defs>
              <linearGradient id="m2Area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0aa3d8" stop-opacity="0.30" />
                <stop offset="100%" stop-color="#0aa3d8" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <!-- grid -->
            <g v-for="gy in gridY" :key="'gy'+gy">
              <line :x1="padL" :y1="gy" :x2="W-padR" :y2="gy" class="m2-gridline" />
              <text :x="padL-6" :y="gy+4" class="m2-axis" text-anchor="end">{{ yTick(gy) }}</text>
            </g>
            <g v-for="gx in gridX" :key="'gx'+gx">
              <line :x1="gx" :y1="H-padB" :x2="gx" :y2="padT" class="m2-gridline" />
              <text :x="gx" :y="H-padB+16" class="m2-axis" text-anchor="middle">{{ xTick(gx) }}</text>
            </g>
            <!-- area + line (best-so-far) -->
            <polygon :points="areaPts" fill="url(#m2Area)" />
            <polyline :points="linePts" fill="none" class="m2-line" />
            <!-- sampled objective (light) + best-so-far (bright) dots -->
            <g v-for="(pt, i) in rawTrace" :key="'s'+i">
              <circle :cx="pt.x" :cy="pt.yRaw" r="1.8" class="m2-dot-s" />
            </g>
            <g v-for="(pt, i) in tracePoints" :key="'b'+i">
              <circle :cx="pt.x" :cy="pt.y" r="2.6" class="m2-dot" />
            </g>
            <!-- final point label -->
            <text :x="last.x+6" :y="last.y-6" class="m2-best-label">最优 {{ yTick(last.y) }}</text>
          </svg>
        </div>
        <p v-else class="m2-hint">轨迹数据不足（<span v-if="!tracePoints.length">尚未产生</span><span v-else>单点</span>）。</p>
      </div>
    </template>

    <!-- 保留原「测试指标」提交入口 -->
    <div class="card">
      <h2>测试指标录入</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group"><label>指标数值</label><input v-model.number="value" type="number" step="0.01" placeholder="请输入测试指标数值"></div>
        <div class="form-group"><label>指标类型</label><select v-model="type"><option value="strength">强度</option><option value="hardness">硬度</option><option value="elasticity">弹性</option><option value="conductivity">导电性</option></select></div>
        <div class="form-group checkbox-group"><input v-model="loadEmbedding" type="checkbox" id="loadEmbedding"><label for="loadEmbedding">是否加载服役预测embedding文件</label></div>
        <button type="submit" class="btn" :disabled="loading"><span v-if="loading" class="loading" />{{ loading ? '处理中...' : '提交' }}</button>
      </form>
    </div>
    <div v-if="metricResult" class="card">
      <h2>录入结果</h2>
      <div class="result-item"><span class="result-label">指标ID:</span><span class="result-value">{{ metricResult.metricId }}</span></div>
      <div class="result-item"><span class="result-label">优化配方:</span>
        <div class="optimized-recipe">
          <ul class="ingredient-list" v-if="metricResult.modelResult?.optimizedRecipe">
            <li v-for="(ing, i) in metricResult.modelResult.optimizedRecipe.ingredients" :key="i">{{ ing }}: {{ (metricResult.modelResult.optimizedRecipe.proportions[i] * 100).toFixed(2) }}%</li>
          </ul>
          <p v-else style="color:var(--text-secondary)">模型服务暂未返回结果</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { submitModel2, optimizeModel2 } from '../api/models'

const router = useRouter()

// ---- 原测试指标状态 ----
const value = ref(null)
const type = ref('strength')
const loadEmbedding = ref(false)
const loading = ref(false)
const metricResult = ref(null)

// ---- 反向优化状态 ----
const algorithm = ref('nsga2')
const budget = ref(80)
const optimizing = ref(false)
const optResult = ref(null)
const errorMsg = ref('')
const rawTrace = ref([])

// 19 个属性（recipe_opt 真实 property_names）
const allProps = [
  '体密[110℃]','体密[1100℃]','体密[1450℃]','体密[1500℃]',
  '吸水率[1450℃]','气孔率[1450℃]',
  '抗折强度[110℃]','抗折强度[1100℃]','抗折强度[1450℃]','抗折强度[1500℃]',
  '耐压强度[110℃]','耐压强度[1100℃]','耐压强度[1450℃]','耐压强度[1500℃]',
  '高温抗折[1450℃]','高温抗折[1500℃]',
  '线变化率[1100℃]','线变化率[1450℃]','线变化率[1500℃]',
]
const targets = ref([
  { name: '耐压强度[110℃]', direction: 'maximize', lower: 50, upper: null },
  { name: '高温抗折[1450℃]', direction: 'maximize', lower: 3, upper: null },
  { name: '线变化率[1450℃]', direction: 'constrain', lower: -0.5, upper: 0.5 },
])

function addTarget() { targets.value.push({ name: allProps[0], direction: 'maximize', lower: null, upper: null }) }
function removeTarget(i) { targets.value.splice(i, 1) }

async function runOptimize() {
  errorMsg.value = ''
  const cleanTargets = targets.value
    .filter(t => t.name)
    .map(t => ({
      name: t.name,
      direction: t.direction,
      lower: t.lower == null ? null : Number(t.lower),
      upper: t.upper == null ? null : Number(t.upper),
    }))
  optimizing.value = true
  optResult.value = null
  rawTrace.value = []
  try {
    const res = await optimizeModel2({
      targets: cleanTargets.length ? cleanTargets : [],
      algorithm: algorithm.value,
      budget: Math.max(5, budget.value || 60),
    })
    optResult.value = res
    // build sampled trace if backend returned raw per-iteration samples optionally
    rawTrace.value = Array.isArray(res.raw_trace) ? res.raw_trace : []
    if (res.ok === false) errorMsg.value = res.message || '优化失败'
  } catch (e) {
    errorMsg.value = '优化请求失败：' + (e?.message || e || '服务不可用')
    console.error(e)
  } finally {
    optimizing.value = false
  }
}

// ---- 探索轨迹图表 (best-so-far 收敛曲线) ----
const W = 860, H = 300, padL = 64, padR = 24, padT = 24, padB = 40
const trace = computed(() => Array.isArray(optResult.value?.trace) ? optResult.value.trace : [])
const tracePoints = computed(() => {
  // cumulative best-so-far => monotone improving
  let best = Infinity
  const pts = []
  for (const s of trace.value) {
    const v = Number(s.best_objective)
    if (Number.isFinite(v)) { if (v < best) best = v; pts.push(best) }
  }
  return pts
})
const xMin = 0, xMax = computed(() => Math.max(1, trace.value.length - 1))
const yMin = computed(() => { const p = tracePoints.value; return p.length ? Math.min(...p) : 0 })
const yMax = computed(() => { const p = tracePoints.value; return p.length ? Math.max(...p) : 1 })
const Y0 = computed(() => { const p = tracePoints.value; return p.length ? Math.max(Math.max(...p) * 1.05, yMin.value) : 1 })
const Y1 = computed(() => { const p = tracePoints.value; return p.length ? Math.min(...p) * 0.95 : 0 })

function xPos(i) { const n = Math.max(1, xMax.value); return padL + (i / n) * (W - padL - padR) }
function yPos(v) { const r = Y0.value - Y1.value; return padT + ((Y0.value - v) / (r || 1)) * (H - padT - padB) }
const linePts = computed(() => tracePoints.value.map((v, i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' '))
const areaPts = computed(() => {
  const p = tracePoints.value
  if (!p.length) return ''
  const bottom = padT + (H - padT - padB)
  return `${xPos(0).toFixed(1)},${bottom} ${linePts.value} ${xPos(p.length - 1).toFixed(1)},${bottom}`
})
const gridY = computed(() => { const g = []; const r = Y0.value - Y1.value; if (!(r > 0)) return [padT]; for (let k = 0; k <= 4; k++) { g.push(padT + (k / 4) * (H - padT - padB)) } return g })
const gridX = computed(() => { const g = []; const n = Math.max(1, xMax.value); for (let k = 0; k <= 4; k++) { const i = Math.round((k / 4) * n); g.push(xPos(i)) } return g })
function yTick(px) { const v = Y0.value - ((px - padT) / (H - padT - padB)) * (Y0.value - Y1.value); return fmt(v) }
function xTick(px) { return String(Math.round(((px - padL) / (W - padL - padR)) * xMax.value)) }
const last = computed(() => { const p = tracePoints.value; if (!p.length) return { x: padL, y: padT }; return { x: xPos(p.length - 1), y: yPos(p[p.length - 1]) } })

function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  return Math.abs(n) >= 1000 ? n.toFixed(0) : (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2))
}
function pctText(p) {
  const n = Number(p)
  if (!Number.isFinite(n)) return '—'
  const frac = Math.abs(n) <= 1.0001
  return (frac ? n * 100 : n).toFixed(2) + '%'
}

async function handleSubmit() {
  if (value.value === null || isNaN(value.value)) { errorMsg.value = '请输入有效的指标数值'; return }
  errorMsg.value = ''
  loading.value = true
  try {
    const res = await submitModel2({ metrics: { value: value.value, type: type.value }, loadEmbedding: loadEmbedding.value })
    metricResult.value = res
    if (res.modelResult?.status === 'error') errorMsg.value = '配方优化模型服务不可用: ' + (res.modelResult.message || '请启动本地模型服务')
  } catch (e) { errorMsg.value = '提交失败，请稍后重试'; console.error(e) }
  finally { loading.value = false }
}
</script>

<style scoped>
.model2-page { color: #16324f; }
.m2-hint { color: #5b6b7c; font-size: 13px; margin: -12px 0 18px; line-height: 1.7; }
.m2-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.m2-range { margin-top: 10px; }
.m2-range input { width: 100%; accent-color: #0aa3d8; padding: 0; }
.m2-target-head { display: grid; grid-template-columns: 2fr 1.2fr 1fr 1fr 40px; gap: 8px; font-size: 12px; color: #7c8b98; margin: 4px 0 8px; }
.m2-target-row { display: grid; grid-template-columns: 2fr 1.2fr 1fr 1fr 40px; gap: 8px; margin-bottom: 8px; }
.m2-target-row select, .m2-target-row input { width: 100%; }
.m2-add { margin-top: 4px; }
.m2-prop-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.m2-prop-cell { border: 1px solid #dee2e6; border-radius: 8px; padding: 8px 12px; background: #f8fafc; min-width: 150px; }
.m2-prop-name { font-size: 12px; color: #5b6b7c; }
.m2-prop-val { font-size: 16px; font-weight: 700; color: #0d4f8b; margin-top: 2px; }
.m2-target-badge { font-size: 11px; margin-top: 4px; border-radius: 4px; padding: 1px 6px; display: inline-block; }
.m2-target-badge.ok { background: #dcfce7; color: #166534; }
.m2-target-badge.no { background: #fee2e2; color: #991b1b; }
.m2-meta { color: #7c8b98; font-size: 13px; margin-top: 16px; }
.m2-chart-wrap { background: #fff; border: 1px solid #e6edf3; border-radius: 8px; padding: 12px; }
.m2-chart { width: 100%; height: auto; }
.m2-gridline { stroke: #e6edf3; stroke-width: 1; }
.m2-axis { fill: #9aa8b7; font-size: 11px; }
.m2-line { stroke: #0aa3d8; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.m2-dot-s { fill: #9fc9e8; }
.m2-dot { fill: #0d6efd; }
.m2-best-label { fill: #0aa3d8; font-size: 12px; font-weight: 600; }
@media (max-width: 720px) { .m2-grid { grid-template-columns: 1fr; } .m2-target-head, .m2-target-row { grid-template-columns: 1fr 1fr 40px; } .m2-target-head span:nth-child(3),.m2-target-head span:nth-child(4), .m2-target-row input:nth-child(3),.m2-target-row input:nth-child(4) { display: none; } }
</style>
