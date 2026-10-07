import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import materialVocab from '../backend_impl/src/services/materialVocabService.js'

/**
 * canonical 词表快照（data/material_vocab.json）的不变式测试。
 *
 * 这些断言保护的是"归束"这件事本身：
 *   · material_id 与 L3（material_map.json）逐条一致 —— 它同时是预测模型 one-hot 的下标，一旦漂移模型就错位；
 *   · 优化器 96 个原料名 100% 有处置（material / process_param / unresolved）；
 *   · 别名唯一、指向存在的物料；
 *   · L6/DB 交叉校验全部通过。
 * 生成器：backend_impl/scripts/build_material_vocab.py（快照缺失时先运行它）。
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = path.join(ROOT, 'data/material_vocab.json')
const L3 = path.join(ROOT, 'backend_impl/python/model_predict/FEATURE/outputs/material_map.json')
const L5 = path.join(ROOT, '_code/output/map_merged.json')

const hasSnapshot = fs.existsSync(SNAPSHOT)
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

test('词表快照存在且结构完整', { skip: !hasSnapshot && '尚未生成 data/material_vocab.json（运行 build_material_vocab.py）' }, () => {
  const snap = readJson(SNAPSHOT)
  for (const key of ['version', 'materials', 'aliases', 'external_refs', 'particle_sizes', 'property_vocab', 'base_coverage', 'queue', 'stats']) {
    assert.ok(key in snap, `快照缺少字段 ${key}`)
  }
})

test('material_id 与 L3 逐条一致（id 冻结，不得漂移）', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  const l3 = readJson(L3).materials
  assert.equal(snap.materials.length, l3.length, '物料条数应与 L3 相同')
  const byId = new Map(snap.materials.map((m) => [String(m.material_id), m.name]))
  for (const item of l3) {
    assert.equal(byId.get(String(item.material_id)), item.name, `material_id=${item.material_id} 名称必须与 L3 一致`)
  }
  assert.deepEqual(
    snap.materials.map((m) => m.material_id).sort((a, b) => a - b),
    Array.from({ length: l3.length }, (_, i) => i),
    'material_id 应为 0..N-1 连续',
  )
})

test('优化器 96 个原料名 100% 有处置', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  const names = new Set(readJson(L5).metadata.material_names)
  const refs = new Map(snap.external_refs.map((r) => [r.external_name, r]))
  assert.equal(snap.external_refs.length, names.size, '每个优化器原料名恰好一条 external_ref')
  for (const name of names) {
    const ref = refs.get(name)
    assert.ok(ref, `缺少 external_ref: ${name}`)
    assert.ok(['material', 'process_param', 'unresolved'].includes(ref.kind), `kind 非法: ${ref.kind}`)
    if (ref.kind === 'material') assert.ok(ref.material_id !== null, `${name} 为 material 时必须绑定 material_id`)
  }
  const processParams = snap.external_refs.filter((r) => r.kind === 'process_param').map((r) => r.external_name).sort()
  assert.deepEqual(processParams.sort(), ['加水量', '加胶量'].sort(), '工艺参数应恰好是加水量/加胶量且不入原料轴')
})

test('别名唯一且指向存在的物料', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  const ids = new Set(snap.materials.map((m) => m.material_id))
  const seen = new Set()
  for (const alias of snap.aliases) {
    assert.ok(ids.has(alias.material_id), `别名 ${alias.alias} 指向不存在的 material_id`)
    assert.ok(String(alias.alias_norm || '').length > 0, `别名 ${alias.alias} 归一化键为空`)
    assert.ok(Number(alias.confidence) > 0 && Number(alias.confidence) <= 1, `别名 ${alias.alias} 置信度越界`)
    const key = `${alias.alias}|${alias.particle_min}|${alias.particle_max}`
    assert.ok(!seen.has(key), `别名重复: ${key}`)
    seen.add(key)
  }
})

test('每个 base 都有覆盖率结论，且与 stats 自洽', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  assert.equal(snap.base_coverage.length, snap.materials.length)
  const counted = { unique: 0, multiple: 0, none: 0 }
  for (const row of snap.base_coverage) {
    assert.ok(row.status in counted, `非法状态 ${row.status}`)
    counted[row.status] += 1
    if (row.status === 'unique') assert.equal(row.targets.length, 1)
    if (row.status === 'multiple') assert.ok(row.targets.length > 1)
    if (row.status === 'none') assert.equal(row.targets.length, 0)
  }
  assert.deepEqual(snap.stats.base_status, counted, 'stats.base_status 应与 base_coverage 一致')
})

test('L6 与业务库交叉校验全部通过', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  for (const check of snap.checks) {
    assert.ok(check.passed, `校验未通过：${check.name} → ${JSON.stringify(check.detail)}`)
  }
})

test('人工队列每条都带 level/来源/建议', { skip: !hasSnapshot && '缺少快照' }, () => {
  const snap = readJson(SNAPSHOT)
  for (const row of snap.queue) {
    assert.ok(row.level, '队列项缺 level')
    assert.ok(row.external_name, '队列项缺 external_name')
    assert.ok(row.suggestion, '队列项缺 suggestion')
  }
  assert.equal(snap.stats.queue, snap.queue.length)
})

test('canonical 服务可解析别名与基准名，且拒绝工艺参数', { skip: !hasSnapshot && '缺少快照' }, () => {
  const { materials } = materialVocab.listMaterials()
  assert.equal(materials.length, 89)
  assert.ok(materials.some((m) => m.aliases.length > 1), '应存在带多个别名的物料')
  const byBrand = materialVocab.resolveName('97黑碳化硅粉（东祥97）')
  assert.ok(byBrand, '牌号别名应可解析')
  assert.equal(byBrand.material.name, '97黑碳化硅')
  const base = materialVocab.resolveName('棕刚玉')
  assert.equal(base?.matchedBy, 'base-name')
  assert.equal(materialVocab.resolveName('加水量'), null, '工艺参数不应解析为物料')
})

test('stats 汇报覆盖率与队列规模供 UI 使用', { skip: !hasSnapshot && '缺少快照' }, () => {
  const stats = materialVocab.stats()
  assert.ok(stats.materials === 89)
  assert.ok(Number.isInteger(stats.queue) && stats.queue > 0)
  assert.ok(stats.base_status && stats.base_status.unique > 0)
})
