import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

test('literature without an attachment shows the upload action', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureAttachmentActions.vue', {
    literature: { lit_id: 'LIT000001', attachment: null },
  })

  assert.match(html, /未上传 PDF/)
  assert.match(html, /上传 PDF/)
  assert.doesNotMatch(html, /预览 PDF/)
})

test('literature with an attachment shows an encoded preview link only', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureAttachmentActions.vue', {
    literature: { lit_id: 'LIT000001', attachment: 'LIT 论文.pdf' },
  })

  assert.match(html, /预览 PDF/)
  assert.match(html, /\/api\/attachment\/LIT%20%E8%AE%BA%E6%96%87\.pdf/)
  assert.doesNotMatch(html, /未上传 PDF|下载 PDF|删除附件/)
})
