import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareDocumentsForGraph } from '../src/platform/services/graphDocumentBridge.js'

const literature = [
  { lit_id: 'LIT_A', title: 'Alpha', attachment: 'alpha.pdf', entry_type: 'journal' },
  { lit_id: 'LIT_B', title: 'Beta', attachment: 'beta.pdf', entry_type: 'book' },
]

test('prepares selected 3001 PDFs sequentially as the legacy 5001 document contract', async () => {
  const calls = []
  const progress = []

  const result = await prepareDocumentsForGraph(literature, {
    fetchAttachmentBlob: async (item) => {
      calls.push(`fetch:${item.lit_id}`)
      return new Blob([`pdf:${item.lit_id}`], { type: 'application/pdf' })
    },
    uploadPdfToLibrary: async (file, item) => {
      calls.push(`upload:${item.lit_id}:${file.name}`)
      return { file_id: `PDF_${item.lit_id}`, filename: file.name }
    },
    onProgress: (state) => progress.push(`${state.current}/${state.total}:${state.literature.lit_id}`),
  })

  assert.deepEqual(calls, [
    'fetch:LIT_A',
    'upload:LIT_A:alpha.pdf',
    'fetch:LIT_B',
    'upload:LIT_B:beta.pdf',
  ])
  assert.deepEqual(progress, ['1/2:LIT_A', '2/2:LIT_B'])
  assert.deepEqual(result.fileIds, ['PDF_LIT_A', 'PDF_LIT_B'])
  assert.deepEqual(result.documents.map(({ id, fileId, filename, title }) => ({ id, fileId, filename, title })), [
    { id: 'PDF_LIT_A', fileId: 'PDF_LIT_A', filename: 'alpha.pdf', title: 'Alpha' },
    { id: 'PDF_LIT_B', fileId: 'PDF_LIT_B', filename: 'beta.pdf', title: 'Beta' },
  ])
})

test('stops without uploading when the current 3001 attachment cannot be read', async () => {
  let uploadCount = 0

  await assert.rejects(
    prepareDocumentsForGraph([literature[0]], {
      fetchAttachmentBlob: async () => { throw new Error('GridFS unavailable') },
      uploadPdfToLibrary: async () => { uploadCount += 1 },
    }),
    /文献“Alpha”的附件获取失败/,
  )
  assert.equal(uploadCount, 0)
})

test('stops before handoff when 5001 does not return a usable file id', async () => {
  await assert.rejects(
    prepareDocumentsForGraph([literature[0]], {
      fetchAttachmentBlob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      uploadPdfToLibrary: async () => ({ filename: 'alpha.pdf' }),
    }),
    /文献“Alpha”上传至构图后端失败/,
  )
})
