import test from 'node:test'
import assert from 'node:assert/strict'

import { importLiteraturePdf } from '../src/platform/services/literaturePdfImport.js'

function pdfFile(name = 'Fallback_Title.pdf') {
  return new File(['%PDF-1.4\n'], name, { type: 'application/pdf' })
}

function dependencies(overrides = {}) {
  return {
    validatePdfSelection: async () => {},
    testMongoDB: async () => {},
    createLiterature: async () => ({ lit_id: 'LIT_1' }),
    uploadAttachment: async () => ({ filename: 'Fallback_Title.pdf' }),
    extractPdfMetadata: async () => ({}),
    updateLiterature: async () => ({}),
    removeLiterature: async () => {},
    ...overrides,
  }
}

test('does not create a literature when attachment storage preflight fails', async () => {
  let createCount = 0
  const deps = dependencies({
    testMongoDB: async () => { throw new Error('MongoDB未连接') },
    createLiterature: async () => {
      createCount += 1
      return { lit_id: 'LIT_SHOULD_NOT_EXIST' }
    },
  })

  await assert.rejects(
    importLiteraturePdf(pdfFile(), { dependencies: deps }),
    /MongoDB未连接/,
  )
  assert.equal(createCount, 0)
})

test('creates, uploads, extracts and updates a literature in order', async () => {
  const events = []
  let createPayload
  let updatePayload
  const deps = dependencies({
    testMongoDB: async () => { events.push('health') },
    createLiterature: async (payload) => {
      events.push('create')
      createPayload = payload
      return { lit_id: 'LIT_1', ...payload }
    },
    uploadAttachment: async (file, litId) => {
      events.push(`upload:${litId}`)
      return { filename: file.name }
    },
    extractPdfMetadata: async () => {
      events.push('extract')
      return { title: 'Extracted title', authors: 'Alice' }
    },
    updateLiterature: async (litId, payload) => {
      events.push(`update:${litId}`)
      updatePayload = payload
      return { lit_id: litId, ...payload }
    },
  })

  const result = await importLiteraturePdf(pdfFile(), { dependencies: deps })

  assert.deepEqual(events, ['health', 'create', 'upload:LIT_1', 'extract', 'update:LIT_1'])
  assert.deepEqual(createPayload, {
    title: 'Fallback_Title',
    authors: '',
    journal: '',
    year: '',
    volume: '',
    number: '',
    pages: '',
    doi: '',
    abstract: '',
    note: '',
    entry_type: 'journal',
  })
  assert.deepEqual(updatePayload, { title: 'Extracted title', authors: 'Alice' })
  assert.equal(result.metadataApplied, true)
  assert.equal(result.degraded, false)
})

test('rolls back the temporary literature when PDF upload fails', async () => {
  const events = []
  const deps = dependencies({
    testMongoDB: async () => { events.push('health') },
    createLiterature: async () => {
      events.push('create')
      return { lit_id: 'LIT_1' }
    },
    uploadAttachment: async (file, litId) => {
      events.push(`upload:${litId}`)
      throw new Error('GridFS write failed')
    },
    removeLiterature: async (litId) => { events.push(`remove:${litId}`) },
  })

  await assert.rejects(
    importLiteraturePdf(pdfFile(), { dependencies: deps }),
    /GridFS write failed/,
  )
  assert.deepEqual(events, ['health', 'create', 'upload:LIT_1', 'remove:LIT_1'])
})

test('reports a cleanup warning when upload and rollback both fail', async () => {
  const deps = dependencies({
    uploadAttachment: async () => { throw new Error('GridFS write failed') },
    removeLiterature: async () => { throw new Error('SQLite cleanup failed') },
  })

  await assert.rejects(
    importLiteraturePdf(pdfFile(), { dependencies: deps }),
    /GridFS write failed.*临时文献清理失败.*SQLite cleanup failed/,
  )
})

test('keeps the uploaded literature when metadata extraction fails', async () => {
  let removeCount = 0
  const progress = []
  const deps = dependencies({
    extractPdfMetadata: async () => { throw new Error('metadata unreadable') },
    removeLiterature: async () => { removeCount += 1 },
  })

  const result = await importLiteraturePdf(pdfFile(), {
    dependencies: deps,
    onProgress: (stage) => progress.push(stage),
  })

  assert.equal(result.metadataApplied, false)
  assert.equal(result.degraded, true)
  assert.equal(removeCount, 0)
  assert.deepEqual(progress, ['validating', 'uploading', 'parsing', 'complete'])
})

test('keeps the uploaded literature when metadata update fails', async () => {
  let removeCount = 0
  const deps = dependencies({
    extractPdfMetadata: async () => ({ title: 'Extracted title' }),
    updateLiterature: async () => { throw new Error('SQLite update failed') },
    removeLiterature: async () => { removeCount += 1 },
  })

  const result = await importLiteraturePdf(pdfFile(), { dependencies: deps })

  assert.equal(result.metadataApplied, false)
  assert.equal(result.degraded, true)
  assert.equal(removeCount, 0)
})
