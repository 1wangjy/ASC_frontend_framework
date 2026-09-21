/**
 * 配方优化的"逐成分约束"编辑模型（纯函数，便于单测）。
 *
 * 一条规则对应一种约束模式：
 *   range    区间 —— 限定某原料的含量范围（min/max，单位为 %）
 *   fixed    固定 —— 锁定某原料的含量（value，单位为 %）
 *   disabled 禁用 —— 该原料不参与配方（含量恒为 0）
 */

export const INGREDIENT_MODE_OPTIONS = Object.freeze([
  { value: 'range', label: '区间', hint: '限定含量范围' },
  { value: 'fixed', label: '固定', hint: '锁定为指定含量' },
  { value: 'disabled', label: '禁用', hint: '不参与配方' },
])

export function createIngredientRule(patch = {}) {
  return { name: '', mode: 'range', min: null, max: null, value: null, ...patch }
}

/** 把界面上的规则整理成后端 payload；空名/非法数值直接丢弃。 */
export function buildIngredientConstraints(rules = []) {
  const out = []
  for (const rule of Array.isArray(rules) ? rules : []) {
    const name = String(rule?.name || '').trim()
    const mode = String(rule?.mode || '').trim().toLowerCase()
    if (!name || !['range', 'fixed', 'disabled'].includes(mode)) continue
    const numberOrNull = (value) => (value === null || value === undefined || value === ''
      ? null
      : (Number.isFinite(Number(value)) ? Number(value) : null))
    if (mode === 'disabled') {
      out.push({ name, mode })
      continue
    }
    if (mode === 'fixed') {
      const value = numberOrNull(rule.value)
      if (value === null) continue
      out.push({ name, mode, value })
      continue
    }
    const min = numberOrNull(rule.min)
    const max = numberOrNull(rule.max)
    if (min === null && max === null) continue
    out.push({
      name,
      mode,
      ...(min === null ? {} : { min }),
      ...(max === null ? {} : { max }),
    })
  }
  return out
}

/** 界面上的即时校验：返回错误文案，空串表示这条规则可用。 */
export function ingredientRuleError(rule) {
  const name = String(rule?.name || '').trim()
  if (!name) return '请选择原料'
  const mode = String(rule?.mode || '').trim().toLowerCase()
  const numberOrNull = (value) => (value === null || value === undefined || value === ''
    ? null
    : (Number.isFinite(Number(value)) ? Number(value) : null))
  if (mode === 'range') {
    const min = numberOrNull(rule.min)
    const max = numberOrNull(rule.max)
    if (min === null && max === null) return '区间约束至少填一个边界'
    if (min !== null && (min < 0 || min > 100)) return '下限需在 0~100 之间'
    if (max !== null && (max < 0 || max > 100)) return '上限需在 0~100 之间'
    if (min !== null && max !== null && min > max) return '下限不能大于上限'
    return ''
  }
  if (mode === 'fixed') {
    const value = numberOrNull(rule.value)
    if (value === null) return '固定约束需要填写百分比'
    if (value < 0 || value > 100) return '固定值需在 0~100 之间'
    return ''
  }
  return ''
}

/** 同一原料不能出现互相冲突的规则（固定 + 禁用、重复约束）。 */
export function ingredientRulesError(rules = []) {
  const list = Array.isArray(rules) ? rules : []
  for (let index = 0; index < list.length; index += 1) {
    const error = ingredientRuleError(list[index])
    if (error) return `第 ${index + 1} 条成分约束：${error}`
  }
  const seen = new Map()
  for (const rule of list) {
    const name = String(rule?.name || '').trim()
    if (!name) continue
    if (seen.has(name)) return `原料「${name}」设置了重复约束，请合并为一条`
    seen.set(name, true)
  }
  return ''
}

export function describeIngredientRule(rule) {
  const name = String(rule?.name || '').trim() || '未选原料'
  const mode = String(rule?.mode || '').trim().toLowerCase()
  if (mode === 'disabled') return `${name} 禁用`
  if (mode === 'fixed') return `${name} 固定 ${Number(rule?.value ?? 0)}%`
  const min = rule?.min === null || rule?.min === undefined || rule?.min === '' ? null : Number(rule.min)
  const max = rule?.max === null || rule?.max === undefined || rule?.max === '' ? null : Number(rule.max)
  if (min !== null && max !== null) return `${name} ${min}~${max}%`
  if (min !== null) return `${name} ≥ ${min}%`
  if (max !== null) return `${name} ≤ ${max}%`
  return `${name} 区间`
}
