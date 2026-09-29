/**
 * Vue 3 composable for Three.js 3D temperature field visualization.
 * Migrated from _code/vite-src/src/composables/useThreeViewer.ts.
 */
import { ref } from 'vue'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { reconstructModel4, generateStatic, generateAnimation } from '../api/models'
import { readFileAsArrayBuffer, readFileAsText, parseTempData } from '../utils/fileReader'
import { getTemperatureColor } from '../utils/temperatureColor'

// 场景参数（集中可调）：
//  GRID_DIVISIONS：地面网格等分数，10 → 40 让网格更密，便于观察尺度
//  VIEW_DISTANCE_FACTOR：相机到模型中心的距离系数，1.5 → 2.2 让模型在画布中显示更小
const GRID_SIZE = 10
const GRID_DIVISIONS = 40
const VIEW_DISTANCE_FACTOR = 2.2

function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return { r, g, b }
}

function createGeometryFromFrame(frame) {
  const geometry = new THREE.BufferGeometry()
  const vertices = []
  frame.faces.forEach(face => {
    face.forEach(index => {
      const vertex = frame.vertices[index]
      vertices.push(vertex[0], vertex[1], vertex[2])
    })
  })
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function useThreeViewer() {
  let scene = null, camera = null, renderer = null, mesh = null
  let animFrameId = null, animationInterval = null, isWireframe = false
  let container = null
  let animationFrames = [], currentAnimationFrame = 0
  let wheelHandler = null

  const showControls = ref(false)
  const showRotationControls = ref(false)
  const showColorBar = ref(false)
  const modelInfo = ref(false)
  const vertexCount = ref(0)
  const triangleCount = ref(0)
  const tempPointCount = ref(0)
  const minTemp = ref(0)
  const maxTemp = ref(1000)
  const rotationX = ref(0)
  const rotationY = ref(0)
  const rotationZ = ref(0)
  const statusMessage = ref('')
  const statusType = ref('')

  function showStatus(message, type) {
    statusMessage.value = message
    statusType.value = type
    setTimeout(() => { statusMessage.value = ''; statusType.value = '' }, 5000)
  }

  function updateRotationRefs() {
    if (mesh) {
      rotationX.value = Math.round((mesh.rotation.x * 180) / Math.PI)
      rotationY.value = Math.round((mesh.rotation.y * 180) / Math.PI)
      rotationZ.value = Math.round((mesh.rotation.z * 180) / Math.PI)
    }
  }

  function initScene(containerEl) {
    if (containerEl) container = containerEl
    if (!container) { console.warn('useThreeViewer: no container'); return }
    if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
    if (renderer) { renderer.dispose(); renderer = null }
    if (scene) {
      scene.traverse(obj => {
        const o = obj
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
          else o.material.dispose()
        }
      })
      scene = null
    }
    if (wheelHandler && container) { container.removeEventListener('wheel', wheelHandler); wheelHandler = null }
    container.innerHTML = ''

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.set(0, -3, 0)
    camera.lookAt(0, 0, 0)
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dl = new THREE.DirectionalLight(0xffffff, 0.8)
    dl.position.set(5, 5, 5)
    scene.add(dl)
    scene.add(new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x3a5875, 0x24384c))
    scene.add(new THREE.AxesHelper(5))

    wheelHandler = (e) => {
      e.preventDefault()
      if (!camera) return
      const dir = camera.position.y < 0 ? -1 : 1
      camera.position.y += e.deltaY * 0.01 * dir
      camera.position.y = Math.max(1, Math.min(60, Math.abs(camera.position.y))) * dir
    }
    container.addEventListener('wheel', wheelHandler)

    const animate = () => {
      animFrameId = requestAnimationFrame(animate)
      if (renderer && scene && camera) renderer.render(scene, camera)
    }
    animate()
  }

  function visualizeSTLModel(geometry, tempPoints, minT, maxT) {
    initScene()
    if (!scene || !camera) return
    geometry.computeVertexNormals()
    const colors = []
    const posAttr = geometry.getAttribute('position')
    if (!posAttr) return
    const box = new THREE.Box3().setFromBufferAttribute(posAttr)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    for (let i = 0; i < posAttr.count; i++) {
      if (tempPoints.length > 0) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i)
        let nearestTemp = minT, minDist = Infinity
        for (const pt of tempPoints) {
          const d = Math.sqrt((x - pt.x)**2 + (y - pt.y)**2 + (z - pt.z)**2)
          if (d < minDist) { minDist = d; nearestTemp = pt.temperature }
        }
        const c = getTemperatureColor(nearestTemp, minT, maxT)
        colors.push(c.r, c.g, c.b)
      } else {
        if (i % 3 === 0) {
          const [x1,y1,z1] = [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]
          const [x2,y2,z2] = [posAttr.getX(i+1), posAttr.getY(i+1), posAttr.getZ(i+1)]
          const [x3,y3,z3] = [posAttr.getX(i+2), posAttr.getY(i+2), posAttr.getZ(i+2)]
          const [cx,cy,cz] = [(x1+x2+x3)/3, (y1+y2+y3)/3, (z1+z2+z3)/3]
          const [nx,ny,nz] = [(cx-center.x)/(size.x/2||1), (cy-center.y)/(size.y/2||1), (cz-center.z)/(size.z/2||1)]
          const hue = (nx + ny + nz + 3) / 6
          const rgb = hslToRgb(hue, 0.7, 0.85)
          for (let j = 0; j < 3; j++) colors.push(rgb.r, rgb.g, rgb.b)
        }
      }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, side: THREE.DoubleSide })
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    mesh.position.sub(center)
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    const cz = Math.abs(maxDim / 2 / Math.tan(fov / 2))
    camera.position.set(0, -cz * VIEW_DISTANCE_FACTOR, 0)
    camera.lookAt(0, 0, 0)
    vertexCount.value = posAttr.count
    triangleCount.value = Math.round(posAttr.count / 3)
    tempPointCount.value = tempPoints.length
    minTemp.value = minT
    maxTemp.value = maxT
  }

  function visualizeFrame(frame) {
    if (!scene || !camera) { console.warn('scene not initialised'); return }
    const geometry = createGeometryFromFrame(frame)
    const colors = []
    const posAttr = geometry.getAttribute('position')
    if (!posAttr) return
    const box = new THREE.Box3().setFromBufferAttribute(posAttr)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    for (let i = 0; i < posAttr.count; i += 3) {
      const [x1,y1,z1] = [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]
      const [x2,y2,z2] = [posAttr.getX(i+1), posAttr.getY(i+1), posAttr.getZ(i+1)]
      const [x3,y3,z3] = [posAttr.getX(i+2), posAttr.getY(i+2), posAttr.getZ(i+2)]
      const [cx,cy,cz] = [(x1+x2+x3)/3, (y1+y2+y3)/3, (z1+z2+z3)/3]
      const [nx,ny,nz] = [(cx-center.x)/(size.x/2||1), (cy-center.y)/(size.y/2||1), (cz-center.z)/(size.z/2||1)]
      const hue = (nx + ny + nz + 3) / 6
      const rgb = hslToRgb(hue, 0.7, 0.85)
      for (let j = 0; j < 3; j++) colors.push(rgb.r, rgb.g, rgb.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, side: THREE.DoubleSide })
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose() }
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    mesh.position.sub(center)
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    const cz = Math.abs(maxDim / 2 / Math.tan(fov / 2))
    camera.position.set(0, -cz * 1.5, 0)
    camera.lookAt(0, 0, 0)
    updateRotationRefs()
  }

  function playAnimation(frames) {
    if (animationInterval) { clearInterval(animationInterval); animationInterval = null }
    animationFrames = frames; currentAnimationFrame = 0
    visualizeFrame(animationFrames[currentAnimationFrame])
    animationInterval = setInterval(() => {
      currentAnimationFrame++
      if (currentAnimationFrame >= animationFrames.length) currentAnimationFrame = 0
      visualizeFrame(animationFrames[currentAnimationFrame])
    }, 500)
  }

  async function loadSTL(stlFile, tempFile) {
    try {
      showStatus('正在加载STL文件...', 'success')
      const stlArrayBuffer = await readFileAsArrayBuffer(stlFile)
      showStatus('正在解析STL模型...', 'success')
      const loader = new STLLoader()
      const geometry = loader.parse(stlArrayBuffer)
      let tempPoints = [], minT = 20, maxT = 1000
      if (tempFile) {
        try {
          const tc = await readFileAsText(tempFile)
          tempPoints = parseTempData(tc, tempFile.name)
          if (tempPoints.length > 0) { minT = Math.min(...tempPoints.map(p => p.temperature)); maxT = Math.max(...tempPoints.map(p => p.temperature)) }
        } catch { console.log('温度文件加载失败') }
      }
      // 只回传字节数：重建在前端做，避免把整份 STL 转成数组回传（旧写法会产生 MB 级请求体）
      await reconstructModel4({ stlBytes: stlArrayBuffer.byteLength, tempPoints })
      showStatus('正在生成3D可视化...', 'success')
      visualizeSTLModel(geometry, tempPoints, minT, maxT)
      showControls.value = true; showRotationControls.value = true
      if (tempPoints.length > 0) showColorBar.value = true
      modelInfo.value = true
      updateRotationRefs()
      showStatus('3D模型加载成功！', 'success')
    } catch (e) {
      console.error('Error:', e)
      showStatus('处理失败: ' + (e.message || e), 'error')
    }
  }

  async function loadStaticGutter() {
    try {
      showStatus('正在生成静态Gutter几何...', 'success')
      const staticData = await generateStatic()
      showStatus('静态Gutter几何生成成功！', 'success')
      showControls.value = true; showRotationControls.value = true
      visualizeFrame({ vertices: staticData.vertices, faces: staticData.faces })
    } catch (e) {
      showStatus('生成静态Gutter失败: ' + (e.message || e), 'error')
    }
  }

  async function loadAnimation() {
    try {
      showStatus('正在生成动画帧...', 'success')
      const frames = await generateAnimation()
      showStatus(`成功生成 ${frames.length} 帧动画！`, 'success')
      showControls.value = true; showRotationControls.value = true
      playAnimation(frames)
    } catch (e) {
      showStatus('生成动画失败: ' + (e.message || e), 'error')
    }
  }

  function setRotation(x, y, z) {
    rotationX.value = x; rotationY.value = y; rotationZ.value = z
    if (mesh) mesh.rotation.set(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180)
  }

  function resetView() {
    if (mesh && camera) {
      mesh.rotation.set(0, 0, 0)
      const box = new THREE.Box3().setFromObject(mesh)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = camera.fov * (Math.PI / 180)
      const cz = Math.abs(maxDim / 2 / Math.tan(fov / 2))
      camera.position.set(0, -cz * VIEW_DISTANCE_FACTOR, 0)
      camera.lookAt(0, 0, 0)
      updateRotationRefs()
    }
  }

  function toggleWireframe() {
    if (mesh) { isWireframe = !isWireframe; mesh.material.wireframe = isWireframe }
  }

  function exportImage() {
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
      const link = document.createElement('a')
      link.download = 'temperature-field.png'
      link.href = renderer.domElement.toDataURL('image/png')
      link.click()
    }
  }

  function cleanup() {
    if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
    if (animationInterval) { clearInterval(animationInterval); animationInterval = null }
    if (wheelHandler && container) { container.removeEventListener('wheel', wheelHandler); wheelHandler = null }
    if (renderer) { renderer.dispose(); renderer = null }
    if (scene) {
      scene.traverse(obj => {
        const o = obj
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
          else o.material.dispose()
        }
      })
      scene = null
    }
    mesh = null; camera = null; isWireframe = false; animationFrames = []; currentAnimationFrame = 0
  }

  return {
    showControls, showRotationControls, showColorBar, modelInfo,
    vertexCount, triangleCount, tempPointCount, minTemp, maxTemp,
    rotationX, rotationY, rotationZ, statusMessage, statusType,
    initScene, loadSTL, visualizeSTLModel, visualizeFrame, playAnimation,
    setRotation, resetView, toggleWireframe, exportImage, cleanup,
    loadStaticGutter, loadAnimation,
  }
}