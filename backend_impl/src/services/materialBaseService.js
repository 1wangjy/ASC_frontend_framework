/**
 * 原料 base 注册表服务 —— 六张业务表 ↔ 预测模型 one-hot 位之间的唯一映射真源。
 *
 * 数据落两处并保持一致：
 *   1) sqlite：material_base / material_base_rule（运行期读写）
 *   2) JSON：data/material_base_map.json（版本化、可导入导出、随包携带）
 *
 * 约定：base_name 是规范名（唯一）；material_id 是预测模型的类别取值（可为空 = 尚未映射），
 * 只有 material_id 落在某变体词表内时才会命中 one-hot 位 `material_id__<id>_frac`。
 */
const fs = require('fs');
const path = require('path');
const database = require('../config/database');
const { ensureMaterialBaseSchema } = require('../config/material-base-schema');

const JSON_PATH = path.join(__dirname, '../../../data/material_base_map.json')
const JSON_VERSION = 1

let injectedDb = null
let jsonPath = JSON_PATH

/** 测试注入临时库；传 null 恢复使用全局连接。 */
function setDb(handle) { injectedDb = handle }

/** 测试注入临时 JSON 路径；传 null/空 恢复默认（data/material_base_map.json）。 */
function setJsonPath(target) { jsonPath = target || JSON_PATH }
function getJsonPath() { return jsonPath }
function getDb() { return injectedDb || database.db }
function requireDb() {
  const handle = getDb()
  if (!handle) throw new Error('material-base: no sqlite handle (database not connected)')
  return handle
}

function all(handle, sql, params = []) {
  return new Promise((resolve, reject) => handle.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))))
}
function get(handle, sql, params = []) {
  return new Promise((resolve, reject) => handle.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))))
}
/** 惰性建表：按句柄缓存结果，避免依赖启动顺序（测试注入新库时自动重新建表）。 */
const ensuredHandles = new WeakSet()
async function ensureReady() {
  const handle = requireDb()
  if (!ensuredHandles.has(handle)) {
    await ensureMaterialBaseSchema(handle)
    ensuredHandles.add(handle)
  }
  return handle
}

function run(handle, sql, params = []) {
  return new Promise((resolve, reject) => handle.run(sql, params, function onRun(e) { e ? reject(e) : resolve({ changes: this.changes, lastID: this.lastID }) }))
}

/**
 * 生成顺序 ID：BASE_000001 / MBR_000001（延续表内最大序号，避免与既有行冲突）。
 * prefixLen：'BASE_' = 5、'MBR_' = 4。
 */
async function nextId(handle, table, column, prefix) {
  const row = await get(handle, `SELECT COALESCE(MAX(CAST(substr(${column}, ${prefix.length + 1}) AS INTEGER)), 0) AS n FROM ${table}`)
  const next = Number(row && row.n) + 1
  return `${prefix}${String(next).padStart(6, '0')}`
}

function parseAliases(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean)
    } catch { /* 逗号分隔兜底 */ }
    return value.split(/[,，;；]/).map((v) => v.trim()).filter(Boolean)
  }
  return []
}

function rowToBase(row) {
  return {
    base_id: row.base_id,
    base_name: row.base_name,
    material_id: row.material_id || '',
    category: row.category || '',
    aliases: parseAliases(row.aliases),
    enabled: Number(row.enabled) === 1,
    source: row.source || 'manual',
    ref_count: Number(row.ref_count || 0),
    update_time: row.update_time || null,
  }
}

/** 列出 base（可按关键字/启用状态过滤）。 */
async function listBases({ keyword = '', enabled = null } = {}) {
  const handle = await ensureReady()
  const where = []
  const params = []
  if (keyword) { where.push('(base_name LIKE ? OR aliases LIKE ? OR material_id LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
  if (enabled !== null) { where.push('enabled = ?'); params.push(enabled ? 1 : 0) }
  const sql = `SELECT * FROM material_base ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CAST(base_id AS TEXT)`
  const rows = await all(handle, sql, params)
  return rows.map(rowToBase)
}

async function getBaseById(baseId) {
  const handle = await ensureReady()
  const row = await get(handle, 'SELECT * FROM material_base WHERE base_id = ?', [baseId])
  return row ? rowToBase(row) : null
}

async function getBaseByName(name) {
  const handle = await ensureReady()
  const row = await get(handle, 'SELECT * FROM material_base WHERE base_name = ?', [String(name || '').trim()])
  return row ? rowToBase(row) : null
}

/**
 * 新增/更新 base。base_name 唯一：同名则更新（可补 material_id / 追加别名）。
 * 返回 {base, created}。
 */
async function upsertBase({ base_name, material_id = '', category = '', aliases = [], source = 'manual' }) {
  const name = String(base_name || '').trim()
  if (!name) throw Object.assign(new Error('base_name is required'), { code: 'BASE_NAME_REQUIRED' })
  const handle = await ensureReady()
  const existing = await get(handle, 'SELECT * FROM material_base WHERE base_name = ?', [name])
  const aliasList = parseAliases(aliases)
  const now = new Date().toISOString()
  if (existing) {
    const merged = [...new Set([...parseAliases(existing.aliases), ...aliasList])]
    await run(handle, `UPDATE material_base SET material_id = ?, category = ?, aliases = ?, source = ?, update_time = ? WHERE base_id = ?`,
      [String(material_id || existing.material_id || ''), category || existing.category || '', JSON.stringify(merged), existing.source || source, now, existing.base_id])
    return { base: await getBaseById(existing.base_id), created: false }
  }
  const baseId = await nextId(handle, 'material_base', 'base_id', 'BASE_')
  await run(handle, `INSERT INTO material_base (base_id, base_name, material_id, category, aliases, enabled, source, ref_count, create_time, update_time)
                     VALUES (?,?,?,?,?,1,?,0,?,?)`,
    [baseId, name, String(material_id || ''), category, JSON.stringify(aliasList), source, now, now])
  await exportJson()
  return { base: await getBaseById(baseId), created: true }
}

async function setBaseEnabled(baseId, enabled) {
  const handle = await ensureReady()
  await run(handle, 'UPDATE material_base SET enabled = ?, update_time = ? WHERE base_id = ?', [enabled ? 1 : 0, new Date().toISOString(), baseId])
  await exportJson()
  return getBaseById(baseId)
}

/** 列出解析规则（按 priority 升序 = 先匹配先命中）。 */
async function listRules({ enabled = null } = {}) {
  const handle = await ensureReady()
  const params = []
  let sql = 'SELECT r.*, b.base_name FROM material_base_rule r LEFT JOIN material_base b ON b.base_id = r.target_base_id'
  if (enabled !== null) { sql += ' WHERE r.enabled = ?'; params.push(enabled ? 1 : 0) }
  sql += ' ORDER BY r.priority ASC, r.rule_id ASC'
  return all(handle, sql, params)
}

/** 新增规则（kind ∈ exact/alias/normalize/regex/keyword）。 */
async function addRule({ kind, pattern, target_base_id, priority = 100, note = '' }) {
  const KINDS = ['exact', 'alias', 'normalize', 'regex', 'keyword']
  if (!KINDS.includes(kind)) throw Object.assign(new Error(`invalid rule kind: ${kind}`), { code: 'RULE_KIND_INVALID' })
  const text = String(pattern || '').trim()
  if (!text) throw Object.assign(new Error('pattern is required'), { code: 'RULE_PATTERN_REQUIRED' })
  const handle = await ensureReady()
  const target = await get(handle, 'SELECT base_id FROM material_base WHERE base_id = ?', [target_base_id])
  if (!target) throw Object.assign(new Error(`unknown target_base_id: ${target_base_id}`), { code: 'RULE_TARGET_UNKNOWN' })
  const ruleId = await nextId(handle, 'material_base_rule', 'rule_id', 'MBR_')
  const now = new Date().toISOString()
  await run(handle, `INSERT INTO material_base_rule (rule_id, kind, pattern, target_base_id, priority, enabled, note, create_time, update_time)
                     VALUES (?,?,?,?,?,1,?,?,?)`, [ruleId, kind, text, target_base_id, Number(priority) || 100, note, now, now])
  await exportJson()
  const rows = await listRules()
  return rows.find((r) => r.rule_id === ruleId) || null
}

async function setRuleEnabled(ruleId, enabled) {
  const handle = await ensureReady()
  await run(handle, 'UPDATE material_base_rule SET enabled = ?, update_time = ? WHERE rule_id = ?', [enabled ? 1 : 0, new Date().toISOString(), ruleId])
  await exportJson()
  const rows = await listRules()
  return rows.find((r) => r.rule_id === ruleId) || null
}

async function removeRule(ruleId) {
  const handle = await ensureReady()
  const res = await run(handle, 'DELETE FROM material_base_rule WHERE rule_id = ?', [ruleId])
  await exportJson()
  return res.changes > 0
}

/** 导出注册表快照到 data/material_base_map.json（表 → JSON 单向同步）。 */
async function exportJson({ filePath = jsonPath } = {}) {
  const handle = await ensureReady()
  const bases = (await all(handle, 'SELECT * FROM material_base ORDER BY base_id')).map(rowToBase)
  const rules = (await all(handle, 'SELECT * FROM material_base_rule ORDER BY priority ASC, rule_id ASC')).map((r) => ({
    rule_id: r.rule_id, kind: r.kind, pattern: r.pattern, target_base_id: r.target_base_id,
    priority: Number(r.priority), enabled: Number(r.enabled) === 1, note: r.note || '',
  }))
  const payload = {
    version: JSON_VERSION,
    updated_at: new Date().toISOString(),
    note: '原料 base 名注册表：base_name ↔ 预测模型 material_id（one-hot 位 material_id__<id>_frac）',
    bases, rules, path: filePath,
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ ...payload, path: undefined }, null, 2), 'utf8')
  return payload
}

/** 从 JSON 引导灌入（表为空时才插入；已存在的 base_name 跳过）。 */
async function bootstrapFromJson({ filePath = jsonPath } = {}) {
  if (!fs.existsSync(filePath)) return { inserted: 0, rulesInserted: 0, skipped: 0, missing: true }
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const handle = await ensureReady()
  let inserted = 0
  let skipped = 0
  for (const b of snapshot.bases || []) {
    const existing = await get(handle, 'SELECT base_id FROM material_base WHERE base_name = ?', [b.base_name])
    if (existing) { skipped += 1; continue }
    await run(handle, `INSERT INTO material_base (base_id, base_name, material_id, category, aliases, enabled, source, ref_count, create_time, update_time)
                       VALUES (?,?,?,?,?,?,?,0,?,?)`,
      [b.base_id, b.base_name, b.material_id || '', b.category || '', JSON.stringify(parseAliases(b.aliases)),
        b.enabled === false ? 0 : 1, b.source || 'json', new Date().toISOString(), new Date().toISOString()])
    inserted += 1
  }
  let rulesInserted = 0
  for (const r of snapshot.rules || []) {
    const existing = await get(handle, 'SELECT rule_id FROM material_base_rule WHERE pattern = ? AND kind = ? AND target_base_id = ?',
      [r.pattern, r.kind, r.target_base_id])
    if (existing) { skipped += 1; continue }
    await run(handle, `INSERT INTO material_base_rule (rule_id, kind, pattern, target_base_id, priority, enabled, note, create_time, update_time)
                       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.rule_id, r.kind, r.pattern, r.target_base_id, Number(r.priority) || 100, r.enabled === false ? 0 : 1, r.note || '',
        new Date().toISOString(), new Date().toISOString()])
    rulesInserted += 1
  }
  return { inserted, rulesInserted, skipped, missing: false }
}

/** 覆盖统计：总数 / 已映射（有 material_id）/ 未映射。 */
async function stats() {
  const handle = await ensureReady()
  const row = await get(handle, `SELECT COUNT(*) AS total,
      SUM(CASE WHEN material_id IS NOT NULL AND material_id <> '' THEN 1 ELSE 0 END) AS mapped FROM material_base`)
  const total = Number(row?.total || 0)
  const mapped = Number(row?.mapped || 0)
  return { total, mapped, unmapped: total - mapped }
}

module.exports = {
  JSON_PATH,
  setDb, getDb, requireDb, setJsonPath, getJsonPath,
  ensureMaterialBaseSchema, ensureReady,
  listBases, getBaseById, getBaseByName, upsertBase, setBaseEnabled,
  listRules, addRule, setRuleEnabled, removeRule,
  exportJson, bootstrapFromJson, stats,
}
