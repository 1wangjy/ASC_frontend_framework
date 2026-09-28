/**
 * 性能预测「来源（模型变体）」下拉的数据源。
 * 不同数据来源训练出的权重不同：这里集中维护展示名与说明，供 Model1View 与单测共用。
 * 样本量取自 ML 交接包 README（MODEL/outputs_selective_selector，各来源训练集规模差异很大）。
 */
export const SOURCE_META = {
  yangquan: { label: '阳泉（141 条）', note: '阳泉来源 · 指标最优' },
  processed: {
    label: '全量清洗（780 条）',
    note: '全量清洗数据 · 覆盖最广',
    caution: '该来源 bulk_density 量纲异常（指标 RMSE≈130），建议只看相对趋势',
  },
  fill: {
    label: '全量填补（780 条）',
    note: '化学字段填补后 · 覆盖最广',
    caution: '该来源 bulk_density 量纲异常（指标 RMSE≈136），建议只看相对趋势',
  },
  base: {
    label: '原始数据（780 条）',
    note: '未清洗基线',
    caution: '未清洗数据：bulk_density 测试 R² 为负，结果不可靠',
  },
  batch183: {
    label: '183 批次（182 条）',
    note: '单批次来源',
    caution: '样本仅 182 条：bulk_density 测试 R² 近 0',
  },
  zibo: {
    label: '淄博（457 条）',
    note: '淄博来源 · 泛化较弱',
    caution: '淄博来源四项指标测试 R² 均为负，谨慎使用',
  },
  minmax: { label: '早期基础版（minmax）', note: '兼容保留模型' },
}

/** 元数据未返回 available_variants 时的兜底列表（不含兼容保留的 minmax）。 */
export const FALLBACK_VARIANTS = ['yangquan', 'processed', 'fill', 'base', 'batch183', 'zibo']

/** 下拉选项：[{value,label}]，未知变体回退显示其原始名称。 */
export function buildVariantOptions(availableVariants) {
  const listed = Array.isArray(availableVariants) && availableVariants.length
    ? availableVariants
    : FALLBACK_VARIANTS
  return listed.map((name) => ({ value: name, label: SOURCE_META[name]?.label || name }))
}

/** 当前来源的说明文案（未知变体给空串，界面自动隐藏该 chip）。 */
export function variantNoteText(variant) {
  const meta = SOURCE_META[variant]
  return meta ? `来源 ${meta.label} · ${meta.note}` : ''
}

/** 该来源的已知质量提示；无提示时返回空串（界面隐藏该 chip）。 */
export function variantCautionText(variant) {
  return SOURCE_META[variant]?.caution || ''
}
