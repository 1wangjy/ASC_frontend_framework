import test from 'node:test'
import assert from 'node:assert/strict'

import { modelModeValue, needsModelModeOptions, resolveModelModeSelection } from '../src/features/qa/qaModelMode.js'

const OPTIONS = [
  { value: 'default', label: '默认模式' },
  { value: 'quality_expert', label: '高质量专家模式' },
  { value: 'fast_interactive', label: '快速交互模式' },
]

test('an empty list means the capability list still has to be fetched', () => {
  assert.equal(needsModelModeOptions([]), true)
  assert.equal(needsModelModeOptions(undefined), true)
  assert.equal(needsModelModeOptions(null), true)
  assert.equal(needsModelModeOptions(OPTIONS), false)
})

test('a valid mode id is kept as-is', () => {
  assert.equal(resolveModelModeSelection({ requested: 'quality_expert', options: OPTIONS }), 'quality_expert')
})

test('a model label from 深度研究 never reaches the backend as a mode id', () => {
  // 直接以 ?mode=multi 打开时 settings 里可能残留单模式的模型标签
  assert.equal(
    resolveModelModeSelection({ requested: 'DeepSeek · V4 Flash', options: OPTIONS, fallback: 'default' }),
    'default',
  )
  assert.equal(
    resolveModelModeSelection({ requested: '', options: OPTIONS, fallback: 'default' }),
    'default',
  )
})

test('a dropped mode name falls back to the default instead of a stale value', () => {
  const remaining = [{ value: 'default' }, { value: 'fast_interactive' }]
  assert.equal(
    resolveModelModeSelection({ requested: 'balanced_production', options: remaining, fallback: 'default' }),
    'default',
  )
})

test('options given as plain strings work too', () => {
  assert.equal(resolveModelModeSelection({ requested: 'b', options: ['a', 'b'] }), 'b')
  assert.equal(resolveModelModeSelection({ requested: 'zzz', options: ['a', 'b'] }), 'a')
})

test('an empty option list still yields a usable default', () => {
  assert.equal(resolveModelModeSelection({ requested: 'x', options: [], fallback: 'default' }), 'default')
})

test('options shaped like the capability API ({mode,label,model}) resolve to the mode id', () => {
  const capabilityShaped = [
    { mode: 'default', label: '默认模式', model: 'deepseek-v4-flash' },
    { mode: 'quality_expert', label: '高质量专家模式', model: 'deepseek-v4-pro' },
  ]
  assert.equal(modelModeValue(capabilityShaped[1]), 'quality_expert')
  assert.equal(
    resolveModelModeSelection({ requested: 'quality_expert', options: capabilityShaped, fallback: 'default' }),
    'quality_expert',
  )
  // 关键回归：绝不把选项对象本身当作值（曾导致 model_mode = "[object Object]"）
  assert.notEqual(modelModeValue({ label: '无标识字段' }), '[object Object]')
  assert.equal(modelModeValue({ label: '无标识字段' }), '')
})

test('an object without any id field never becomes a mode value', () => {
  assert.equal(
    resolveModelModeSelection({ requested: {}, options: [{ label: 'x' }], fallback: 'default' }),
    'default',
  )
})
