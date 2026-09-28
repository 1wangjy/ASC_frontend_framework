import test from 'node:test'
import assert from 'node:assert/strict'

import { FALLBACK_VARIANTS, SOURCE_META, buildVariantOptions, variantCautionText, variantNoteText } from '../src/platform/utils/modelSources.js'

test('options follow the server-provided variant list and keep an informative label', () => {
  const options = buildVariantOptions(['zibo', 'yangquan', 'processed'])
  assert.deepEqual(options.map((o) => o.value), ['zibo', 'yangquan', 'processed'])
  assert.equal(options[0].label, SOURCE_META.zibo.label)
  assert.ok(options.every((o) => o.label.length > 0))
})

test('unknown variants fall back to their raw name instead of disappearing', () => {
  const options = buildVariantOptions(['yangquan', 'brandnew'])
  assert.deepEqual(options.map((o) => o.value), ['yangquan', 'brandnew'])
  assert.equal(options[1].label, 'brandnew')
})

test('missing or empty metadata list uses the fallback sources', () => {
  assert.deepEqual(buildVariantOptions(undefined).map((o) => o.value), FALLBACK_VARIANTS)
  assert.deepEqual(buildVariantOptions([]).map((o) => o.value), FALLBACK_VARIANTS)
  assert.ok(!FALLBACK_VARIANTS.includes('minmax'), '兼容保留的旧模型不该出现在兜底列表里')
})

test('note text describes the source, empty for unknown variants', () => {
  assert.match(variantNoteText('yangquan'), /阳泉/)
  assert.match(variantNoteText('processed'), /780/)
  assert.equal(variantNoteText('brandnew'), '')
  assert.equal(variantNoteText(''), '')
})

test('every known source carries both label and note', () => {
  for (const [name, meta] of Object.entries(SOURCE_META)) {
    assert.ok(meta.label, `${name} 缺少 label`)
    assert.ok(meta.note, `${name} 缺少 note`)
  }
})

test('sources with known metric problems carry a caution, good ones stay clean', () => {
  assert.match(variantCautionText('zibo'), /R²|负/)
  assert.match(variantCautionText('base'), /不可靠/)
  assert.match(variantCautionText('processed'), /量纲/)
  assert.equal(variantCautionText('yangquan'), '')
  assert.equal(variantCautionText('unknown'), '')
})
