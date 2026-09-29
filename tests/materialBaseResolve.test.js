import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// 后端服务与其依赖（sqlite3）都在 backend_impl 下：以该目录为基准建 require，避免 ESM/依赖解析冲突
const here = path.dirname(fileURLToPath(import.meta.url))
const backendRequire = createRequire(path.join(here, '..', 'backend_impl', 'package.json'))
const sqlite3 = backendRequire('sqlite3').verbose()
const svc = backendRequire('./src/services/materialBaseService.js')
const SEED = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'material_base_map.json'), 'utf8'))

function withRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-mbase-resolve-'))
  const db = new sqlite3.Database(path.join(dir, 'database.db'))
  svc.setDb(db)
  svc.setJsonPath(path.join(dir, 'material_base_map.json'))
  return { db }
}

function close(db) {
  return new Promise((resolve) => db.close(() => resolve()))
}

const SEED_PATH = path.join(here, '..', 'data', 'material_base_map.json')

/** 从真实种子快照灌入（导出仍写临时路径，避免污染仓库 data/）。 */
// 测试隔离：只用种子 bases，不带运行期规则（线上新增的规则会写回 data/material_base_map.json）
function basesOnlySeedFile() {
  const snapshot = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'))
  const target = path.join(path.dirname(SEED_PATH), `seed-bases-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(target, JSON.stringify({ version: snapshot.version, bases: snapshot.bases, rules: [] }), 'utf8')
  return target
}

async function seedAll() {
  await svc.ensureMaterialBaseSchema(svc.requireDb())
  const boot = await svc.bootstrapFromJson({ filePath: basesOnlySeedFile() })
  return boot
}

test('解析顺序：精确 → 别名 → 归一化 → 规则', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const target = (await svc.listBases({ keyword: '棕刚玉' }))[0]
    assert.ok(target, '种子里应有棕刚玉')
    await svc.upsertBase({ base_name: target.base_name, aliases: ['试验别名刚玉甲'] })
    const carbon = (await svc.listBases({ keyword: '97黑碳化硅' }))[0]
    assert.ok(carbon, '种子里应有 97黑碳化硅')

    const exact = await svc.resolveMaterialBase(target.base_name)
    assert.equal(exact.via, 'exact')
    assert.equal(exact.base.material_id, target.material_id)

    const alias = await svc.resolveMaterialBase('试验别名刚玉甲')
    assert.equal(alias.via, 'alias')
    assert.equal(alias.base.material_id, target.material_id)

    const normalized = await svc.resolveMaterialBase('９７黑碳化硅') // 全角数字
    assert.equal(normalized.via, 'normalize')
    assert.equal(normalized.base.material_id, carbon.material_id)

    await svc.addRule({ kind: 'alias', pattern: '试验规则刚玉乙', target_base_id: target.base_id, priority: 10 })
    const viaRule = await svc.resolveMaterialBase('试验规则刚玉乙')
    assert.equal(viaRule.via, 'rule')
    assert.equal(viaRule.base.material_id, target.material_id)
  } finally {
    await close(db)
  }
})

test('拆解：剥离规格/形态/牌号后按基体名命中', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const withSpec = await svc.resolveMaterialBase('325目棕刚玉')
    assert.equal(withSpec.via, 'decompose')
    assert.equal(withSpec.decomposed.matrix, '棕刚玉')
    assert.equal(withSpec.decomposed.spec, '325目')

    const withForm = await svc.resolveMaterialBase('棕刚玉细粉')
    assert.equal(withForm.via, 'decompose')
    assert.equal(withForm.decomposed.form, '细粉')
    assert.equal(withForm.decomposed.matrix, '棕刚玉')

    const d = svc.decomposeMaterialName('97黑碳化硅')
    assert.equal(d.matrix, '黑碳化硅')
    assert.equal(d.brand, '97')
    assert.equal(d.matrix, '黑碳化硅')
  } finally {
    await close(db)
  }
})

test('未命中：不臆造，给出候选与可一键新建的规则模板', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const r = await svc.resolveMaterialBase('高铝铝土')
    assert.equal(r.resolved, false, '高铝铝土 不应被自动归到「高铝」（剩余「铝土」无法解释）')
    assert.equal(r.base, null)
    assert.ok(r.suggestions.length >= 1, '应给出候选 base 名')
    assert.ok(r.suggestedRules.some((x) => x.kind === 'alias' && x.pattern === '高铝铝土'))
    assert.ok(r.suggestedRules.every((x) => typeof x.priority === 'number'))
  } finally {
    await close(db)
  }
})

test('规则可被禁用：禁用后同一名称回到未命中', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const target = (await svc.listBases({ keyword: '棕刚玉' }))[0]
    const rule = await svc.addRule({ kind: 'alias', pattern: '高铝铝土', target_base_id: target.base_id })
    assert.equal((await svc.resolveMaterialBase('高铝铝土')).resolved, true)
    await svc.setRuleEnabled(rule.rule_id, false)
    assert.equal((await svc.resolveMaterialBase('高铝铝土')).resolved, false)
  } finally {
    await close(db)
  }
})

test('种子全集可被解析器完全认领（89/89 精确命中）', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    let hits = 0
    for (const b of SEED.bases) {
      const r = await svc.resolveMaterialBase(b.base_name)
      if (r.resolved && r.base.material_id === b.material_id) hits += 1
    }
    assert.equal(hits, SEED.bases.length, '种子中每个 base_name 都应精确解析回自身')
  } finally {
    await close(db)
  }
})

test('歧义名不猜：多个候选时保持未命中并给出候选', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const r = await svc.resolveMaterialBase('碳化硅')
    assert.equal(r.resolved, false, '碳化硅 有 90/97/98 多个候选，不应自动选一个')
    assert.ok(r.suggestions.some((s) => s.includes('碳化硅')))
  } finally {
    await close(db)
  }
})

test('形态词可被剥离：金属铝粉 → 金属铝', async () => {
  const { db } = withRegistry()
  try {
    await seedAll()
    const r = await svc.resolveMaterialBase('金属铝粉')
    if (r.resolved) assert.equal(r.decomposed.form, '粉')
  } finally {
    await close(db)
  }
})
