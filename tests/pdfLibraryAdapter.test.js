import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptPdfFile,
  formatPdfUploadErrors,
  loadPdfDocuments,
  preservePdfRefreshError,
  removePdfDocument,
  uploadPdfDocuments
} from '../src/features/library/pdfLibraryAdapter.js'
import { getYearPartitions } from '../src/features/library/libraryModel.js'

test('maps backend PDF metadata into the existing document table model', () => {
  const document = adaptPdfFile({
    file_id: 'file-1',
    filename: 'ASC thermal shock.pdf',
    category: '期刊论文',
    description: '后端保存的文件说明',
    file_size: 2048,
    content_type: 'application/pdf',
    created_at: '2025-06-08T12:00:00Z'
  })

  assert.equal(document.id, 'file-1')
  assert.equal(document.title, 'ASC thermal shock.pdf')
  assert.equal(document.year, 2025)
  assert.equal(document.typeLabel, '期刊论文')
  assert.equal(document.abstract, '后端保存的文件说明')
  assert.deepEqual(document.authors, [])
  assert.deepEqual(document.tags, ['期刊论文'])
  assert.equal(document.fileSizeLabel, '2 KB')
})

test('loads and adapts the backend list response', async () => {
  const documents = await loadPdfDocuments(async () => ({
    success: true,
    data: [{ file_id: 'file-2', filename: 'paper.pdf', category: '未分类' }]
  }))

  assert.equal(documents.length, 1)
  assert.equal(documents[0].id, 'file-2')
  assert.deepEqual(getYearPartitions(documents), { years: [], olderBefore: null })
})

test('uploads actual files under the backend files field', async () => {
  const calls = []
  const files = [
    new File(['one'], 'one.pdf', { type: 'application/pdf' }),
    new File(['two'], 'two.pdf', { type: 'application/pdf' })
  ]

  await uploadPdfDocuments(async (formData) => {
    calls.push([...formData.entries()])
    return { success: true }
  }, files, { category: '本地测试', description: '测试上传' })

  assert.deepEqual(calls[0].filter(([key]) => key === 'files').map(([, file]) => file.name), ['one.pdf', 'two.pdf'])
  assert.equal(calls[0].find(([key]) => key === 'category')[1], '本地测试')
  assert.equal(calls[0].find(([key]) => key === 'description')[1], '测试上传')
})

test('deletes only the requested backend file id', async () => {
  const calls = []
  await removePdfDocument(async (fileId) => calls.push(fileId), 'file-9')
  assert.deepEqual(calls, ['file-9'])
})

test('preserves partial upload failures returned with HTTP 207', async () => {
  const files = [
    new File(['one'], 'one.pdf', { type: 'application/pdf' }),
    new File(['two'], 'two.pdf', { type: 'application/pdf' })
  ]
  const result = await uploadPdfDocuments(async () => ({
    success: true,
    data: [{ file_id: 'file-one', filename: 'one.pdf' }],
    errors: [{ filename: 'two.pdf', error: '文件损坏' }],
    message: '已上传 1 个文件，1 个失败'
  }), files)

  assert.equal(result.uploadedCount, 1)
  assert.deepEqual(result.errors, [{ filename: 'two.pdf', error: '文件损坏' }])
  assert.equal(formatPdfUploadErrors(result.errors), '部分文件上传失败：two.pdf（文件损坏）')
})

test('does not erase a list refresh error after a successful upload', () => {
  assert.equal(preservePdfRefreshError('列表刷新失败，请重试。', []), '列表刷新失败，请重试。')
  assert.equal(
    preservePdfRefreshError('列表刷新失败，请重试。', [{ filename: 'two.pdf', error: '文件损坏' }]),
    '部分文件上传失败：two.pdf（文件损坏）'
  )
})
