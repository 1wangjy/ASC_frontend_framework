function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function createLibraryFilters() {
  return {
    query: '',
    type: '',
    yearPartition: ''
  }
}

export function getYearPartitions(documents, visibleCount = 4) {
  const years = [...new Set(documents.map(document => Number(document.year)))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, visibleCount))

  return {
    years,
    olderBefore: years.at(-1) ?? null
  }
}

export function filterDocuments(documents, filters = {}) {
  const query = normalize(filters.query)

  return documents.filter(document => {
    const searchable = [
      document.title,
      document.doi,
      document.journal,
      document.abstract,
      ...document.authors,
      ...document.keywords,
      ...document.tags
    ].map(normalize).join(' ')

    const matchesQuery = !query || searchable.includes(query)
    const matchesType = !filters.type || document.type === filters.type
    const yearPartition = String(filters.yearPartition ?? '')
    const matchesYear = !yearPartition
      || (yearPartition.startsWith('older:')
        ? Number(document.year) < Number(yearPartition.split(':')[1])
        : String(document.year) === yearPartition)

    return matchesQuery
      && matchesType
      && matchesYear
  })
}

export function paginateDocuments(documents, requestedPage = 1, requestedPageSize = 20) {
  const pageSizes = [20, 50, 100]
  const pageSize = pageSizes.includes(Number(requestedPageSize))
    ? Number(requestedPageSize)
    : pageSizes[0]
  const pageCount = Math.max(1, Math.ceil(documents.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.trunc(Number(requestedPage)) || 1))
  const start = (page - 1) * pageSize

  return {
    items: documents.slice(start, start + pageSize),
    page,
    pageCount,
    pageSize,
    pageSizes,
    total: documents.length
  }
}

export function initialSelectedDocumentId(documents, compactView = false) {
  return compactView ? '' : (documents[0]?.id ?? '')
}

export function addDocumentToQa(documents, documentId) {
  return documents.map(document => (
    document.id === documentId
      ? { ...document, qaIndexed: true, statusLabel: '已索引' }
      : { ...document }
  ))
}
