import test from 'node:test'
import assert from 'node:assert/strict'

import { toLiteraturePayload } from '../src/platform/api/newData.js'
import { getAttachmentUrl } from '../src/platform/api/attachment.js'

test('literature payload keeps supported SQLite fields and drops unsupported fields', () => {
  assert.deepEqual(toLiteraturePayload({
    title: 'Paper',
    authors: 'Author',
    journal: 'Journal',
    year: 2026,
    volume: '4',
    number: '2',
    pages: '1-8',
    doi: '10.1/test',
    abstract: 'Abstract',
    note: 'Note',
    entry_type: 'patent',
    keywords: 'unsupported',
    url: 'unsupported',
    attachment: 'unsupported.pdf',
  }), {
    title: 'Paper',
    authors: 'Author',
    journal: 'Journal',
    year: 2026,
    volume: '4',
    number: '2',
    pages: '1-8',
    doi: '10.1/test',
    abstract: 'Abstract',
    note: 'Note',
    entry_type: 'patent',
  })
})

test('attachment preview URL safely encodes the GridFS filename', () => {
  assert.equal(getAttachmentUrl('LIT 论文.pdf'), '/api/attachment/LIT%20%E8%AE%BA%E6%96%87.pdf')
})
