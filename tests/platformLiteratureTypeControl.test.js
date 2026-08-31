import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

const options = [
  { value: 'journal', label: '期刊论文' },
  { value: 'conference', label: '会议论文' },
  { value: 'patent', label: '专利' },
  { value: 'book', label: '书籍' },
]

test('renders an inline type confirmation control for unclassified literature', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureTypeControl.vue', {
    entryType: '',
    options,
  })

  assert.match(html, /类型待确认/)
  assert.match(html, /请选择类型/)
  assert.match(html, /期刊论文/)
  assert.match(html, /会议论文/)
  assert.match(html, /专利/)
  assert.match(html, /书籍/)
  assert.match(html, /确认类型/)
})

test('renders the stored type label without a confirmation control', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureTypeControl.vue', {
    entryType: 'book',
    options,
  })

  assert.match(html, /书籍/)
  assert.doesNotMatch(html, /类型待确认/)
  assert.doesNotMatch(html, /请选择类型/)
})
