export const LITERATURE_DELETE_CONFIRMATION = '删除文献后，将同时删除其关联附件，且无法恢复。确认删除吗？'

export async function deleteLiteratureWithAttachments(literature, {
  confirmDelete = globalThis.confirm,
  deleteAttachment,
  deleteLiterature,
}) {
  const litId = String(literature?.lit_id ?? '').trim()
  if (!litId) throw new Error('缺少文献 ID')

  if (!confirmDelete(LITERATURE_DELETE_CONFIRMATION)) return false

  if (literature.attachment) {
    await deleteAttachment(litId)
  }
  await deleteLiterature(litId)
  return true
}
