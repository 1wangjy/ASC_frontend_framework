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

test('classifies a book from an ISBN when the title has no type keyword', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (Refractory Materials) /Subject (ISBN 978-7-111-12345-6) >> endobj'
  const file = new File([source], 'refractory-materials.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Refractory Materials',
    entry_type: 'book',
  })
})

test('uses an explicit XMP publication type before title guessing', async () => {
  const source = '%PDF-1.4\n<prism:publicationType>conference-paper</prism:publicationType>\n/Title (A Neutral Title)'
  const file = new File([source], 'neutral.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'A Neutral Title',
    entry_type: 'conference',
  })
})

test('classifies a patent from a publication number', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (Heat resistant composite) /Subject (CN115123456A) >> endobj'
  const file = new File([source], 'heat-resistant-composite.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Heat resistant composite',
    entry_type: 'patent',
  })
})

test('classifies a journal article from an ISSN', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (A Neutral Article) /Subject (ISSN 1234-5678) >> endobj'
  const file = new File([source], 'neutral.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'A Neutral Article',
    entry_type: 'journal',
  })
})

test('classifies a handbook from a strong filename signal', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (World Refractory Materials) >> endobj'
  const file = new File([source], '世界耐火材料企业手册.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'World Refractory Materials',
    entry_type: 'book',
  })
})

test('extracts the publication year from explicit XMP metadata', async () => {
  const source = '%PDF-1.4\n<prism:publicationDate>2021-04-16</prism:publicationDate>\n/Title (Refractory Research)'
  const file = new File([source], 'refractory-research.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Refractory Research',
    year: '2021',
  })
})

test('prefers a clear filename year over the later PDF creation date', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (Refractory Materials) /CreationDate (D:20240810153000+08\'00\') >> endobj'
  const file = new File([source], 'refractory-materials_2007.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Refractory Materials',
    year: '2007',
  })
})

test('does not mistake PDF creation timestamps for publication years', async () => {
  const source = '%PDF-1.4\n<xmp:CreateDate>2020-02-29T15:01:20+05:30</xmp:CreateDate>\n1 0 obj << /Title (Neutral Report) /CreationDate (D:20250918222013Z) >> endobj'
  const file = new File([source], 'neutral-report.pdf', { type: 'application/pdf' })

  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Neutral Report',
  })
})

test('extracts the year from the existing handbook filename pattern', async () => {
  const source = '%PDF-1.4\n'
  const file = new File(
    [source],
    '耐火材料手册_--_李红霞等主编_--_Bei_jing,_2007_--_北京_冶金工业出版社.pdf',
    { type: 'application/pdf' },
  )

  assert.deepEqual(await extractPdfMetadata(file), {
    entry_type: 'book',
    year: '2007',
  })
})
