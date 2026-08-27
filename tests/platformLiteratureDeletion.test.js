import test from 'node:test'
import assert from 'node:assert/strict'

import { deleteLiteratureWithAttachments } from '../src/platform/services/literatureDeletion.js'

const confirmationMessage = '删除文献后，将同时删除其关联附件，且无法恢复。确认删除吗？'

test('confirmed literature deletion removes its attachment before the record', async () => {
  const events = []
  const deleted = await deleteLiteratureWithAttachments(
    { lit_id: 'LIT000001', attachment: 'paper.pdf' },
    {
      confirmDelete: message => {
        events.push(`confirm:${message}`)
        return true
      },
      deleteAttachment: async litId => events.push(`attachment:${litId}`),
      deleteLiterature: async litId => events.push(`literature:${litId}`),
    },
  )

  assert.equal(deleted, true)
  assert.deepEqual(events, [
    `confirm:${confirmationMessage}`,
    'attachment:LIT000001',
    'literature:LIT000001',
  ])
})

test('literature without an attachment deletes only its record', async () => {
  const events = []
  const deleted = await deleteLiteratureWithAttachments(
    { lit_id: 'LIT000002', attachment: null },
    {
      confirmDelete: () => true,
      deleteAttachment: async () => events.push('unexpected attachment deletion'),
      deleteLiterature: async litId => events.push(`literature:${litId}`),
    },
  )

  assert.equal(deleted, true)
  assert.deepEqual(events, ['literature:LIT000002'])
})

test('cancelled confirmation leaves both attachment and literature untouched', async () => {
  const events = []
  const deleted = await deleteLiteratureWithAttachments(
    { lit_id: 'LIT000003', attachment: 'paper.pdf' },
    {
      confirmDelete: () => false,
      deleteAttachment: async () => events.push('attachment'),
      deleteLiterature: async () => events.push('literature'),
    },
  )

  assert.equal(deleted, false)
  assert.deepEqual(events, [])
})

test('attachment deletion failure stops before deleting the literature record', async () => {
  let literatureDeleted = false
  const attachmentError = new Error('GridFS 删除失败')

  await assert.rejects(
    deleteLiteratureWithAttachments(
      { lit_id: 'LIT000004', attachment: 'paper.pdf' },
      {
        confirmDelete: () => true,
        deleteAttachment: async () => { throw attachmentError },
        deleteLiterature: async () => { literatureDeleted = true },
      },
    ),
    attachmentError,
  )
  assert.equal(literatureDeleted, false)
})
