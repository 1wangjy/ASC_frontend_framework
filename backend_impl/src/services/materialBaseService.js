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

// ───────────────────────────── 名称解析 ─────────────────────────────
// 目标：把业务表里的自由文本原料名解析到 base（从而拿到模型 material_id → one-hot 位）。
// 顺序：精确 → 别名 → 归一化 → 规则（priority）→ 拆解；**未命中只给建议，绝不臆造**。

const FORM_WORDS = ['细粉', '微粉', '超微粉', '骨料', '颗粒', '粉料', '粉体', '细粒', '粗粒',
  '纤维', '水泥', '浇注料', '捣打料', '炮泥', '球', '砂', '粉']
const SPEC_RE = /(\d+(?:\.\d+)?)\s*(目|mm|厘米|um|µm|μm|mesh|MM)/gi
const BRAND_RE = /^(\d{2,3}[A-Za-z]?|[A-Z]{1,3}\d{1,3})\s*/   // 97 / 600R / CA71 / 101E …

/** 全角→半角、去空白/破折号/下划线、统一符号。 */
function normalizeName(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u3000\s]/g, '')
    .replace(/[－—_·•・]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .trim()
}

/** 结构拆解：品牌/含量、规格（目数/粒径）、形态（粉/骨料/水泥…）、基体名。 */
function decomposeMaterialName(raw) {
  const normalized = normalizeName(raw)
  const specs = [...normalized.matchAll(SPEC_RE)].map((m) => `${m[1]}${m[2]}`)
  let rest = normalized.replace(SPEC_RE, '')
  const forms = []
  for (const word of FORM_WORDS) {
    if (rest.includes(word)) { forms.push(word); rest = rest.replace(word, '') }
  }
  const brandMatch = rest.match(BRAND_RE)
  const brand = brandMatch ? brandMatch[1] : ''
  if (brand) rest = rest.slice(brandMatch[0].length)
  const matrix = rest.replace(/[()]/g, '')
  return { raw: String(raw == null ? '' : raw), normalized, brand, spec: specs.join('/'), form: forms[0] || '', forms, matrix }
}

function similarity(a, b) {
  const x = normalizeName(a).toLowerCase()
  const y = normalizeName(b).toLowerCase()
  if (!x || !y) return 0
  if (x === y) return 1
  const longer = x.length >= y.length ? x : y
  const shorter = x.length >= y.length ? y : x
  if (longer.includes(shorter)) return 0.8 + 0.2 * (shorter.length / longer.length)
  // 字符集重合度（中文无序匹配的粗粒度近似）
  const setA = new Set([...x]); const setB = new Set([...y])
  let common = 0
  for (const ch of setA) if (setB.has(ch)) common += 1
  return (2 * common) / (setA.size + setB.size)
}

/** 按 priority 依次试规则；返回命中的 base_id 或 null。 */
function ruleMatches(rule, raw, normalized) {
  const pattern = rule.pattern == null ? '' : String(rule.pattern)
  switch (rule.kind) {
    case 'exact': return raw === pattern ? rule.target_base_id : null
    case 'alias': return normalized === normalizeName(pattern) ? rule.target_base_id : null
    case 'normalize': return normalized === normalizeName(pattern) ? rule.target_base_id : null
    case 'keyword': return normalized.includes(normalizeName(pattern)) ? rule.target_base_id : null
    case 'regex': {
      try { return new RegExp(pattern).test(String(raw)) ? rule.target_base_id : null } catch { return null }
    }
    default: return null
  }
}

function findBaseIn(bases, predicate) {
  return bases.find(predicate) || null
}

/**
 * 解析原料名 → base。
 * @returns {{resolved: boolean, via: string, base: object|null, decomposed: object, suggestions: string[], suggestedRules: object[]}}
 */
async function resolveMaterialBase(raw) {
  const handle = await ensureReady()
  const bases = (await all(handle, 'SELECT * FROM material_base WHERE enabled = 1')).map(rowToBase)
  const rules = await all(handle, 'SELECT * FROM material_base_rule WHERE enabled = 1 ORDER BY priority ASC, rule_id ASC')
  const text = String(raw == null ? '' : raw).trim()
  const normalized = normalizeName(text)
  const decomposed = decomposeMaterialName(text)

  const byId = (baseId) => bases.find((b) => b.base_id === baseId) || null
  const done = (base, via) => ({ resolved: true, via, base, decomposed, suggestions: [], suggestedRules: [] })

  // 1) 精确
  const exact = findBaseIn(bases, (b) => b.base_name === text)
  if (exact) return done(exact, 'exact')
  // 2) 别名（原始或归一化相等）
  const aliasHit = findBaseIn(bases, (b) => b.aliases.some((a) => a === text || normalizeName(a) === normalized))
  if (aliasHit) return done(aliasHit, 'alias')
  // 3) 归一化相等
  const normHit = findBaseIn(bases, (b) => normalizeName(b.base_name) === normalized)
  if (normHit) return done(normHit, 'normalize')
  // 4) 规则
  for (const rule of rules) {
    const targetId = ruleMatches(rule, text, normalized)
    if (!targetId) continue
    const base = byId(targetId)
    if (base) return { ...done(base, 'rule'), viaRule: rule.rule_id, viaKind: rule.kind }
  }
  // 5) 拆解：先看基体名是否**等于**某个 base（唯一），再退化为唯一子串命中
  if (decomposed.matrix) {
    const matrix = normalizeName(decomposed.matrix)
    if (matrix) {
      const equal = bases.filter((b) => normalizeName(b.base_name) === matrix)
      if (equal.length === 1) return done(equal[0], 'decompose')
      // 子串命中：base 名必须是 matrix 去掉「形态词」后能完整解释的部分，
      // 例如「棕刚玉粉」→ 棕刚玉（剩下的「粉」是形态词）；
      // 而「高铝铝土」不能归到「高铝」（剩余「铝土」无法解释）→ 留给人建规则。
      const isExplained = (matrixText, name) => {
        const leftover = matrixText.split(name).join('')
        return leftover === '' || FORM_WORDS.includes(leftover)
      }
      const contains = bases.filter((b) => {
        const name = normalizeName(b.base_name)
        if (name === matrix || name.length < 2) return false
        if (name.includes(matrix)) return false // 形如「一级白刚玉/棕刚玉」不应抢占「棕刚玉」
        return matrix.includes(name) && isExplained(matrix, name)
      })
      if (!equal.length && contains.length === 1) return done(contains[0], 'decompose')
    }
  }

  // 未命中：给出候选与可一键新建的规则模板（不写库）
  const suggestions = bases
    .map((b) => ({ name: b.base_name, score: similarity(decomposed.matrix || text, b.base_name) }))
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => c.name)
  const suggestedRules = [
    { kind: 'alias', pattern: text, note: `把「${text}」直接指向某个 base`, priority: 50 },
    decomposed.matrix && decomposed.matrix !== text
      ? { kind: 'keyword', pattern: decomposed.matrix, note: `按基体名「${decomposed.matrix}」批量指向某个 base`, priority: 200 }
      : null,
  ].filter(Boolean)
  return { resolved: false, via: 'none', base: null, decomposed, suggestions, suggestedRules }
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
  normalizeName, decomposeMaterialName, resolveMaterialBase,
}
