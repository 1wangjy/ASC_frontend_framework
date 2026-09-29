import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repo = new URL('../', import.meta.url)
const p = (rel) => fileURLToPath(new URL(rel, repo))

const SAMPLE_STL = p('public/iron_gutter_test.stl')
const GENERATOR = p('backend_impl/python/stl_generator.py')
const VIEWER = p('src/platform/composables/useThreeViewer.js')

test('示例 STL 随前端发布且是有效 ASCII STL', () => {
  assert.ok(existsSync(SAMPLE_STL), 'public/iron_gutter_test.stl 缺失（示例加载会 404）')
  assert.ok(statSync(SAMPLE_STL).size > 1000, '示例 STL 体积异常')
  const head = readFileSync(SAMPLE_STL, 'utf8').slice(0, 200)
  assert.match(head, /^solid\s/, 'ASCII STL 应以 solid 开头')
  const text = readFileSync(SAMPLE_STL, 'utf8')
  assert.ok((text.match(/facet normal/g) || []).length > 1000, '三角面数量异常')
  assert.match(text.trimEnd(), /endsolid\s+\S+\s*$/, 'ASCII STL 应以 endsolid <name> 结尾')
})

test('后端 STL 生成器存在，并能产出 static / animation 两种 JSON', () => {
  assert.ok(existsSync(GENERATOR), 'backend_impl/python/stl_generator.py 缺失（两个演示接口会 500）')

  // 动画 JSON 约 1.1MB，需放宽 maxBuffer（默认 1MB 会 ENOBUFS）
  const runGenerator = (mode) => JSON.parse(execFileSync('python3', [GENERATOR, mode], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }))

  const staticOut = runGenerator('static')
  assert.equal(staticOut.success, true)
  assert.equal(staticOut.type, 'static')
  assert.ok(staticOut.data.vertices.length > 100, '静态几何顶点过少')
  assert.ok(staticOut.data.faces.length > 100, '静态几何面数过少')

  const animOut = runGenerator('animation')
  assert.equal(animOut.success, true)
  assert.equal(animOut.num_steps, 10, '动画帧数应为 10')
  assert.equal(animOut.frames.length, 10)
  const first = animOut.frames[0]
  assert.ok(first.vertices.length > 100 && first.faces.length > 100, '帧几何不完整')
  assert.ok('thickness_matrix' in first, '帧应带 thickness_matrix')
})

test('场景参数：网格已加密、视图已缩小（防止回退到 10 分格 / 1.5 倍距离）', () => {
  const src = readFileSync(VIEWER, 'utf8')
  const divisions = src.match(/const GRID_DIVISIONS = (\d+)/)
  const distance = src.match(/const VIEW_DISTANCE_FACTOR = ([\d.]+)/)
  assert.ok(divisions, '缺少 GRID_DIVISIONS 常量')
  assert.ok(distance, '缺少 VIEW_DISTANCE_FACTOR 常量')
  assert.ok(Number(divisions[1]) >= 30, `网格过疏：GRID_DIVISIONS=${divisions[1]}`)
  assert.ok(Number(distance[1]) > 1.5, `视图未缩小：VIEW_DISTANCE_FACTOR=${distance[1]}`)
  assert.match(src, /new THREE\.GridHelper\(GRID_SIZE, GRID_DIVISIONS/, 'GridHelper 应使用参数化分格')
})

test('重建接口不再回传整份 STL（避免 MB 级请求体触发 body 上限）', () => {
  const viewer = readFileSync(VIEWER, 'utf8')
  assert.ok(!/stlContent:\s*Array\.from\(new Uint8Array/.test(viewer), '客户端不应把 STL 转成数组回传')
  assert.match(viewer, /reconstructModel4\(\{ stlBytes: stlArrayBuffer\.byteLength/, '应按 stlBytes 上报')
})
