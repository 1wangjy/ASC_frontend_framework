<template>
  <div class="platform-page model4-page">
    <div class="page-header">
      <h1>仿真重建</h1>
      <a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a>
    </div>

    <div class="card m4-shell pl-eqcols m4-layout">
      <!-- ── 左：数据加载 ── -->
      <aside class="pl-eqcol m4-left" aria-label="仿真重建 · 数据加载">
        <header class="m4-head pl-workbench-head">
          <span class="m4-chip m4-chip--brand"><i class="m4-dot" />结构 → 温度场 → 3D</span>
          <span v-if="modelInfo" class="m4-chip m4-chip--ok">模型已加载</span>
        </header>

        <div class="m4-body pl-eqfill pl-scroll">
          <div v-if="statusMessage" class="status-message" :class="statusType" style="margin:0">{{ statusMessage }}</div>

          <div class="m4-sec">
            <div class="form-group">
              <label for="m4-stl">结构拓扑文件 (.stl, .obj)</label>
              <input id="m4-stl" type="file" class="m4-file" accept=".stl,.obj" @change="onStlChange">
              <div v-if="stlFileName" class="file-info" style="margin-top:6px">已选择: {{ stlFileName }} ({{ stlFileSize }})</div>
              <div class="m4-sample">
                <button type="button" class="btn btn-ghost" :disabled="sampleLoading" @click="loadSampleStl">
                  <span v-if="sampleLoading" class="loading" />{{ sampleLoading ? '加载中...' : '加载示例 STL' }}
                </button>
                <a class="m4-sample__dl" :href="SAMPLE_STL_PATH" download>下载示例 STL（iron_gutter_test.stl）</a>
              </div>
              <p class="m4-sample__hint">示例可直接点「加载示例 STL」：自动载入铁沟试件并重建温度场。</p>
            </div>
            <div class="form-group">
              <label for="m4-temp">温度点文件 (.csv, .json)</label>
              <input id="m4-temp" type="file" class="m4-file" accept=".csv,.json" @change="onTempChange">
              <div v-if="tempFileName" class="file-info" style="margin-top:6px">已选择: {{ tempFileName }} ({{ tempFileSize }})</div>
            </div>
          </div>

          <div class="m4-sec">
            <div class="m4-actions">
              <button class="btn" :disabled="!canProcess || loading" @click="processStl">
                <span v-if="loading" class="loading" />{{ loading ? '处理中...' : '重建温度场' }}
              </button>
              <button class="btn btn-ghost" @click="clearAll">清除</button>
              <button class="btn btn-ghost" :disabled="gutterLoading" @click="handleStaticGutter">
                <span v-if="gutterLoading" class="loading" />{{ gutterLoading ? '生成中...' : '生成静态 Gutter 几何' }}
              </button>
              <button class="btn btn-ghost" :disabled="animLoading" @click="handleAnimation">
                <span v-if="animLoading" class="loading" />{{ animLoading ? '生成中...' : '生成厚度衰减动画' }}
              </button>
            </div>
            <p class="m4-sample__hint">动画演示无需上传文件：直接点「生成静态 Gutter 几何」或「生成厚度衰减动画」即可播放（10 帧循环）。</p>
          </div>

          <div v-if="modelInfo" class="m4-info">
            <h3 class="m4-info__title">模型信息</h3>
            <div class="m4-info__grid">
              <div class="m4-kv"><span>顶点数</span><strong>{{ vertexCount }}</strong></div>
              <div class="m4-kv"><span>三角形数</span><strong>{{ triangleCount }}</strong></div>
              <div class="m4-kv"><span>温度点数量</span><strong>{{ tempPointCount }}</strong></div>
              <div class="m4-kv"><span>最低温度</span><strong>{{ minTemp.toFixed(1) }}°C</strong></div>
              <div class="m4-kv"><span>最高温度</span><strong>{{ maxTemp.toFixed(1) }}°C</strong></div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── 右：3D 可视化 ── -->
      <section class="pl-eqcol m4-right" aria-label="3D 可视化">
        <header class="m4-head pl-workbench-head">
          <span class="m4-chip m4-chip--brand"><i class="m4-dot" />3D 可视化</span>
          <span class="m4-chip" v-if="showColorBar">{{ minTemp.toFixed(1) }}°C → {{ maxTemp.toFixed(1) }}°C</span>
        </header>

        <div class="m4-body pl-eqfill">
          <div v-if="showRotationControls" class="m4-rot" aria-label="视角旋转">
            <div class="m4-rot__item" v-for="axis in ['X','Y','Z']" :key="axis">
              <div class="m4-rot__lab">
                <span class="m4-rot__axis">{{ axis }}</span>
                <span class="m4-rot__val">{{ axis === 'X' ? rotationX : (axis === 'Y' ? rotationY : rotationZ) }}°</span>
              </div>
              <input type="range" min="-180" max="180" step="5"
                :value="axis === 'X' ? rotationX : (axis === 'Y' ? rotationY : rotationZ)"
                @input="axis === 'X' ? onRotationX($event.target.valueAsNumber) : (axis === 'Y' ? onRotationY($event.target.valueAsNumber) : onRotationZ($event.target.valueAsNumber))">
            </div>
          </div>

          <div id="canvas-container" ref="canvasContainer" class="m4-canvas">
            <div v-if="!modelInfo" class="m4-canvas__hint">
              <p>请先加载结构拓扑文件和温度点文件</p>
              <p>然后点击「重建温度场」按钮</p>
            </div>
          </div>

          <div v-if="showControls" class="m4-actions">
            <button class="btn btn-ghost" @click="resetView">重置视角</button>
            <button class="btn btn-ghost" @click="toggleWireframe">切换线框</button>
            <button class="btn btn-ghost" @click="exportImage">导出图像</button>
          </div>

          <div v-if="showColorBar" class="m4-legend">
            <div class="color-bar" />
            <div class="color-labels"><span>{{ minTemp.toFixed(1) }}°C</span><span>{{ maxTemp.toFixed(1) }}°C</span></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThreeViewer } from '../composables/useThreeViewer'

const router = useRouter()
const { showControls, showRotationControls, showColorBar, modelInfo, vertexCount, triangleCount, tempPointCount, minTemp, maxTemp, rotationX, rotationY, rotationZ, statusMessage, statusType, initScene, loadSTL, loadStaticGutter, loadAnimation, setRotation, resetView, toggleWireframe, exportImage, cleanup } = useThreeViewer()

// 示例 STL（随前端发布的静态资源，见 public/iron_gutter_test.stl）
const SAMPLE_STL_PATH = '/iron_gutter_test.stl'

const canvasContainer = ref(null)
const stlFile = ref(null); const stlFileName = ref(''); const stlFileSize = ref('')
const tempFile = ref(null); const tempFileName = ref(''); const tempFileSize = ref('')
const canProcess = ref(false); const loading = ref(false); const gutterLoading = ref(false); const animLoading = ref(false)
const sampleLoading = ref(false)

onMounted(() => { if (canvasContainer.value) initScene(canvasContainer.value) })
onUnmounted(() => { cleanup() })

function onStlChange(e) { const file = e.target.files?.[0]; if (file) { stlFile.value = file; stlFileName.value = file.name; stlFileSize.value = (file.size/1024).toFixed(2)+' KB'; canProcess.value = true } }
function onTempChange(e) { const file = e.target.files?.[0]; if (file) { tempFile.value = file; tempFileName.value = file.name; tempFileSize.value = (file.size/1024).toFixed(2)+' KB' } }
function clearAll() { stlFile.value = null; stlFileName.value = ''; stlFileSize.value = ''; tempFile.value = null; tempFileName.value = ''; tempFileSize.value = ''; canProcess.value = false; showControls.value = false; showRotationControls.value = false; showColorBar.value = false; modelInfo.value = false; if (canvasContainer.value) initScene(canvasContainer.value) }
async function processStl() { if (!stlFile.value) return; loading.value = true; try { await loadSTL(stlFile.value, tempFile.value ?? undefined) } finally { loading.value = false } }

/** 一键示例：拉取内置示例 STL → 填充为普通 File → 走同一条「重建温度场」链路。 */
async function loadSampleStl() {
  if (sampleLoading.value) return
  sampleLoading.value = true
  try {
    const response = await fetch(SAMPLE_STL_PATH)
    if (!response.ok) throw new Error(`示例文件不可用（HTTP ${response.status}）`)
    const blob = await response.blob()
    const file = new File([blob], 'iron_gutter_test.stl', { type: 'model/stl' })
    stlFile.value = file
    stlFileName.value = file.name
    stlFileSize.value = `${(file.size / 1024).toFixed(2)} KB`
    canProcess.value = true
    await processStl()
  } catch (e) {
    statusMessage.value = `示例加载失败：${e.message || e}`
    statusType.value = 'error'
  } finally {
    sampleLoading.value = false
  }
}
async function handleStaticGutter() { gutterLoading.value = true; try { await loadStaticGutter() } finally { gutterLoading.value = false } }
async function handleAnimation() { animLoading.value = true; try { await loadAnimation() } finally { animLoading.value = false } }
function onRotationX(v) { setRotation(v, rotationY.value, rotationZ.value) }
function onRotationY(v) { setRotation(rotationX.value, v, rotationZ.value) }
function onRotationZ(v) { setRotation(rotationX.value, rotationY.value, v) }
</script>

<style scoped>
/* 与 性能预测(Model1) / 配方优化(Model2) 同一 pl-* 契约：等高两栏、紧凑控件、统一卡片语言 */
.m4-shell { margin: 0; }

/* 与 Model1 相同的两栏轨道（左 340–384px 定宽 + 右自适应），配合 .pl-eqcols 等高拉伸 */
.m4-layout {
  display: grid;
  grid-template-columns: minmax(340px, 384px) minmax(0, 1fr);
  gap: var(--pl-workbench-gap, 12px);
}
@media (max-width: 960px) {
  .m4-layout { grid-template-columns: minmax(0, 1fr); }
}

.m4-left {
  min-width: 0;
  gap: 8px;
  font-size: 12.5px;
  color: #2c4a63;
  background: #f3f7fb;
  border: 1px solid #e3ebf3;
  border-radius: 10px;
  padding: 10px;
}
.m4-right { min-width: 0; gap: var(--pl-workbench-col-gap, 10px); }

.m4-head {
  display: flex;
  align-items: center;
  gap: var(--pl-workbench-head-gap, 8px);
  flex-wrap: wrap;
  min-height: var(--pl-workbench-head-min, 26px);
}

.m4-body {
  display: flex;
  flex-direction: column;
  gap: var(--pl-workbench-col-gap, 10px);
  min-height: 0;
}

.m4-sec { display: flex; flex-direction: column; gap: var(--pl-workbench-col-gap, 10px); }

.m4-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #eef4fb;
  color: #41607f;
  border: 1px solid #dfe9f3;
  font-size: var(--pl-font-xs, 12px);
}
.m4-chip--brand {
  background: var(--asc-primary-soft, #eaf5fc);
  color: var(--asc-primary, #0869ad);
  border-color: color-mix(in srgb, var(--asc-primary) 18%, #fff);
}
.m4-chip--ok { background: #dcfce7; color: #166534; border-color: #86efac; }
.m4-dot { width: 7px; height: 7px; border-radius: 50%; background: #0aa3d8; display: inline-block; }

.m4-file {
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, var(--asc-primary) 30%, #dee2e6);
  border-radius: var(--pl-ctl-radius, 8px);
  background: #f8fbfd;
  font-size: var(--pl-font-sm, 13px);
  cursor: pointer;
}

/* 控件几何与 Model1 一致（高度 32px / 字号 13px） */
.m4-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.m4-actions .btn {
  height: var(--pl-ctl-h, 32px);
  min-height: var(--pl-ctl-h, 32px);
  padding: 0 14px;
  font-size: var(--pl-font-sm, 13px);
  line-height: 1;
  border-radius: var(--pl-ctl-radius, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.m4-actions .btn .loading { width: 12px; height: 12px; border-width: 2px; }

.m4-sample { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.m4-sample .btn {
  height: var(--pl-ctl-h, 32px);
  padding: 0 14px;
  font-size: var(--pl-font-sm, 13px);
  border-radius: var(--pl-ctl-radius, 8px);
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.m4-sample .btn .loading { width: 12px; height: 12px; border-width: 2px; }
.m4-sample__dl { color: var(--asc-primary, #0869ad); font-size: var(--pl-font-xs, 12px); text-decoration: none; }
.m4-sample__dl:hover { text-decoration: underline; }
.m4-sample__hint { margin: 6px 0 0; color: #78899a; font-size: var(--pl-font-xs, 12px); line-height: 1.6; }

.m4-info {
  border: 1px solid #e3ebf3;
  border-radius: var(--pl-card-radius, 12px);
  background: #f8fbfd;
  padding: 10px 12px;
}
.m4-info__title { margin: 0 0 8px; font-size: var(--pl-font-sm, 13px); color: #41607f; font-weight: 650; }
.m4-info__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px 12px; }
.m4-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: var(--pl-font-xs, 12px); color: #60758b; }
.m4-kv strong { color: var(--asc-primary, #0869ad); }

.m4-rot {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e3ebf3;
  border-radius: var(--pl-card-radius, 12px);
  background: #f8fbfd;
}
.m4-rot__lab { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
.m4-rot__axis { font-size: var(--pl-font-xs, 12px); font-weight: 700; color: #60758b; }
.m4-rot__val { font-size: var(--pl-font-xs, 12px); font-weight: 700; color: var(--asc-primary, #0869ad); }
.m4-rot input[type="range"] { width: 100%; accent-color: #0aa3d8; }

.m4-canvas {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
  border-radius: var(--pl-card-radius, 12px);
  overflow: hidden;
  background-color: #1a1a1a;
}
.m4-canvas__hint {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; color: #9aa8b7;
  font-size: var(--pl-font-sm, 13px); text-align: center; padding: 16px;
}

.m4-legend { display: flex; flex-direction: column; gap: 4px; }
</style>
