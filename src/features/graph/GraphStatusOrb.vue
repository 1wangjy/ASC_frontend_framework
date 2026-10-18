<template>
  <aside class="graph-orb" aria-label="图谱状态">
    <button
      type="button"
      class="graph-orb__ball"
      :class="{ 'graph-orb__ball--open': open }"
      :aria-expanded="open"
      aria-controls="graph-orb-panel"
      @click="toggle"
    >
      <span class="graph-orb__pulse" aria-hidden="true" />
      <span class="graph-orb__label">图谱<br />状态</span>
    </button>

    <transition name="graph-orb-drop">
      <div v-show="open" id="graph-orb-panel" class="graph-orb__panel">
        <div ref="canvasHost" class="graph-orb__canvas" aria-hidden="true" />
        <p class="graph-orb__caption">
          <span class="graph-orb__dot" aria-hidden="true" />
          节点与关联实时概览
        </p>
        <button type="button" class="graph-orb__link" @click="goManage">
          进入图谱演化管理
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </transition>
  </aside>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  // 当前问答使用的图谱项目；缺省时进入管理页的项目列表
  projectId: { type: String, default: '' }
})

const router = useRouter()
const open = ref(false)
const canvasHost = ref(null)

let THREE = null
let renderer = null
let scene = null
let camera = null
let frame = 0
let resizeObserver = null
let activeNode = null
let clock = null
let disposed = false

// 边：单位圆周上的点两两相连（弦），以弧线绘制出 3D 纵深感
const NODE_COUNT = 14
const EDGES = (() => {
  const list = []
  for (let i = 0; i < NODE_COUNT; i += 1) {
    for (const step of [1, 2, 4]) {
      const j = (i + step) % NODE_COUNT
      if (i < j) list.push([i, j])
    }
  }
  return list
})()

function nodePosition(index) {
  const angle = (index / NODE_COUNT) * Math.PI * 2
  return new THREE.Vector3(
    Math.cos(angle),
    Math.sin(angle),
    0.18 * Math.sin(index * 1.7) + 0.08 * Math.cos(index * 0.9)
  )
}

function discTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(18,103,168,1)')
  gradient.addColorStop(0.35, 'rgba(48,150,214,0.95)')
  gradient.addColorStop(1, 'rgba(48,150,214,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function buildScene() {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 20)
  camera.position.set(0, 0, 4.1)

  const group = new THREE.Group()
  scene.add(group)

  const positions = Array.from({ length: NODE_COUNT }, (_value, index) => nodePosition(index))

  // 节点：带辉光的点精灵
  const geometry = new THREE.BufferGeometry()
  const coords = new Float32Array(NODE_COUNT * 3)
  positions.forEach((position, index) => {
    coords[index * 3] = position.x
    coords[index * 3 + 1] = position.y
    coords[index * 3 + 2] = position.z
  })
  geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3))

  const sprite = discTexture()
  const pointsMaterial = new THREE.PointsMaterial({
    size: 0.2,
    map: sprite,
    transparent: true,
    depthWrite: false,
    color: new THREE.Color('#1f7fc4')
  })
  group.add(new THREE.Points(geometry, pointsMaterial))

  // 边：圆周弦 + 向外的弧度，形成点云网络
  const edgeRecords = []
  EDGES.forEach(([from, to], index) => {
    const start = positions[from]
    const end = positions[to]
    const middle = start.clone().add(end).multiplyScalar(0.5)
    const lift = 0.35 + 0.22 * Math.sin(index * 1.3)
    middle.z += lift
    middle.multiplyScalar(1.04)
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end)
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24))
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color('#7aa9c9'),
      transparent: true,
      opacity: 0.5
    })
    group.add(new THREE.Line(curveGeometry, material))
    edgeRecords.push({ curve, material, baseColor: new THREE.Color('#7aa9c9') })
  })

  // 激活脉冲：沿某条边传播的小光点
  activeNode = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#00a3e0'), transparent: true, opacity: 0 })
  )
  group.add(activeNode)

  clock = new THREE.Clock()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasHost.value)
  animate()

  function resize() {
    if (!renderer || !canvasHost.value) return
    const width = canvasHost.value.clientWidth || 240
    const height = canvasHost.value.clientHeight || 210
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  // 静态结构 + 动态效果：缓慢旋转；周期性某条边「激活并传播」
  let lastActivation = 0
  let activeEdge = null
  let activeStarted = 0
  const ACTIVATION_MS = 1100
  const GAP_MS = 520

  function animate() {
    if (disposed) return
    frame = requestAnimationFrame(animate)
    const elapsed = clock.getElapsedTime()
    const now = performance.now()

    group.rotation.y = Math.sin(elapsed * 0.24) * 0.5
    group.rotation.x = Math.sin(elapsed * 0.18 + 0.8) * 0.16

    if (!activeEdge && now - lastActivation > GAP_MS) {
      activeEdge = edgeRecords[Math.floor(Math.random() * edgeRecords.length)]
      activeStarted = now
      activeEdge.material.color.copy(new THREE.Color('#0b8fd6'))
      activeEdge.material.opacity = 0.95
    }

    edgeRecords.forEach((edge) => {
      if (edge !== activeEdge) {
        edge.material.opacity = 0.22 + 0.08 * Math.sin(elapsed * 1.6 + edge.curve.v0.x * 2)
        edge.material.color.copy(edge.baseColor)
      }
    })

    if (activeEdge) {
      const progress = Math.min(1, (now - activeStarted) / ACTIVATION_MS)
      const point = activeEdge.curve.getPoint(progress)
      activeNode.position.copy(point)
      activeNode.material.opacity = Math.sin(progress * Math.PI) * 1.4
      activeEdge.material.opacity = 0.35 + 0.6 * Math.sin(progress * Math.PI)
      if (progress >= 1) {
        activeEdge.material.opacity = 0.5
        activeEdge.material.color.copy(activeEdge.baseColor)
        activeNode.material.opacity = 0
        activeEdge = null
        lastActivation = now
      }
    }

    renderer.render(scene, camera)
  }
}

function start() {
  if (renderer || !canvasHost.value || disposed) return
  import('three')
    .then((module) => {
      if (disposed) return
      THREE = module
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      canvasHost.value.appendChild(renderer.domElement)
      buildScene()
    })
    .catch(() => {
      // WebGL 不可用时保持面板结构，仅无点云（不阻塞页面）
    })
}

function stop() {
  dispose()
  if (canvasHost.value) canvasHost.value.innerHTML = ''
}

function dispose() {
  disposed = true
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = null
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  scene = null
  camera = null
  clock = null
  activeNode = null
  THREE = null
}

function toggle() {
  open.value = !open.value
}

function goManage() {
  const query = props.projectId ? { params: { projectId: props.projectId } } : {}
  router.push({ name: 'Process', ...query })
}

// 展开时创建场景，收起时释放 GPU 资源（点云默认隐藏）
watch(open, (value) => {
  if (value) {
    disposed = false
    requestAnimationFrame(start)
  } else {
    stop()
  }
})

onMounted(() => {
  // 首屏不创建 WebGL 上下文；用户点击后按需加载。
})

onBeforeUnmount(dispose)
</script>

<style scoped>
.graph-orb {
  /* 位于舞台左侧空白列的中心，随主窗口顶部对齐（in-flow，由 .qa-stage__left 定位） */
  position: relative;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.graph-orb__ball {
  position: relative;
  width: 62px;
  height: 62px;
  border: 1px solid rgba(120, 210, 255, 0.55);
  border-radius: 50%;
  color: #eaf8ff;
  background:
    radial-gradient(circle at 32% 28%, rgba(160, 235, 255, 0.95), rgba(38, 118, 190, 0.9) 46%, rgba(6, 46, 84, 0.96) 100%);
  box-shadow:
    0 10px 26px rgba(7, 59, 102, 0.32),
    inset 0 0 16px rgba(160, 235, 255, 0.45);
  cursor: pointer;
  transition: transform 0.24s ease, box-shadow 0.24s ease;
}

.graph-orb__ball:hover,
.graph-orb__ball--open {
  transform: translateY(-1px) scale(1.04);
  box-shadow:
    0 14px 32px rgba(7, 59, 102, 0.4),
    inset 0 0 22px rgba(160, 235, 255, 0.6);
}

.graph-orb__pulse {
  position: absolute;
  inset: -6px;
  border: 1px solid rgba(120, 210, 255, 0.45);
  border-radius: 50%;
  animation: graph-orb-pulse 2.8s ease-out infinite;
}

.graph-orb__label {
  position: relative;
  display: block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.32;
}

@keyframes graph-orb-pulse {
  0% { transform: scale(0.92); opacity: 0.75; }
  70% { transform: scale(1.16); opacity: 0; }
  100% { transform: scale(1.16); opacity: 0; }
}

.graph-orb__panel {
  position: absolute;
  top: calc(100% + 22px);
  /* 从左缘展开（与悬浮球左缘对齐），避免增宽后压到左侧导航栏；标题行在面板内居中 */
  left: 0;
  z-index: 41;
  width: 317px;
  padding: 12px 14px 14px;
  border: 1px solid rgba(96, 158, 204, 0.4);
  border-radius: 16px;
  background: linear-gradient(170deg, rgba(255, 255, 255, 0.97), rgba(238, 247, 254, 0.96));
  box-shadow: 0 18px 42px rgba(23, 68, 104, 0.16);
  backdrop-filter: blur(10px);
  color: #173a56;
}

.graph-orb__canvas {
  width: 100%;
  height: 252px;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 52%, rgba(196, 228, 250, 0.55), rgba(240, 248, 254, 0.35) 70%);
}

.graph-orb__canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.graph-orb__caption {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 8px 2px 6px;
  text-align: center;
  font-size: 11px;
  color: #4a7191;
}

.graph-orb__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1fa5e0;
  box-shadow: 0 0 8px rgba(31, 165, 224, 0.45);
}

.graph-orb__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 0;
  border: 0;
  border-top: 1px solid rgba(96, 158, 204, 0.24);
  width: 100%;
  background: transparent;
  color: #0b6fb8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.graph-orb__link:hover {
  color: #055a97;
}

.graph-orb-drop-enter-active,
.graph-orb-drop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top left;
}

.graph-orb-drop-enter-from,
.graph-orb-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

</style>
