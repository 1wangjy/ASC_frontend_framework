import test from 'node:test'
import assert from 'node:assert/strict'

import { landingCapabilities } from '../src/config/landingCapabilities.js'
import { ascRouteDefinitions } from '../src/config/ascRoutes.js'

/** 静态可达路径：可选参数段（:x?）可省略，必填参数段的路由不算静态入口。 */
function staticPath(path) {
  const kept = []
  for (const seg of String(path || '').split('/').filter(Boolean)) {
    if (seg.startsWith(':')) {
      if (seg.endsWith('?')) continue
      return null
    }
    kept.push(seg)
  }
  return `/${kept.join('/')}`
}

const concretePaths = new Set(
  ascRouteDefinitions.map((route) => staticPath(route.path)).filter(Boolean),
)

test('every capability card links to a real route (no dead entries on the landing page)', () => {
  for (const cap of landingCapabilities) {
    const path = cap.route?.path
    assert.ok(path, `${cap.title} 缺少 route.path`)
    const base = path.split('?')[0]
    assert.ok(
      concretePaths.has(base),
      `${cap.title} 指向不存在的路由：${base}（现有：${[...concretePaths].join(', ')}）`,
    )
  }
})

test('cards stay concise: one short hint, no bullet dumps', () => {
  for (const cap of landingCapabilities) {
    assert.equal(cap.facts, undefined, `${cap.title} 不应再带要点列表（首页要保持简洁）`)
    assert.ok(typeof cap.hint === 'string' && cap.hint.trim(), `${cap.title} 缺少 hint`)
    assert.ok(cap.hint.length <= 24, `${cap.title} 的 hint 过长（${cap.hint.length} 字）：${cap.hint}`)
    assert.ok(!cap.hint.includes('\n'), `${cap.title} 的 hint 不应换行`)
  }
})

test('cards state an explicit implementation status and only 服役预测 is pending', () => {
  for (const cap of landingCapabilities) {
    assert.ok(['已上线', '建设中'].includes(cap.status), `${cap.title} 状态非法：${cap.status}`)
  }
  const wip = landingCapabilities.filter((c) => c.status === '建设中').map((c) => c.title)
  assert.deepEqual(wip, ['服役预测'])
})

test('capability coverage matches the real modules', () => {
  const titles = landingCapabilities.map((c) => c.title)
  assert.deepEqual(titles, [
    '文献库管理', '数据平台', '知识图谱', '问题研究',
    '性能预测', '配方优化', '仿真重建', '服役预测',
  ])
  for (const cap of landingCapabilities) assert.ok(cap.icon, `${cap.title} 缺少 icon`)
})
