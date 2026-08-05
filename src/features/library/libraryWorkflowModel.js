function normalizedIds(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
  )]
}

export function toggleSelectedDocumentId(selectedIds = [], documentId) {
  const ids = normalizedIds(selectedIds)
  const id = String(documentId ?? '').trim()
  if (!id) return ids

  return ids.includes(id)
    ? ids.filter(value => value !== id)
    : [...ids, id]
}

export function reconcileSelectedDocumentIds(selectedIds = [], documents = []) {
  const available = new Set(
    (Array.isArray(documents) ? documents : [])
      .map(document => String(document?.id ?? '').trim())
      .filter(Boolean)
  )
  return normalizedIds(selectedIds).filter(id => available.has(id))
}

export function buildPdfLibrarySelection(documents = [], selectedIds = []) {
  const selected = new Set(normalizedIds(selectedIds))
  const files = (Array.isArray(documents) ? documents : [])
    .filter(document => selected.has(String(document?.id ?? '').trim()))
    .map(document => ({
      file_id: String(document?.fileId ?? '').trim(),
      filename: String(document?.filename ?? '').trim(),
      title: String(document?.title ?? '').trim()
    }))
    .filter(file => file.file_id)

  return {
    fileIds: files.map(file => file.file_id),
    files
  }
}
