/**
 * Entity type definitions for the data platform module.
 * Documented with JSDoc instead of TypeScript for consistency with the parent project.
 */

/** @typedef {[string, string|null, string, number]} ComponentTuple */

/** @typedef {'mc'|'mr'|'mp'|'tp'|'fe'|'ru'|'lit'} TableType */

export const ID_FIELD_MAP = {
  mc: 'mc_id',
  mr: 'mr_id',
  mp: 'mp_id',
  tp: 'tp_id',
  fe: 'fe_id',
  ru: 'ru_id',
  lit: 'lit_id',
}

export const MC_TYPE_OPTIONS = [
  '支撑骨料', '抗侵蚀原料', '抗氧化剂', '填充细粉', '结合剂', '水', '其他',
]

export const MR_TYPE_OPTIONS = [
  '铁线配方', '渣线配方', '烧成带配方', '过渡带配方', '其他', '未分类',
]

export const LIT_TYPE_OPTIONS = [
  { label: '期刊论文', value: 'journal' },
  { label: '会议论文', value: 'conference' },
  { label: '专利', value: 'patent' },
  { label: '书籍', value: 'book' },
]

/**
 * BibTeX / XMP / legacy type spellings folded onto the canonical vocabulary above.
 * Without this the 按类型 rail lists the same concept twice — once as the Chinese label
 * (`journal` → 期刊论文) and once as the raw imported value (`article`).
 */
export const LIT_TYPE_ALIASES = {
  article: 'journal',
  'journal-article': 'journal',
  journalarticle: 'journal',
  review: 'journal',
  periodical: 'journal',
  inproceedings: 'conference',
  proceedings: 'conference',
  proceedingsarticle: 'conference',
  conferencepaper: 'conference',
  incollection: 'book',
  inbook: 'book',
  bookchapter: 'book',
  monograph: 'book',
  phdthesis: 'book',
  mastersthesis: 'book',
  techreport: 'book',
  report: 'book',
  misc: '',        // 泛型条目归入"未分类"，不硬塞类型
}

/** Fold any stored literature type onto the canonical vocabulary ('' stays ''). */
export function normalizeLiteratureEntryType(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (LIT_TYPE_OPTIONS.some((option) => option.value === raw)) return raw
  return key in LIT_TYPE_ALIASES ? LIT_TYPE_ALIASES[key] : raw
}

/** Human label for a stored literature type. */
export function literatureTypeLabel(value) {
  const normalized = normalizeLiteratureEntryType(value)
  if (!normalized) return ''
  return LIT_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || normalized
}

export function resolveComponentSelection(tableType, material) {
  if (!material) return { name: '', id: '' }
  if (tableType === 'mc' && material.mp_id) {
    return { name: '', id: material.mp_id }
  }
  const component = Array.isArray(material.component_list) && Array.isArray(material.component_list[0])
    ? material.component_list[0]
    : []
  const name = component[0] || material.batch_no || material.mc_id || ''

  return {
    name,
    id: tableType === 'mr' ? (material.mc_id || '') : (component[1] || ''),
  }
}

function normalizeComponentRow(row) {
  if (Array.isArray(row)) {
    return { name: row[0], id: row[1], ratio: row[3] }
  }
  return row || {}
}

export function validateComponentRows(tableType, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '请至少添加一个成分'

  const expectedPrefix = tableType === 'mr' ? 'MC_' : 'MP_'
  const expectedLabel = tableType === 'mr' ? 'MC_ID' : 'MP_ID'
  const normalized = rows.map(normalizeComponentRow)

  for (const row of normalized) {
    if (!String(row.name || '').trim()) return '请填写完整的成分名称'
    if (!String(row.id || '').startsWith(expectedPrefix)) return `每个成分都必须绑定有效的 ${expectedLabel}`
    const ratio = Number(row.ratio)
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 100) return '成分比例必须大于 0 且不超过 100%'
  }

  const ids = normalized.map((row) => String(row.id))
  if (new Set(ids).size !== ids.length) return `不能重复选择同一个 ${expectedLabel}`

  const total = normalized.reduce((sum, row) => sum + Number(row.ratio), 0)
  if (Math.abs(total - 100) > 0.01) return `成分比例总和必须为 100%，当前为 ${total}%`
  return ''
}

export function buildTpPayload(mrId, testResults, testCondition = '无') {
  const normalizedMrId = String(mrId || '').trim()
  return {
    mr_ids: normalizedMrId ? [normalizedMrId] : [],
    mp_id: null,
    test_params: {},
    test_results: testResults,
    test_condition: String(testCondition || '').trim() || '无',
  }
}

export function assignComponentId(rows, index, id) {
  return (Array.isArray(rows) ? rows : []).map((row, rowIndex) => (
    rowIndex === index ? { ...row, id } : row
  ))
}

export function findMaterialByReference(materials, referenceId) {
  const target = String(referenceId || '').trim()
  if (!target) return null
  return (Array.isArray(materials) ? materials : []).find((material) => {
    if (material?.mc_id === target) return true
    return Array.isArray(material?.component_list) && material.component_list.some((component) => (
      Array.isArray(component) && component[1] === target
    ))
  }) || null
}
