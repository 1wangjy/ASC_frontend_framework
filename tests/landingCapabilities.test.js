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

test('cards state an explicit implementation status', () => {
  for (const cap of landingCapabilities) {
    assert.ok(['已上线', '建设中'].includes(cap.status), `${cap.title} 状态非法：${cap.status}`)
  }
  assert.equal(
    landingCapabilities.filter((c) => c.status === '建设中').length,
    1,
    '当前只有「服役预测」在建设中',
  )
})

test('each card carries icon, description and at least two concrete facts', () => {
  for (const cap of landingCapabilities) {
    assert.ok(cap.icon && cap.title && cap.desc, `${cap.title} 缺少 icon/title/desc`)
    assert.ok(Array.isArray(cap.facts) && cap.facts.length >= 2, `${cap.title} 事实条目不足`)
    for (const fact of cap.facts) assert.ok(fact.trim().length > 0, `${cap.title} 存在空事实`)
  }
})

test('capability coverage matches the real modules (literature, data, graph, research, models, report chain)', () => {
  const titles = landingCapabilities.map((c) => c.title)
  for (const expected of ['文献库管理', '数据平台 · 解析与管理', '知识图谱与报告', '问题研究', '性能预测', '配方优化', '仿真重建', '服役预测']) {
    assert.ok(titles.includes(expected), `缺少能力卡片：${expected}`)
  }
  assert.equal(new Set(titles).size, titles.length, '卡片标题重复')
})
