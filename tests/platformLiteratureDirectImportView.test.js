import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

test('renders PDF import as the main literature action without a metadata form', async () => {
  const html = await renderSfc('/src/platform/components/LiteraturePdfImportActions.vue')

  assert.match(html, /导入 PDF/)
  assert.match(html, /手动新增/)
  assert.match(html, /type="file"/)
  assert.match(html, /accept="\.pdf,application\/pdf"/)
  assert.doesNotMatch(html, /作者|期刊|DOI|摘要/)
})

test('disables import and exposes progress while a PDF is being imported', async () => {
  const html = await renderSfc('/src/platform/components/LiteraturePdfImportActions.vue', {
    busy: true,
    status: '正在解析文献信息…',
  })

  assert.match(html, /disabled/)
  assert.match(html, /正在解析文献信息…/)
  assert.match(html, /role="status"/)
})
