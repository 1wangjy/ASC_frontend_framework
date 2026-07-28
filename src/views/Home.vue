<template>
  <div class="home-container">
    <nav class="navbar">
      <div class="nav-brand">NEXUS Materials Analytics</div>
      <div class="nav-pill">耐火材料领域 / ASC 体系</div>
    </nav>

    <main class="main-content">
      <div class="page-body">
        <div class="page-primary">
      <section class="hero-section hero-image-card" aria-label="ASC 耐火材料体系分析平台总览图">
        <img :src="ascHeroImage" alt="ASC 耐火材料体系分析平台核心数据总览" />
      </section>

      <section class="module-launcher">
        <div>
          <p class="eyebrow">按需加载工作台</p>
          <h2>ASC 分析功能模块</h2>
          <p>分析板块、导入历史功能、数据库导入功能和数据库呈现模块默认隐藏，点击后再加载完整内容。</p>
        </div>
        <button class="module-trigger-btn" type="button" @click="toggleModules">
          <span>{{ modulesVisible ? '−' : '+' }}</span>
          {{ modulesVisible ? '收起功能模块' : '打开 ASC 分析工作台' }}
        </button>
      </section>

      <Transition name="modules">
        <section v-if="modulesVisible" class="module-stack">
          <Suspense>
            <ASCReportUploader @uploaded="handleReportUploaded" />
            <template #fallback><div class="module-loading">正在加载分析板块...</div></template>
          </Suspense>

          <section class="filter-section">
            <div>
              <p class="eyebrow">交互式分析筛选</p>
              <h2>按服役部位、渣系和分析维度查看 ASC 数据</h2>
            </div>
            <div class="filters">
              <label>应用场景
                <select v-model="selectedScenario">
                  <option v-for="scenario in scenarios" :key="scenario" :value="scenario">{{ scenario }}</option>
                </select>
              </label>
              <label>渣系条件
                <select v-model="selectedSlag">
                  <option v-for="slag in slags" :key="slag" :value="slag">{{ slag }}</option>
                </select>
              </label>
              <label>分析维度
                <select v-model="selectedDimension">
                  <option v-for="dimension in dimensions" :key="dimension" :value="dimension">{{ dimension }}</option>
                </select>
              </label>
            </div>
          </section>

          <section class="database-layout">
            <section class="analysis-grid">
              <article class="academic-context-panel">
                <div>
                  <p class="eyebrow">Academic visualization brief</p>
                  <h3>材料工程 / 耐火材料科学图表规范</h3>
                  <p>面向材料研究者、耐材工程师与质量分析人员，采用论文图版式低饱和配色、明确单位标注与矩阵化比较结构。</p>
                </div>
                <div class="reference-strip" aria-label="学术可视化参考">
                  <span>参考：相图 / 组成-性能图</span>
                  <span>Ashby 性能图</span>
                  <span>腐蚀热力图</span>
                  <span>失效 Pareto 图</span>
                </div>
              </article>

              <article class="analysis-card fused-card material-overview">
                <div class="card-header">
                  <div>
                    <p class="eyebrow">Figure 1 / ASC composition-performance linkage</p>
                    <h3>成分-性能-历史趋势联动</h3>
                  </div>
                  <span>{{ selectedScenario }} · {{ selectedSlag }}</span>
                </div>
                <div class="fusion-layout">
                  <section class="fusion-panel composition-panel">
                    <div class="subhead"><span>配方组成，wt%</span><strong>{{ selectedSlag }}</strong></div>
                    <div class="composition-figure">
                      <div class="composition-stack" aria-label="ASC 配方质量百分比堆叠图">
                        <span
                          v-for="item in compositionData"
                          :key="item.name"
                          class="stack-segment"
                          :style="{ flexGrow: item.value, background: item.color }"
                          :title="`${item.name}: ${item.value}%`"
                        >
                          {{ item.value >= 10 ? item.name : '' }}
                        </span>
                      </div>
                      <div class="composition-axis"><span>0</span><span>25</span><span>50</span><span>75</span><span>100 wt%</span></div>
                      <div class="composition-table">
                        <div class="composition-head"><span>Phase</span><span>Role in ASC</span><span>wt%</span></div>
                        <div v-for="item in compositionData" :key="item.name" class="composition-row">
                          <span><i :style="{ background: item.color }"></i>{{ item.name }}</span>
                          <small>{{ item.role }}</small>
                          <strong>{{ item.value }}</strong>
                        </div>
                      </div>
                      <section class="mini-matrix-panel">
                        <div class="subhead"><span>场景适配性矩阵，score</span><strong>0-100</strong></div>
                        <div class="heatmap mini-heatmap">
                          <div></div>
                          <div v-for="column in heatmapColumns" :key="column" class="heatmap-axis">{{ column }}</div>
                          <template v-for="row in heatmapRows" :key="row.name">
                            <div class="heatmap-axis row-axis">{{ row.name }}</div>
                            <div v-for="cell in row.values" :key="`${row.name}-${cell.label}`" class="heat-cell" :style="{ background: heatColor(cell.value) }">{{ cell.value }}</div>
                          </template>
                        </div>
                      </section>
                    </div>
                  </section>

                  <section class="fusion-panel performance-panel">
                    <div class="subhead"><span>性能评分，0-100</span><strong>{{ selectedDimension }}</strong></div>
                    <div class="performance-dotplot" aria-label="ASC 性能评分点图">
                      <div class="dotplot-scale"><span>0</span><span>50</span><span>100</span></div>
                      <div v-for="item in performanceData" :key="item.label" class="dotplot-row">
                        <div class="dotplot-label"><span>{{ item.label }}</span><small>{{ item.explain }}</small></div>
                        <div class="dotplot-axis">
                          <i></i>
                          <b :style="{ left: `${item.value}%` }"></b>
                        </div>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>

                  <section class="fusion-panel trend-panel">
                    <div class="subhead"><span>强度与抗渣记录，历史批次</span><strong>n=6</strong></div>
                    <svg class="line-chart" viewBox="0 0 360 170" role="img" aria-label="历史批次性能折线图">
                      <line x1="34" y1="50" x2="340" y2="50" class="grid-line" />
                      <line x1="34" y1="94" x2="340" y2="94" class="grid-line" />
                      <line x1="34" y1="138" x2="340" y2="138" class="axis" />
                      <line x1="34" y1="20" x2="34" y2="138" class="axis" />
                      <polyline :points="strengthLine" class="line strength" />
                      <polyline :points="slagLine" class="line slag" />
                      <circle v-for="point in linePoints.strength" :key="`s-${point.x}`" :cx="point.x" :cy="point.y" r="4" class="dot strength-dot" />
                      <circle v-for="point in linePoints.slag" :key="`r-${point.x}`" :cx="point.x" :cy="point.y" r="4" class="dot slag-dot" />
                    </svg>
                    <div class="legend"><span><i class="strength-key"></i>常温耐压强度</span><span><i class="slag-key"></i>抗渣性评分</span></div>
                  </section>

                </div>
              </article>

              <article class="analysis-card fused-card scenario-overview">
                <div class="card-header">
                  <div>
                    <p class="eyebrow">Figure 2 / service matrix and degradation modes</p>
                    <h3>{{ selectedScenario }} 历史失效模式占比</h3>
                  </div>
                  <span>{{ selectedSlag }}</span>
                </div>
                <div class="scenario-fusion">
                  <section class="fusion-panel failure-panel">
                    <div class="subhead"><span>历史失效模式，Pareto</span><strong>占比</strong></div>
                    <div class="failure-list compact-failures">
                      <div v-for="mode in failureModes" :key="mode.name" class="failure-item">
                        <div class="failure-top"><strong>{{ mode.name }}</strong><span>{{ mode.value }}%</span></div>
                        <div class="bar-track compact"><div class="bar-fill" :style="{ width: `${mode.value}%`, background: mode.color }"></div></div>
                        <p>{{ mode.reason }}</p>
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            </section>

            <aside class="database-sidebar condition-sidebar">
              <div class="side-panel-title"><p class="eyebrow">当前分析条件</p><h3>筛选维度</h3></div>
              <div class="db-section filter-summary">
                <span class="db-section-label">当前分析条件</span>
                <div><strong>场景</strong><span>{{ selectedScenario }}</span></div>
                <div><strong>渣系</strong><span>{{ selectedSlag }}</span></div>
                <div><strong>维度</strong><span>{{ selectedDimension }}</span></div>
              </div>
            </aside>
          </section>

          <Suspense>
            <HistoryDatabase />
            <template #fallback><div class="module-loading">正在加载数据库呈现模块...</div></template>
          </Suspense>
        </section>
      </Transition>
        </div>

        <aside class="database-sidebar liked-paper-sidebar">
          <section class="liked-paper-manager" aria-label="兴趣论文管理">
            <div class="side-panel-title">
              <p class="eyebrow">兴趣论文管理</p>
              <h3>Likes 论文库</h3>
            </div>

            <div class="paper-toolbar">
              <span>{{ likedPapers.length }} 篇已保存</span>
              <strong>{{ importedPaperIds.size }} 篇已导入</strong>
            </div>

            <div class="paper-list">
              <button
                v-for="paper in likedPapers"
                :key="paper.id"
                class="paper-row"
                :class="{ active: selectedLikedPaperId === paper.id, imported: importedPaperIds.has(paper.id) }"
                type="button"
                @click="selectedLikedPaperId = paper.id"
              >
                <span class="paper-title">{{ paper.title }}</span>
                <small>{{ paper.authors }} · {{ paper.year }}</small>
              </button>
            </div>

            <article v-if="selectedLikedPaper" class="paper-preview">
              <div class="paper-preview-head">
                <span>{{ selectedLikedPaper.source }}</span>
                <strong>{{ selectedLikedPaper.year }}</strong>
              </div>
              <h4>{{ selectedLikedPaper.title }}</h4>
              <p class="paper-authors">{{ selectedLikedPaper.authors }}</p>
              <p class="paper-abstract">{{ selectedLikedPaper.abstract }}</p>
              <div class="paper-tags">
                <button
                  v-for="tag in selectedLikedPaper.tags"
                  :key="tag"
                  type="button"
                  :class="{ marked: isPaperMarked(selectedLikedPaper.id, tag) }"
                  @click="togglePaperMark(selectedLikedPaper.id, tag)"
                >
                  {{ tag }}
                </button>
              </div>
              <button
                class="paper-import-btn"
                type="button"
                :class="{ imported: importedPaperIds.has(selectedLikedPaper.id) }"
                @click="importLikedPaper(selectedLikedPaper.id)"
              >
                {{ importedPaperIds.has(selectedLikedPaper.id) ? '已加入当前工作区' : '导入至当前工作区' }}
              </button>
              <label class="paper-note">
                个人注释
                <textarea
                  v-model="paperNotes[selectedLikedPaper.id]"
                  rows="4"
                  placeholder="记录该论文对 ASC 成分、性能或失效模式分析的启发"
                ></textarea>
              </label>
            </article>
          </section>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { listPdfFiles } from '../api/pdfLibrary'
import ascHeroImage from '../assets/ASC_WebPage.png'

const HistoryDatabase = defineAsyncComponent(() => import('../components/HistoryDatabase.vue'))
const ASCReportUploader = defineAsyncComponent(() => import('../components/ASCReportUploader.vue'))

const scenarios = ['铁水包渣线', '鱼雷罐内衬', '高炉出铁沟', '钢包冲击区']
const slags = ['高 FeO 渣', '高 CaO 渣', '低碱度渣', '含 MgO 渣']
const dimensions = ['综合分析', '成分关联性', '性能指标', '失效模式']

const selectedScenario = ref(scenarios[0])
const selectedSlag = ref(slags[0])
const selectedDimension = ref(dimensions[0])
const modulesVisible = ref(false)
const pdfDbFiles = ref([])
const pdfDbLoading = ref(false)
const likedPapers = [
  {
    id: 'asc-thermal-shock-2024',
    title: 'Thermal shock resistance of ASC castables under slag-line service',
    authors: 'Li Wei, Chen Hao, Zhang Min',
    year: '2024',
    source: 'Ceramics International',
    abstract: '围绕铁水包渣线 ASC 浇注料的热震循环、残余强度和微裂纹扩展进行实验分析，强调 SiC 含量与碳相保护对抗剥落能力的协同作用。',
    tags: ['热震稳定性', '渣线', 'SiC']
  },
  {
    id: 'asc-slag-corrosion-2023',
    title: 'Slag corrosion behavior of alumina-silicon carbide-carbon refractories',
    authors: 'Maria Santos, Q. Liu',
    year: '2023',
    source: 'Journal of the European Ceramic Society',
    abstract: '基于静态坩埚实验比较高 FeO 与高 CaO 渣对 ASC 基质的侵蚀路径，指出孔隙结构、碳润湿性和抗氧化添加剂共同决定渣渗透深度。',
    tags: ['抗渣性', '高 FeO 渣', '显气孔率']
  },
  {
    id: 'asc-oxidation-additives-2022',
    title: 'Effect of antioxidants on oxidation resistance in ASC refractories',
    authors: 'K. Yamamoto, Sun Rui',
    year: '2022',
    source: 'Refractories Worldforum',
    abstract: '研究金属铝、硅粉和硼系添加剂对 ASC 碳相氧化损失的影响，适合用于建立成分-抗氧化性能-服役寿命之间的关联标注。',
    tags: ['抗氧化性', '添加剂', '碳相氧化']
  }
]
const selectedLikedPaperId = ref(likedPapers[0].id)
const importedPaperIds = ref(new Set())
const paperNotes = ref({})
const paperMarks = ref({})

const scenarioFactor = computed(() => scenarios.indexOf(selectedScenario.value) + 1)
const slagFactor = computed(() => slags.indexOf(selectedSlag.value) + 1)

const compositionData = computed(() => {
  const boost = scenarioFactor.value
  return [
    { name: 'Al₂O₃', value: 66 + boost, role: '骨架相，提供高温强度', color: '#245c8f' },
    { name: 'SiC', value: 14 + slagFactor.value, role: '抗侵蚀、改善导热与抗氧化', color: '#2f8f6b' },
    { name: 'C', value: 7 + (selectedDimension.value === '失效模式' ? 2 : 0), role: '降低润湿，提升抗渣渗透', color: '#2b2f33' },
    { name: '添加剂', value: 5 + boost, role: '调控抗氧化和结合相', color: '#c4772d' },
    { name: '基质细粉', value: 8 - Math.min(boost, 3), role: '影响致密化与施工性能', color: '#7c8794' }
  ]
})

const performanceData = computed(() => [
  { label: '抗渣性', value: 82 + slagFactor.value * 3, explain: '熔渣侵蚀后残余厚度评分' },
  { label: '抗氧化性', value: 78 + scenarioFactor.value * 2, explain: '碳相氧化损失越低评分越高' },
  { label: '热震稳定性', value: 80 + scenarioFactor.value, explain: '急冷急热后裂纹扩展程度' },
  { label: '常温耐压强度', value: 74 + slagFactor.value * 2, explain: '成型和烧后结构完整性' }
])

const batchData = computed(() => {
  const base = scenarioFactor.value * 3 + slagFactor.value
  return [
    { strength: 72 + base, slag: 76 + base },
    { strength: 78 + base, slag: 79 + base },
    { strength: 75 + base, slag: 83 + base },
    { strength: 84 + base, slag: 85 + base },
    { strength: 88 + base, slag: 87 + base },
    { strength: 86 + base, slag: 90 + base }
  ]
})

const linePoints = computed(() => {
  const toPoints = (key) => batchData.value.map((item, index) => ({ x: 34 + index * 58, y: 150 - (item[key] - 60) * 3 }))
  return { strength: toPoints('strength'), slag: toPoints('slag') }
})
const strengthLine = computed(() => linePoints.value.strength.map((p) => `${p.x},${p.y}`).join(' '))
const slagLine = computed(() => linePoints.value.slag.map((p) => `${p.x},${p.y}`).join(' '))

const heatmapColumns = ['抗渣', '抗氧化', '热震', '施工']
const scoreCells = (values) => values.map((value, index) => ({ label: heatmapColumns[index], value: Math.min(99, value + scenarioFactor.value + slagFactor.value) }))
const heatmapRows = computed(() => [
  { name: '渣线', values: scoreCells([92, 84, 78, 75]) },
  { name: '冲击区', values: scoreCells([80, 82, 88, 79]) },
  { name: '内衬', values: scoreCells([76, 86, 84, 83]) }
])
const heatColor = (value) => value >= 92 ? '#245c8f' : value >= 86 ? '#2f8f6b' : value >= 80 ? '#d99a3d' : '#d7dee6'

const failureModes = computed(() => {
  const oxidation = 18 + slagFactor.value * 2
  const penetration = 28 + scenarioFactor.value * 2
  const spalling = 20 + (selectedScenario.value === '高炉出铁沟' ? 6 : 0)
  return [
    { name: '渣侵蚀/渗透', value: penetration, reason: 'FeO 或 CaO 富集渣进入基质孔道，削弱结合相。', color: '#245c8f' },
    { name: '碳相氧化', value: oxidation, reason: '碳网络被氧化后润湿角降低，抗渣屏障减弱。', color: '#c4772d' },
    { name: '热震剥落', value: spalling, reason: '温度梯度造成热应力集中，裂纹沿基质扩展。', color: '#2f8f6b' },
    { name: '机械冲刷', value: 100 - penetration - oxidation - spalling, reason: '铁水流动和装出料冲击导致表层磨耗。', color: '#7c8794' }
  ]
})

const selectedLikedPaper = computed(() => likedPapers.find((paper) => paper.id === selectedLikedPaperId.value))

const importLikedPaper = (paperId) => {
  importedPaperIds.value = new Set([...importedPaperIds.value, paperId])
}

const isPaperMarked = (paperId, tag) => Boolean(paperMarks.value[paperId]?.includes(tag))

const togglePaperMark = (paperId, tag) => {
  const current = paperMarks.value[paperId] || []
  paperMarks.value = {
    ...paperMarks.value,
    [paperId]: current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag]
  }
}

const loadPdfDatabase = async () => {
  try {
    pdfDbLoading.value = true
    const res = await listPdfFiles({ sort_by: 'created_at', order: 'desc' })
    pdfDbFiles.value = res.data || []
  } catch {
    pdfDbFiles.value = []
  } finally {
    pdfDbLoading.value = false
  }
}

const toggleModules = async () => {
  modulesVisible.value = !modulesVisible.value
  if (modulesVisible.value) await loadPdfDatabase()
}

const handleReportUploaded = async () => {
  await loadPdfDatabase()
}

const formatDbSize = (size) => {
  const value = Number(size || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}
const formatDbTime = (value) => value ? new Date(value).toLocaleString() : '未知时间'
</script>

<style scoped>
:root {
  --ink: #17212b;
  --muted: #607080;
  --line: #d9e1e8;
  --panel: #ffffff;
  --soft: #f4f7fa;
  --blue: #245c8f;
  --green: #2f8f6b;
  --amber: #c4772d;
  --charcoal: #2b2f33;
}

.home-container { min-height: 100vh; background: #eef3f7; color: var(--ink); font-family: 'Space Grotesk', 'Noto Sans SC', system-ui, sans-serif; }
.navbar { height: 64px; padding: 0 40px; background: #17212b; color: #fff; display: flex; align-items: center; justify-content: space-between; }
.nav-brand { font-weight: 800; }
.nav-pill { border: 1px solid rgba(255,255,255,.28); padding: 8px 12px; font-size: .86rem; color: #d7e6f4; }
.main-content { max-width: 1720px; margin: 0 auto; padding: 34px 32px 56px; }
.page-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
.page-primary { min-width: 0; }
.hero-section { display: block; }
.hero-image-card { background: #eef3f7; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 12px 30px rgba(31,48,65,.08); overflow: hidden; }
.hero-image-card img { width: 100%; display: block; height: auto; object-fit: contain; }
.filter-section, .analysis-card, .module-launcher, .database-sidebar { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 12px 30px rgba(31,48,65,.08); }
.version-text, .eyebrow { color: var(--muted); font-size: .78rem; text-transform: uppercase; font-weight: 800; }
.filter-section, .module-launcher { margin-top: 24px; padding: 24px; display: flex; justify-content: space-between; gap: 24px; align-items: center; }
.module-stack .filter-section { margin-top: 0; }
.filter-section h2, .module-launcher h2 { margin: 4px 0 0; font-size: 1.5rem; }
.module-launcher p { margin: 8px 0 0; color: var(--muted); line-height: 1.6; }
.filters { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 12px; min-width: 560px; }
label { display: flex; flex-direction: column; gap: 7px; color: var(--muted); font-size: .86rem; font-weight: 700; }
select { border: 1px solid var(--line); background: #fff; color: var(--ink); padding: 11px 12px; border-radius: 6px; font: inherit; }
.module-trigger-btn { border: 0; border-radius: 8px; background: #245c8f; color: #fff; min-height: 64px; min-width: 300px; padding: 0 22px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; font-weight: 900; cursor: pointer; white-space: nowrap; box-shadow: 0 14px 28px rgba(36,92,143,.22); }
.module-trigger-btn:hover { background: #1f4f7b; transform: translateY(-1px); }
.module-trigger-btn span { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,.18); display: inline-flex; align-items: center; justify-content: center; font-size: 1.1rem; }
.module-stack { margin-top: 24px; display: grid; gap: 24px; }
.module-loading { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 24px; color: var(--muted); font-weight: 800; }
.modules-enter-active, .modules-leave-active { transition: opacity .22s ease, transform .22s ease; }
.modules-enter-from, .modules-leave-to { opacity: 0; transform: translateY(8px); }
.database-layout { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 18px; align-items: start; }
.database-sidebar { padding: 18px; position: sticky; top: 18px; display: grid; gap: 18px; }
.liked-paper-sidebar { top: 88px; max-height: calc(100vh - 112px); overflow: auto; }
.liked-paper-sidebar::-webkit-scrollbar { width: 6px; }
.liked-paper-sidebar::-webkit-scrollbar-thumb { background: #cbd7e2; border-radius: 999px; }
.side-panel-title h3 { margin: 4px 0 0; font-size: 1.15rem; }
.compact-title { border-top: 1px solid var(--line); padding-top: 16px; }
.db-section-label, .empty-db { color: var(--muted); font-size: .83rem; }
.db-section { display: grid; gap: 10px; }
.db-section-label { font-weight: 900; }
.filter-summary { border-top: 1px solid var(--line); padding-top: 14px; }
.filter-summary div { display: flex; justify-content: space-between; gap: 12px; align-items: center; background: #f7fafc; border: 1px solid var(--line); border-radius: 6px; padding: 9px; }
.filter-summary span { color: var(--muted); text-align: right; }
.liked-paper-manager { display: grid; gap: 14px; }
.paper-toolbar { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 8px; background: #f7fafc; padding: 10px; color: var(--muted); font-size: .82rem; font-weight: 800; }
.paper-toolbar strong { color: var(--green); }
.paper-list { display: grid; gap: 8px; max-height: 220px; overflow: auto; padding-right: 4px; }
.paper-list::-webkit-scrollbar { width: 6px; }
.paper-list::-webkit-scrollbar-thumb { background: #cbd7e2; border-radius: 999px; }
.paper-row { border: 1px solid var(--line); border-radius: 8px; background: #ffffff; padding: 10px; display: grid; gap: 5px; text-align: left; cursor: pointer; color: var(--ink); transition: border-color .18s ease, background .18s ease, box-shadow .18s ease; }
.paper-row:hover, .paper-row.active { border-color: var(--blue); background: #f3f8fc; box-shadow: 0 8px 18px rgba(36,92,143,.10); }
.paper-row.imported { border-left: 4px solid var(--green); }
.paper-title { font-weight: 900; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.paper-row small { color: var(--muted); line-height: 1.4; }
.paper-preview { border: 1px solid var(--line); border-radius: 8px; background: #ffffff; padding: 14px; display: grid; gap: 10px; }
.paper-preview-head { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: .78rem; font-weight: 900; }
.paper-preview-head strong { color: var(--blue); }
.paper-preview h4 { margin: 0; font-size: 1rem; line-height: 1.35; color: var(--ink); }
.paper-authors { margin: 0; color: var(--blue); font-weight: 800; font-size: .84rem; line-height: 1.45; }
.paper-abstract { margin: 0; color: #314252; line-height: 1.6; font-size: .86rem; }
.paper-tags { display: flex; flex-wrap: wrap; gap: 7px; }
.paper-tags button { border: 1px solid #cbd7e2; border-radius: 999px; background: #f7fafc; color: #314252; padding: 6px 9px; font-size: .78rem; font-weight: 800; cursor: pointer; }
.paper-tags button.marked { border-color: var(--amber); background: #fff6e8; color: #7a4d12; }
.paper-import-btn { border: 0; border-radius: 8px; background: var(--blue); color: #fff; min-height: 42px; padding: 0 12px; font-weight: 900; cursor: pointer; }
.paper-import-btn.imported { background: var(--green); cursor: default; }
.paper-note { display: grid; gap: 8px; color: var(--muted); font-size: .82rem; font-weight: 900; }
.paper-note textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px; resize: vertical; min-height: 92px; font: inherit; line-height: 1.5; color: var(--ink); background: #f7fafc; }
.analysis-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
.academic-context-panel { background: #fbfcfd; border: 1px solid #cfd8e1; border-left: 5px solid #245c8f; border-radius: 8px; padding: 18px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .9fr); gap: 18px; align-items: center; box-shadow: 0 8px 22px rgba(31,48,65,.06); }
.academic-context-panel h3 { margin: 4px 0 8px; font-size: 1.15rem; letter-spacing: 0; }
.academic-context-panel p { margin: 0; color: #4b5b68; line-height: 1.6; font-size: .92rem; }
.reference-strip { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.reference-strip span { border: 1px solid #cfd8e1; background: #ffffff; border-radius: 6px; padding: 8px 10px; color: #314252; font-size: .8rem; font-weight: 850; }
.analysis-card { padding: 22px; min-height: 0; background: #fbfcfd; }
.fused-card { overflow: hidden; }
.card-header { display: flex; justify-content: space-between; gap: 18px; align-items: start; margin-bottom: 16px; }
.card-header h3 { margin: 4px 0 0; font-size: 1.25rem; }
.card-header > span { color: #34495e; background: #edf2f6; border: 1px solid #d4dde5; border-radius: 6px; padding: 7px 10px; font-size: .82rem; font-weight: 850; white-space: nowrap; }
.fusion-layout { display: grid; grid-template-columns: minmax(360px, 1.25fr) minmax(280px, .9fr); grid-template-areas: "composition performance" "composition trend"; gap: 14px; align-items: stretch; }
.scenario-fusion { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: stretch; }
.fusion-panel { background: #ffffff; border: 1px solid #cfd8e1; border-radius: 6px; padding: 16px; min-width: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.7); }
.composition-panel { grid-area: composition; }
.performance-panel { grid-area: performance; }
.trend-panel { grid-area: trend; }
.subhead { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; color: #516170; font-size: .78rem; font-weight: 900; text-transform: uppercase; letter-spacing: .02em; }
.subhead strong { color: #245c8f; white-space: nowrap; text-transform: none; letter-spacing: 0; }
.composition-figure { display: grid; gap: 12px; }
.composition-stack { height: 46px; border: 1px solid #8fa1b1; background: #fff; display: flex; overflow: hidden; border-radius: 4px; }
.stack-segment { min-width: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: .74rem; font-weight: 900; text-shadow: 0 1px 1px rgba(0,0,0,.28); box-shadow: inset -1px 0 0 rgba(255,255,255,.45); }
.composition-axis { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: -6px; color: #607080; font-size: .72rem; font-weight: 800; }
.composition-axis span:not(:first-child) { text-align: right; }
.composition-table { border: 1px solid #d7e0e8; border-radius: 4px; overflow: hidden; background: #fff; }
.composition-head, .composition-row { display: grid; grid-template-columns: 92px minmax(170px, 1fr) 48px; gap: 10px; align-items: center; padding: 8px 10px; }
.composition-head { background: #edf2f6; color: #516170; font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .03em; }
.composition-row + .composition-row { border-top: 1px solid #e5ebf0; }
.composition-row span { display: flex; align-items: center; gap: 8px; font-weight: 900; }
.composition-row i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; flex: 0 0 auto; }
.composition-row small { color: #516170; line-height: 1.4; }
.composition-row strong { text-align: right; color: #17212b; }
.mini-matrix-panel { width: min(460px, 100%); margin-top: 6px; border: 1px solid #d7e0e8; border-radius: 4px; background: #fbfcfd; padding: 10px; }
.mini-matrix-panel .subhead { margin-bottom: 8px; font-size: .7rem; }
.mini-heatmap { grid-template-columns: 48px repeat(4, minmax(42px, 1fr)); gap: 4px; }
.mini-heatmap .heatmap-axis { font-size: .72rem; }
.mini-heatmap .heat-cell { min-height: 34px; border-radius: 3px; font-size: .82rem; }
.performance-dotplot { display: grid; gap: 12px; padding-top: 2px; }
.dotplot-scale { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-left: min(38%, 190px); color: #607080; font-size: .72rem; font-weight: 900; }
.dotplot-scale span:nth-child(2) { text-align: center; }
.dotplot-scale span:last-child { text-align: right; }
.dotplot-row { display: grid; grid-template-columns: minmax(130px, .85fr) minmax(140px, 1fr) 34px; gap: 12px; align-items: center; }
.dotplot-label { display: grid; gap: 3px; }
.dotplot-label span { font-weight: 900; }
.dotplot-label small { color: #607080; line-height: 1.35; }
.dotplot-axis { position: relative; height: 30px; border-bottom: 1px solid #8fa1b1; background: linear-gradient(to right, #d7e0e8 1px, transparent 1px) 0 0 / 25% 100%; }
.dotplot-axis i { position: absolute; left: 70%; right: 10%; top: 11px; height: 8px; background: rgba(47,143,107,.16); border: 1px solid rgba(47,143,107,.25); }
.dotplot-axis b { position: absolute; top: 7px; width: 15px; height: 15px; transform: translateX(-50%); border-radius: 50%; background: #245c8f; border: 3px solid #fff; box-shadow: 0 0 0 1px #245c8f; }
.dotplot-row strong { color: #17212b; font-weight: 900; }
.bar-chart, .radar-like, .failure-list { display: grid; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 72px minmax(120px, 1fr) 46px; gap: 10px; align-items: center; }
.bar-label, .bar-row strong { font-weight: 800; }
.bar-track { height: 10px; background: #edf2f6; border: 1px solid #d7e0e8; border-radius: 999px; overflow: hidden; }
.bar-track.compact { height: 8px; }
.bar-fill { height: 100%; border-radius: inherit; }
.bar-row small, .score-row small, .failure-item p { color: var(--muted); line-height: 1.5; }
.bar-row small { grid-column: 2 / -1; margin-top: -4px; }
.score-row { display: grid; grid-template-columns: minmax(120px, 1fr) 96px 34px; gap: 10px; align-items: center; }
.score-row div { display: flex; flex-direction: column; gap: 4px; }
.line-chart { width: 100%; height: 132px; background: #fbfcfd; border: 1px solid #d7e0e8; border-radius: 6px; }
.axis { stroke: #8091a1; stroke-width: 1.2; }
.grid-line { stroke: #e3e9ef; stroke-width: 1; stroke-dasharray: 3 4; }
.line { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.line.strength { stroke: var(--blue); }
.line.slag { stroke: var(--green); }
.dot { stroke: #fff; stroke-width: 2; }
.strength-dot { fill: var(--blue); }
.slag-dot { fill: var(--green); }
.legend { display: flex; gap: 14px; margin-top: 10px; color: var(--muted); font-size: .82rem; flex-wrap: wrap; }
.legend span { display: flex; align-items: center; gap: 7px; }
.legend i { width: 12px; height: 12px; display: inline-block; border-radius: 50%; }
.strength-key { background: var(--blue); }
.slag-key { background: var(--green); }
.heatmap { display: grid; grid-template-columns: 74px repeat(4, 1fr); gap: 6px; }
.heatmap-axis { color: var(--muted); font-weight: 800; font-size: .85rem; display: flex; align-items: center; justify-content: center; }
.row-axis { justify-content: flex-start; }
.heat-cell { min-height: 54px; border-radius: 4px; color: #fff; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); }
.failure-top { display: flex; justify-content: space-between; margin-bottom: 8px; }
.failure-item { background: #fbfcfd; border: 1px solid #d7e0e8; border-radius: 6px; padding: 10px; }
.failure-item p { margin: 7px 0 0; font-size: .86rem; }
@media (max-width: 1180px) {
  .page-body, .hero-section, .filter-section, .module-launcher, .database-layout { grid-template-columns: 1fr; display: grid; }
  .filters, .analysis-grid, .fusion-layout, .scenario-fusion, .academic-context-panel { min-width: 0; grid-template-columns: 1fr; }
  .fusion-layout { grid-template-areas: "composition" "performance" "trend"; }
  .database-sidebar { position: static; }
  .liked-paper-sidebar { max-height: none; overflow: visible; }
  .reference-strip { justify-content: flex-start; }
}
@media (max-width: 720px) {
  .navbar { height: auto; padding: 16px; align-items: flex-start; gap: 12px; flex-direction: column; }
  .main-content { padding: 18px 14px 36px; }
  .filter-section, .module-launcher, .analysis-card, .database-sidebar { padding: 18px; }
  .composition-head, .composition-row { grid-template-columns: 1fr 42px; }
  .composition-head span:nth-child(2), .composition-row small { grid-column: 1 / -1; }
  .dotplot-scale { margin-left: 0; }
  .dotplot-row, .bar-row, .score-row { grid-template-columns: 1fr; }
  .dotplot-axis { grid-column: 1 / -1; }
  .bar-track, .bar-row small { grid-column: 1 / -1; }
  .fusion-panel { padding: 14px; }
  .heatmap { grid-template-columns: 58px repeat(4, minmax(48px, 1fr)); gap: 6px; }
  .heat-cell { min-height: 46px; font-size: .9rem; }
}
</style>
