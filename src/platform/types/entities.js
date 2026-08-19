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