import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIngredientConstraints,
  createIngredientRule,
  describeIngredientRule,
  ingredientRuleError,
  ingredientRulesError,
} from '../src/platform/utils/ingredientConstraints.js'

test('a fresh rule is an empty 区间 rule', () => {
  assert.deepEqual(createIngredientRule(), { name: '', mode: 'range', min: null, max: null, value: null })
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
