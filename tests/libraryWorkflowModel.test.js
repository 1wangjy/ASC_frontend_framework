import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPdfLibrarySelection,
  reconcileSelectedDocumentIds,
  toggleSelectedDocumentId
} from '../src/features/library/libraryWorkflowModel.js'

const documents = [
  { id: 'row-1', fileId: 'file-1', filename: 'one.pdf', title: 'One' },
  { id: 'row-2', fileId: 'file-2', filename: 'two.pdf', title: 'Two' },
  { id: 'row-empty', fileId: '', filename: 'invalid.pdf', title: 'Invalid' }
]

test('toggles document selection without duplicates', () => {
  assert.deepEqual(toggleSelectedDocumentId([], 'row-1'), ['row-1'])
  assert.deepEqual(toggleSelectedDocumentId(['row-1'], 'row-1'), [])
  assert.deepEqual(toggleSelectedDocumentId(['row-1'], 'row-2'), ['row-1', 'row-2'])
})

test('removes selected rows that no longer exist after a backend refresh', () => {
  assert.deepEqual(
    reconcileSelectedDocumentIds(['row-1', 'removed', 'row-2'], documents),
    ['row-1', 'row-2']
  )
})

test('builds the graph handoff from backend file ids only', () => {
  assert.deepEqual(
    buildPdfLibrarySelection(documents, ['row-2', 'row-empty', 'missing']),
    {
      fileIds: ['file-2'],
      files: [{ file_id: 'file-2', filename: 'two.pdf', title: 'Two' }]
    }
  )
})
