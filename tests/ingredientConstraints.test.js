import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildConstraintOptions,
  buildIngredientConstraints,
  createIngredientRule,
  describeIngredientRule,
  ingredientRuleError,
  ingredientRulesError,
} from '../src/platform/utils/ingredientConstraints.js'

test('a fresh rule is an empty 区间 rule', () => {
  assert.deepEqual(createIngredientRule(), {
    name: '', mode: 'range', min: null, max: null, value: null, material: null, materialOptions: [],
  })
})

test('range/fixed/disabled rules build the backend payload', () => {
  const payload = buildIngredientConstraints([
    { name: '90矾土', mode: 'range', min: 10, max: 25 },
    { name: 'FDN', mode: 'fixed', value: 0.8 },
    { name: '97黑碳化硅', mode: 'disabled' },
  ])
  assert.deepEqual(payload, [
    { name: '90矾土', mode: 'range', min: 10, max: 25 },
    { name: 'FDN', mode: 'fixed', value: 0.8 },
    { name: '97黑碳化硅', mode: 'disabled' },
  ])
})

test('incomplete or empty rules never reach the backend', () => {
  assert.deepEqual(buildIngredientConstraints([
    { name: '', mode: 'range', min: 1, max: 2 },
    { name: '90矾土', mode: 'range', min: null, max: null },
    { name: 'FDN', mode: 'fixed', value: '' },
    { name: 'FDN', mode: 'unknown', value: 1 },
  ]), [])
})

test('a one-sided range keeps only the provided bound', () => {
  assert.deepEqual(buildIngredientConstraints([{ name: '90矾土', mode: 'range', min: '', max: 30 }]), [
    { name: '90矾土', mode: 'range', max: 30 },
  ])
})

test('range validation catches missing bounds and inverted ranges', () => {
  assert.equal(ingredientRuleError({ name: '90矾土', mode: 'range', min: null, max: null }), '区间约束至少填一个边界')
  assert.equal(ingredientRuleError({ name: '90矾土', mode: 'range', min: 30, max: 10 }), '下限不能大于上限')
  assert.equal(ingredientRuleError({ name: '90矾土', mode: 'range', min: -1, max: 10 }), '下限需在 0~100 之间')
  assert.equal(ingredientRuleError({ name: '90矾土', mode: 'range', min: 10, max: 30 }), '')
})

test('fixed validation requires a percentage in range', () => {
  assert.equal(ingredientRuleError({ name: 'FDN', mode: 'fixed', value: '' }), '固定约束需要填写百分比')
  assert.equal(ingredientRuleError({ name: 'FDN', mode: 'fixed', value: 120 }), '固定值需在 0~100 之间')
  assert.equal(ingredientRuleError({ name: 'FDN', mode: 'fixed', value: 0.8 }), '')
})

test('duplicate materials are reported before running', () => {
  const message = ingredientRulesError([
    { name: '90矾土', mode: 'range', min: 10, max: 30 },
    { name: '90矾土', mode: 'disabled' },
  ])
  assert.match(message, /重复约束/)
})

test('rules describe themselves for the result chips', () => {
  assert.equal(describeIngredientRule({ name: '90矾土', mode: 'range', min: 10, max: 25 }), '90矾土 10~25%')
  assert.equal(describeIngredientRule({ name: 'FDN', mode: 'fixed', value: 0.8 }), 'FDN 固定 0.8%')
  assert.equal(describeIngredientRule({ name: '97黑碳化硅', mode: 'disabled' }), '97黑碳化硅 禁用')
  assert.equal(describeIngredientRule({ name: '90矾土', mode: 'range', min: 10, max: null }), '90矾土 ≥ 10%')
})

test('base 名 → 具体优化器原料的 material 字段会进入 payload', () => {
  const payload = buildIngredientConstraints([
    { name: 'Al2O3', mode: 'range', min: 5, material: 'Al2O3微粉（高达）' },
    { name: '60均质', mode: 'range', min: 20, material: '60均质粉' },
    { name: '97黑碳化硅', mode: 'range', min: 10 },
  ])
  assert.deepEqual(payload, [
    { name: 'Al2O3', mode: 'range', min: 5, material: 'Al2O3微粉（高达）' },
    { name: '60均质', mode: 'range', min: 20, material: '60均质粉' },
    { name: '97黑碳化硅', mode: 'range', min: 10 },
  ])
})

test('base 有多个候选原料时必须指定具体原料', () => {
  const rule = { name: 'Al2O3', mode: 'range', min: 5, materialOptions: ['Al2O3微粉', 'Al2O3微粉（高达）'] }
  assert.match(ingredientRuleError(rule), /请选择具体原料/)
  assert.equal(ingredientRuleError({ ...rule, material: 'Al2O3微粉' }), '')
  // 唯一候选（由 onIngredientNameChange 自动绑定）不需要人工选择
  assert.equal(ingredientRuleError({ name: '60均质', mode: 'range', min: 5, materialOptions: ['60均质粉'], material: '60均质粉' }), '')
})

test('规则描述在有映射时显示 base→原料', () => {
  assert.equal(describeIngredientRule({ name: 'Al2O3', material: 'Al2O3微粉', mode: 'range', min: 5 }), 'Al2O3→Al2O3微粉 ≥ 5%')
  assert.equal(describeIngredientRule({ name: '60均质', material: '60均质粉', mode: 'disabled' }), '60均质→60均质粉 禁用')
})

test('下拉分组：可直接约束 / 需指定原料 / 无对应 / 未被命中的优化器原料', () => {
  const options = buildConstraintOptions({
    bases: [
      { name: '60均质', targets: ['60均质粉'], match: 'containment' },
      { name: 'Al2O3', targets: ['Al2O3微粉', 'Al2O3微粉（高达）'], match: 'containment' },
      { name: '棕刚玉', targets: [], match: 'none' },
    ],
    materials: ['60均质粉', 'Al2O3微粉', 'Al2O3微粉（高达）', 'FS20', '棕刚玉'],
  })
  assert.deepEqual(options.direct.map((item) => item.value), ['60均质'])
  assert.deepEqual(options.multiple.map((item) => item.value), ['Al2O3'])
  assert.deepEqual(options.unavailable.map((item) => item.value), ['棕刚玉'])
  // FS20 / 棕刚玉 未被任何 base 命中 → 仍可直接按优化器原料名约束
  assert.deepEqual(options.optimizerOnly.map((item) => item.value), ['FS20', '棕刚玉'])
})
