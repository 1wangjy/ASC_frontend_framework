import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

const typeOptions = [
  { value: 'journal', label: '期刊论文' },
  { value: 'conference', label: '会议论文' },
  { value: 'patent', label: '专利' },
  { value: 'book', label: '书籍' },
]

test('renders all available literature details without requesting another data source', async () => {
  const abstract = 'First paragraph of a long abstract.\nSecond paragraph remains readable.'
  const html = await renderSfc('/src/platform/components/LiteratureDetailsModal.vue', {
    literature: {
      title: 'Refractory Materials Study',
      authors: 'Alice Chen; Bob Li',
      entry_type: 'journal',
      year: '2025',
      journal: 'Ceramics International',
      doi: '10.1000/example',
      volume: '12',
      number: '3',
      pages: '101-120',
      abstract,
      note: 'Expert reviewed',
      attachment: 'study.pdf',
    },
    typeOptions,
  })

  for (const value of [
    'Refractory Materials Study', 'Alice Chen; Bob Li', '期刊论文', '2025',
    'Ceramics International', '10.1000/example', '12', '3', '101-120',
    'First paragraph of a long abstract.', 'Second paragraph remains readable.',
    'Expert reviewed', 'PDF', '已上传', '关闭',
  ]) {
    assert.match(html, new RegExp(value))
  }
  assert.match(html, /literature-details-abstract/)
})

test('shows an em dash for empty fields instead of undefined or null', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureDetailsModal.vue', {
    literature: {
      title: '',
      authors: null,
      entry_type: undefined,
      year: '',
      journal: null,
      doi: undefined,
      volume: '',
      number: null,
      pages: undefined,
      abstract: '',
      note: null,
      attachment: '',
    },
    typeOptions,
  })

  assert.doesNotMatch(html, /undefined|null/)
  assert.ok((html.match(/—/g) || []).length >= 11)
  assert.match(html, /未上传/)
})
