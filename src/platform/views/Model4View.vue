<template>
  <div class="platform-page">
    <div class="page-header"><h1>仿真重建</h1><a class="back-btn" @click="router.push('/platform/models')">← 返回模型入口</a></div>
    <div class="main-content">
      <div class="left-panel">
        <h2>数据加载</h2>
        <div v-if="statusMessage" class="status-message" :class="statusType">{{ statusMessage }}</div>
        <div class="form-group"><label>结构拓扑文件 (.stl, .obj)</label><input type="file" class="file-input" accept=".stl,.obj" @change="onStlChange"><div v-if="stlFileName" class="file-info">已选择: {{ stlFileName }} ({{ stlFileSize }})</div></div>
        <div class="form-group"><label>温度点文件 (.csv, .json)</label><input type="file" class="file-input" accept=".csv,.json" @change="onTempChange"><div v-if="tempFileName" class="file-info">已选择: {{ tempFileName }} ({{ tempFileSize }})</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" :disabled="!canProcess || loading" @click="processStl"><span v-if="loading" class="loading" />{{ loading ? '处理中...' : '重建温度场' }}</button>
          <button class="btn btn-secondary" @click="clearAll">清除</button>
          <button class="btn" :disabled="gutterLoading" @click="handleStaticGutter"><span v-if="gutterLoading" class="loading" />{{ gutterLoading ? '生成中...' : '生成静态Gutter几何' }}</button>
          <button class="btn" :disabled="animLoading" @click="handleAnimation"><span v-if="animLoading" class="loading" />{{ animLoading ? '生成中...' : '生成厚度衰减动画' }}</button>
        </div>
        <div v-if="modelInfo" class="info-panel">
          <h3>模型信息</h3>
          <div class="info-item"><span>顶点数</span><span>{{ vertexCount }}</span></div>
          <div class="info-item"><span>三角形数</span><span>{{ triangleCount }}</span></div>
          <div class="info-item"><span>温度点数量</span><span>{{ tempPointCount }}</span></div>
          <div class="info-item"><span>最低温度</span><span>{{ minTemp.toFixed(1) }}°C</span></div>
          <div class="info-item"><span>最高温度</span><span>{{ maxTemp.toFixed(1) }}°C</span></div>
        </div>
      </div>
      <div class="right-panel">
        <h2>3D可视化</h2>
        <div v-if="showRotationControls" class="rotation-controls">
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <div style="flex:1;min-width:120px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:var(--text-secondary)">X</span><span style="font-size:12px;color:var(--text-primary);font-weight:600">{{ rotationX }}°</span></div><input type="range" :min="-180" :max="180" :value="rotationX" step="5" style="width:100%;cursor:pointer;height:6px" @input="onRotationX($event.target.valueAsNumber)"></div>
            <div style="flex:1;min-width:120px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:var(--text-secondary)">Y</span><span style="font-size:12px;color:var(--text-primary);font-weight:600">{{ rotationY }}°</span></div><input type="range" :min="-180" :max="180" :value="rotationY" step="5" style="width:100%;cursor:pointer;height:6px" @input="onRotationY($event.target.valueAsNumber)"></div>
            <div style="flex:1;min-width:120px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:var(--text-secondary)">Z</span><span style="font-size:12px;color:var(--text-primary);font-weight:600">{{ rotationZ }}°</span></div><input type="range" :min="-180" :max="180" :value="rotationZ" step="5" style="width:100%;cursor:pointer;height:6px" @input="onRotationZ($event.target.valueAsNumber)"></div>
          </div>
        </div>
        <div id="canvas-container" ref="canvasContainer"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;text-align:center"><p style="font-size:16px;margin-bottom:10px">请先加载结构拓扑文件和温度点文件</p><p style="font-size:14px">然后点击"重建温度场"按钮</p></div></div>
        <div v-if="showControls" class="controls"><button class="btn btn-secondary" @click="resetView">重置视角</button><button class="btn btn-secondary" @click="toggleWireframe">切换线框</button><button class="btn btn-secondary" @click="exportImage">导出图像</button></div>
        <div v-if="showColorBar" class="color-bar" /><div v-if="showColorBar" class="color-labels"><span>{{ minTemp.toFixed(1) }}°C</span><span>{{ maxTemp.toFixed(1) }}°C</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThreeViewer } from '../composables/useThreeViewer'

const router = useRouter()
const { showControls, showRotationControls, showColorBar, modelInfo, vertexCount, triangleCount, tempPointCount, minTemp, maxTemp, rotationX, rotationY, rotationZ, statusMessage, statusType, initScene, loadSTL, loadStaticGutter, loadAnimation, setRotation, resetView, toggleWireframe, exportImage, cleanup } = useThreeViewer()

const canvasContainer = ref(null)
const stlFile = ref(null); const stlFileName = ref(''); const stlFileSize = ref('')
const tempFile = ref(null); const tempFileName = ref(''); const tempFileSize = ref('')
const canProcess = ref(false); const loading = ref(false); const gutterLoading = ref(false); const animLoading = ref(false)

onMounted(() => { if (canvasContainer.value) initScene(canvasContainer.value) })
onUnmounted(() => { cleanup() })

function onStlChange(e) { const file = e.target.files?.[0]; if (file) { stlFile.value = file; stlFileName.value = file.name; stlFileSize.value = (file.size/1024).toFixed(2)+' KB'; canProcess.value = true } }
function onTempChange(e) { const file = e.target.files?.[0]; if (file) { tempFile.value = file; tempFileName.value = file.name; tempFileSize.value = (file.size/1024).toFixed(2)+' KB' } }
function clearAll() { stlFile.value = null; stlFileName.value = ''; stlFileSize.value = ''; tempFile.value = null; tempFileName.value = ''; tempFileSize.value = ''; canProcess.value = false; showControls.value = false; showRotationControls.value = false; showColorBar.value = false; modelInfo.value = false; if (canvasContainer.value) initScene(canvasContainer.value) }
async function processStl() { if (!stlFile.value) return; loading.value = true; try { await loadSTL(stlFile.value, tempFile.value ?? undefined) } finally { loading.value = false } }
async function handleStaticGutter() { gutterLoading.value = true; try { await loadStaticGutter() } finally { gutterLoading.value = false } }
async function handleAnimation() { animLoading.value = true; try { await loadAnimation() } finally { animLoading.value = false } }
function onRotationX(v) { setRotation(v, rotationY.value, rotationZ.value) }
function onRotationY(v) { setRotation(rotationX.value, v, rotationZ.value) }
function onRotationZ(v) { setRotation(rotationX.value, rotationY.value, v) }
</script>