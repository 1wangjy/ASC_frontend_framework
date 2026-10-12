import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import registry from '../backend_impl/src/config/acceptanceChecks.js'

/**
 * 「模型入口 → 验收测试[2026]」的注册表与入口不变式。
 *
 * 与既有的陈旧断言（tests/ascLabExperience.test.js 的路由全集 deepEqual）不同，这里只断言
 * **本次功能自身的契约**：验收项/检查项结构、材料覆盖、验收页与侧边栏入口已注册。
 * 运行这些检查本身请用页面（或 POST /api/acceptance/run），不在单测里跑重型核验。
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('注册表：三类分组齐全，且包含合同 4 项与额外工作项', () => {
  const categories = registry.groupByCategory()
  assert.deepEqual(categories.map((c) => c.key), ['contract', 'onsite', 'extra'])
  const titles = categories.flatMap((c) => c.items.map((i) => i.title))
  assert.ok(titles.some((t) => t.includes('数据库 V1.0')), '缺数据库项')
  assert.ok(titles.some((t) => t.includes('性能预测模型 V1.0')), '缺性能预测项')
  assert.ok(titles.some((t) => t.includes('配方优化模型 V1.0')), '缺配方优化项')
  assert.ok(titles.some((t) => t.includes('发明专利')), '缺发明专利项')
  assert.ok(categories.find((c) => c.key === 'extra').items.length >= 4, '额外工作项不足')
})

test('注册表：检查项 id 全局唯一且每个都有可执行 kind', () => {
  const checks = registry.items.flatMap((i) => i.checks)
  const ids = checks.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length, '存在重复的检查 id')
  const valid = new Set(['sqlite', 'json', 'json-stat', 'deviation-csv', 'opt-cases', 'kg-stats',
    'file', 'http', 'http-json', 'http-predict', 'command', 'platform-structure', 'manual'])
  for (const check of checks) {
    assert.ok(valid.has(check.kind), `未知 kind: ${check.id} → ${check.kind}`)
    assert.ok(check.label, `缺少 label: ${check.id}`)
  }
  assert.ok(checks.some((c) => c.kind === 'manual'), '应保留人工确认项（如专利受理）')
})

test('注册表：11 份交付材料（模板 01–11）全部登记', () => {
  const docs = registry.DOCUMENTS
  assert.equal(docs.length, 11)
  const numbered = docs.map(([rel]) => (/^(\d{2})_/.exec(path.basename(rel)) || [])[1]).sort()
  assert.deepEqual(numbered, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'])
})

test('注册表：合同关键阈值与验收材料口径一致', () => {
  const checks = registry.items.flatMap((i) => i.checks)
  const find = (id) => checks.find((c) => c.id === id)
  assert.equal(find('db-v1-recipes')?.expect, 300, '数据库阈值应为合同原文的 ≥300 条')
  assert.equal(find('pred-deploy')?.assert?.every?.value, 0.85, '部署模型留出 R² 阈值应为 0.85')
  assert.deepEqual(find('opt-cases')?.file?.endsWith('优化案例.json'), true)
  assert.equal(find('patent-manual')?.kind, 'manual')
})

test('入口：验收页路由与侧边栏节点均已注册', () => {
  const routes = read('src/config/ascRoutes.js')
  assert.match(routes, /name:\s*'Acceptance2026'/, '路由未注册')
  assert.match(routes, /path:\s*'\/platform\/acceptance'/, '路由路径不符')
  const nav = read('src/features/navigation/appNavigation.js')
  assert.match(nav, /验收测试\[2026\]/, '侧边栏缺少验收入口')
  assert.match(nav, /\/platform\/acceptance/, '侧边栏入口路径不符')
  // 侧边栏一级项保持不变（新增的是「模型入口」下的子项）
  const topLabels = [...nav.matchAll(/^\s{2}\{\s*label:\s*'([^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(topLabels, ['首页', '问题研究', '数据平台', '模型入口'])
})

test('入口：模型入口页提供验收页链接且不改动轮播模型数', () => {
  const home = read('src/platform/views/HomeView.vue')
  assert.match(home, /\/platform\/acceptance/, '模型入口页缺少验收入口')
  const models = [...home.matchAll(/index:\s*'(\d\d)'/g)].map((m) => m[1])
  assert.deepEqual(models, ['01', '02', '03', '04'], '轮播仍应为四个模型')
})
