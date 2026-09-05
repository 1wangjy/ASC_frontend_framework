<template>
  <div class="ml-ds">
    <div class="ml-ds__bar">
      <div class="ml-ds__chips">
        <span class="ml-ds__chip ml-ds__chip--brand"><i class="ml-ds__dot" />统一 ML 预测数据集 · sqlite</span>
        <span class="ml-ds__chip">来源: batch183 / zibo / yangquan</span>
      </div>
      <button class="btn btn-ghost btn-small" :disabled="loading" title="把 ./private/*.npy 载入 sqlite（幂等）" @click="doLoad">
        <span v-if="loading" class="loading" />{{ loading ? '载入中…' : '载入 ML 数据集' }}
      </button>
    </div>

    <div v-if="loadMsg" class="status-message" :class="loadErr ? 'error' : 'success'">{{ loadMsg }}</div>

    <!-- 概览统计卡 -->
    <div class="ml-ds__stats" v-if="summary">
      <div class="ml-ds__stat"><span class="ml-ds__stat-label">配方样本</span><span class="ml-ds__stat-value">{{ summary.formulas }}</span><span class="ml-ds__stat-sub">ml_formula</span></div>
      <div class="ml-ds__stat"><span class="ml-ds__stat-label">组分特征行</span><span class="ml-ds__stat-value">{{ summary.components }}</span><span class="ml-ds__stat-sub">ml_formula_component</span></div>
      <div class="ml-ds__stat"><span class="ml-ds__stat-label">来源数</span><span class="ml-ds__stat-value">{{ (summary.bySource || []).length }}</span><span class="ml-ds__stat-sub">{{ sourceText }}</span></div>
      <div class="ml-ds__stat"><span class="ml-ds__stat-label">y 有效样本</span><span class="ml-ds__stat-value">{{ summary.yLabelsValid }}</span><span class="ml-ds__stat-sub">/ {{ summary.formulas }}</span></div>
    </div>

    <!-- 数据源元数据表 -->
    <section class="card ml-ds__card">
      <header class="ml-ds__head">
        <h3 class="ml-ds__title">数据源元数据 <span class="ml-ds__sub">ml_dataset_meta</span></h3>
        <span class="ml-ds__hint">每源: 样本/组分计数 · 特征名(comp/global) · y 键 · version</span>
      </header>
      <div v-if="!meta" class="status-message success">…加载</div>
      <div v-else-if="!meta.length" class="status-message error">暂无元数据 —— 先点右上「载入 ML 数据集」。</div>
      <div v-else class="ml-ds__tablewrap">
        <table class="ml-ds__table">
          <thead><tr><th>数据集来源</th><th>样本数</th><th>组分行</th><th>组分特征数</th><th>全局特征数</th><th>y 属性</th><th>version</th><th>载入时间</th></tr></thead>
          <tbody>
            <tr v-for="m in meta" :key="m.dataset_source">
              <td class="ml-ds__id">{{ m.dataset_source }}</td>
              <td>{{ m.sample_count }}</td>
              <td>{{ m.total_component_count }}</td>
              <td>{{ compCount(m) }}</td>
              <td>{{ globalCount(m) }}</td>
              <td>{{ yCount(m) }}</td>
              <td>{{ m.dataset_version }}</td>
              <td class="ml-ds__mut">{{ (m.ingested_at || '').replace('T',' ').slice(0,19) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 特征归一化统计表 -->
    <section class="card ml-ds__card">
      <header class="ml-ds__head">
        <h3 class="ml-ds__title">特征归一化统计 <span class="ml-ds__sub">ml_feature_stats</span></h3>
        <div class="ml-ds__filters">
          <select v-model="statsSource" class="filter-input" style="min-width:130px" aria-label="按来源筛选" @change="loadStats">
            <option value="">全部来源</option>
            <option v-for="m in meta || []" :key="m.dataset_source" :value="m.dataset_source">{{ m.dataset_source }}</option>
          </select>
          <input v-model="statsFeature" type="text" placeholder="过滤特征名 (如 PC1)…" class="filter-input" style="min-width:160px" @input="loadStats" />
        </div>
      </header>
      <p class="ml-ds__note">数值特征 count/mean/std/min/max —— 后续训练归一化口径即取自本表。PC1..PC20 为各组分主成分 embedding；material_id 为文本不入统计。</p>
      <div v-if="!statsLoaded" class="status-message success">…加载</div>
      <div v-else-if="!stats.length" class="status-message error">无匹配统计（换源或清除特征过滤）。</div>
      <div v-else class="ml-ds__tablewrap">
        <table class="ml-ds__table">
          <thead><tr><th>来源</th><th>特征名</th><th>层次</th><th>count</th><th>mean</th><th>std</th><th>min</th><th>max</th></tr></thead>
          <tbody>
            <tr v-for="s in stats" :key="s.dataset_source + s.feature_name + s.feature_kind">
              <td class="ml-ds__id">{{ s.dataset_source }}</td>
              <td><code class="ml-ds__feat">{{ s.feature_name }}</code></td>
              <td><span class="ml-ds__kind">{{ s.feature_kind === 'comp' ? '组分' : '全局' }}</span></td>
              <td>{{ s.count }}</td>
              <td class="num">{{ fmtNum(s.mean) }}</td>
              <td class="num">{{ fmtNum(s.std) }}</td>
              <td class="num">{{ fmtNum(s.min) }}</td>
              <td class="num">{{ fmtNum(s.max) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="stats.length > 300" class="ml-ds__note">仅显示前 {{ stats.length }} 行，可用特征名过滤收窄。</p>
      </div>
    </section>

    <!-- 样本浏览器 -->
    <section class="card ml-ds__card">
      <header class="ml-ds__head">
        <h3 class="ml-ds__title">样本浏览器 <span class="ml-ds__sub">ml_formula + components</span></h3>
        <div class="ml-ds__filters">
          <select v-model="formulaSource" class="filter-input" style="min-width:130px" aria-label="样本来源" @change="loadFormulas">
            <option v-for="m in meta || []" :key="m.dataset_source" :value="m.dataset_source">{{ m.dataset_source }}</option>
          </select>
          <span class="ml-ds__chip">展示前 {{ formulas.length }} 条（共 {{ formulaTotal }}）</span>
        </div>
      </header>
      <p class="ml-ds__note">每样本 = 配方：n 个组分 × 51 特征(含 PC1..PC20/氧化物)，展开某配方可看各组分的 material_id / ratio / PC 预览。</p>
      <div v-if="!formulas.length" class="status-message success">…加载</div>
      <div v-else>
        <div v-for="f in formulas" :key="f.dataset_source + f.recipe_id" class="ml-ds__frow">
          <button class="ml-ds__fhead" @click="toggleFormula(f.dataset_source, f.recipe_id)">
            <span class="ml-ds__id">{{ f.recipe_id }}</span>
            <span class="ml-ds__chip">组分 {{ f.n_components }}</span>
            <span class="ml-ds__fexpand">{{ expandedKey === (f.dataset_source + '|' + f.recipe_id) ? '▾' : '▸' }}</span>
          </button>
          <div v-if="expandedKey === (f.dataset_source + '|' + f.recipe_id)" class="ml-ds__fbody">
            <div v-if="componentsLoading" class="status-message success">…载入组分</div>
            <div v-else-if="!components.length" class="status-message error">无组分数据</div>
            <div v-else class="ml-ds__tablewrap">
              <table class="ml-ds__table">
                <thead><tr><th>#</th><th>material_id</th><th>ratio%</th><th>PC1</th><th>PC2</th><th>PC3</th></tr></thead>
                <tbody>
                  <tr v-for="c in components" :key="c.comp_index">
                    <td>{{ c.comp_index }}</td>
                    <td class="ml-ds__id">{{ c.material_id }}</td>
                    <td class="num">{{ c.ratio_pct }}</td>
                    <td class="num">{{ pc(c,'PC1') }}</td>
                    <td class="num">{{ pc(c,'PC2') }}</td>
                    <td class="num">{{ pc(c,'PC3') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getMlSummary, getMlMeta, getMlStats, listMlFormulas, getMlComponents, loadMlDataset } from '../api/mlDataset'

const summary = ref(null)
const meta = ref(null)
const stats = ref([])
const statsLoaded = ref(false)
const statsSource = ref('')
const statsFeature = ref('')
const formulas = ref([])
const formulaTotal = ref(0)
const formulaSource = ref('')
const expandedKey = ref('')
const components = ref([])
const componentsLoading = ref(false)
const loading = ref(false)
const loadMsg = ref('')
const loadErr = ref(false)

const sourceText = computed(() => (summary.value?.bySource || []).map(s => `${s.dataset_source}:${s.n}`).join(' · '))
const compCount = m => JSON.parse(m.comp_feature_names || '[]').length
const globalCount = m => JSON.parse(m.global_feature_names || '[]').length
const yCount = m => JSON.parse(m.y_feature_keys || '[]').length

let statsTimer = null
function loadStats() {
  clearTimeout(statsTimer)
  statsTimer = setTimeout(async () => {
    try {
      stats.value = await getMlStats({ source: statsSource.value || undefined, feature: statsFeature.value || undefined })
    } catch (e) { stats.value = []; }
    statsLoaded.value = true
  }, 220)
}

async function loadFormulas() {
  try {
    const rows = await listMlFormulas({ source: formulaSource.value, limit: 20 })
    formulas.value = rows
    formulaTotal.value = rows.length
  } catch (e) { formulas.value = [] }
}

async function toggleFormula(src, rid) {
  const key = src + '|' + rid
  expandedKey.value = expandedKey.value === key ? '' : key
  if (!expandedKey.value) return
  componentsLoading.value = true
  try { components.value = await getMlComponents({ source: src, recipe_id: rid }) }
  catch (e) { components.value = [] }
  componentsLoading.value = false
}

function pc(c, name) {
  try { const o = JSON.parse(c.component_features || '{}'); const v = o[name]; return v == null ? '—' : Number(v).toFixed(3) }
  catch (e) { return '—' }
}
function fmtNum(v) { if (v == null || !Number.isFinite(Number(v))) return '—'; const n = Number(v); return Math.abs(n) >= 1e4 || (Math.abs(n) < 1e-3 && n !== 0) ? n.toExponential(2) : (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(4)) }

async function doLoad() {
  loading.value = true; loadErr.value = false; loadMsg.value = ''
  try { const r = await loadMlDataset(); loadMsg.value = '载入完成：' + String(r?.message || '').trim() }
  catch (e) { loadErr.value = true; loadMsg.value = '载入失败：' + (e?.message || e) }
  finally { loading.value = false; loadAll() }
}

async function loadAll() {
  try { summary.value = await getMlSummary() } catch (e) { /* ignore */ }
  try { meta.value = await getMlMeta() } catch (e) { meta.value = [] }
  if (!formulaSource.value && meta.value && meta.value.length) formulaSource.value = meta.value[0].dataset_source
  loadStats(); loadFormulas()
}

onMounted(loadAll)
</script>

<style scoped>
.ml-ds { display: flex; flex-direction: column; gap: 14px; color: #16324f; }
.ml-ds__bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ml-ds__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.ml-ds__chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; background: #eef4fb; color: #41607f; border: 1px solid #dfe9f3; }
.ml-ds__chip--brand { background: var(--asc-primary-soft, #eaf5fc); color: var(--asc-primary, #0869ad); border-color: color-mix(in srgb, var(--asc-primary) 18%, #fff); }
.ml-ds__dot { width: 7px; height: 7px; border-radius: 50%; background: #0aa3d8; display: inline-block; }
.ml-ds__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.ml-ds__stat { background: #fff; border: 1px solid #e3ebf3; border-radius: 10px; padding: 12px 14px; box-shadow: 0 2px 8px rgba(8,105,173,.05); }
.ml-ds__stat-label { display: block; font-size: 12px; color: #60758b; }
.ml-ds__stat-value { display: block; font-size: 26px; font-weight: 800; color: var(--asc-primary, #0869ad); line-height: 1.15; }
.ml-ds__stat-sub { font-size: 11px; color: #8ba0b3; }
.ml-ds__card { margin: 0; }
.ml-ds__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ml-ds__title { font-size: 16px; color: #16324f; margin: 0; display: flex; align-items: center; gap: 8px; }
.ml-ds__sub { font-size: 11px; font-weight: 500; color: #8ba0b3; background: #eef4fb; padding: 1px 7px; border-radius: 999px; font-family: monospace; }
.ml-ds__hint, .ml-ds__note { font-size: 12px; color: #76889b; margin: 0 0 8px; line-height: 1.6; }
.ml-ds__filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ml-ds__tablewrap { overflow-x: auto; border: 1px solid #e3ebf3; border-radius: 8px; }
.ml-ds__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ml-ds__table th { background: #f2f7fb; color: #41607f; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 1px solid #dfe9f3; white-space: nowrap; }
.ml-ds__table td { padding: 6px 12px; border-bottom: 1px solid #eef3f8; color: #3c5470; }
.ml-ds__table tbody tr:hover { background: #f6fafd; }
.ml-ds__table .num { text-align: right; font-variant-numeric: tabular-nums; }
.ml-ds__id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--asc-primary, #0869ad); }
.ml-ds__mut { color: #8ba0b3; }
.ml-ds__feat { background: #eef4fb; padding: 0 5px; border-radius: 4px; color: #0d4f8b; }
.ml-ds__kind { padding: 1px 7px; border-radius: 999px; font-size: 11px; background: #e7f2ff; color: #0a75bd; }
.ml-ds__frow { border: 1px solid #e3ebf3; border-radius: 8px; margin-bottom: 6px; overflow: hidden; }
.ml-ds__fhead { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fbfd; border: none; cursor: pointer; text-align: left; font-size: 13px; }
.ml-ds__fhead:hover { background: #eef6fc; }
.ml-ds__fexpand { margin-left: auto; color: #0aa3d8; font-size: 13px; }
.ml-ds__fbody { padding: 10px; border-top: 1px solid #eef3f8; background: #fff; }
</style>
