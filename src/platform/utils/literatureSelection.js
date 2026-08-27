function cloneSelection(selectedIds) {
  const values = selectedIds instanceof Set || Array.isArray(selectedIds) ? selectedIds : []
  return new Set([...values].map((value) => String(value ?? '').trim()).filter(Boolean))
}

function normalizedPageIds(currentPageIds) {
  return [...cloneSelection(currentPageIds)]
}

export function toggleLiteratureSelection(selectedIds, litId) {
  const next = cloneSelection(selectedIds)
  const normalizedId = String(litId ?? '').trim()
  if (!normalizedId) return next

  if (next.has(normalizedId)) next.delete(normalizedId)
  else next.add(normalizedId)
  return next
}

export function areAllCurrentPageLiteratureSelected(selectedIds, currentPageIds) {
  const selected = cloneSelection(selectedIds)
  const pageIds = normalizedPageIds(currentPageIds)
  return pageIds.length > 0 && pageIds.every((litId) => selected.has(litId))
}

export function toggleCurrentPageLiteratureSelection(selectedIds, currentPageIds) {
  const next = cloneSelection(selectedIds)
  const pageIds = normalizedPageIds(currentPageIds)
  const shouldCancel = areAllCurrentPageLiteratureSelected(next, pageIds)

  for (const litId of pageIds) {
    if (shouldCancel) next.delete(litId)
    else next.add(litId)
  }
  return next
}

export function removeLiteratureSelection(selectedIds, litId) {
  const next = cloneSelection(selectedIds)
  next.delete(String(litId ?? '').trim())
  return next
}

export function clearLiteratureSelection() {
  return new Set()
}
