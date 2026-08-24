import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractPdfMetadata,
  fallbackTitleFromFilename,
  validatePdfSelection,
} from '../src/platform/utils/pdfMetadata.js'

test('uses the PDF filename without its extension as the fallback title', () => {
  assert.equal(fallbackTitleFromFilename('A_review_of_rubber_materials.pdf'), 'A_review_of_rubber_materials')
  assert.equal(fallbackTitleFromFilename('Report.PDF'), 'Report')
})

test('rejects files that are not selected as PDFs', async () => {
  const textFile = new File(['plain text'], 'notes.txt', { type: 'text/plain' })

  await assert.rejects(validatePdfSelection(textFile), /请选择 PDF 文件/)
})

test('rejects a renamed non-PDF by its file signature', async () => {
  const renamedTextFile = new File(['plain text'], 'fake.pdf', { type: 'application/pdf' })

  await assert.rejects(validatePdfSelection(renamedTextFile), /文件不是有效的 PDF/)
})

test('extracts literal standard PDF title and author without guessing other fields', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (Rubber Study) /Author (Alice\\; Bob) /Subject (Do not map me) >> endobj'
  const file = new File([source], 'fallback.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Rubber Study',
    authors: 'Alice; Bob',
  })
})

test('decodes UTF-16BE hex metadata with a BOM', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title <FEFF6A6180F66587732E> >> endobj'
  const file = new File([source], 'fallback.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), { title: '橡胶文献' })
})
