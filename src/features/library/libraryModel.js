function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function summarizeAuthors(authors = [], visibleCount = 2) {
  const normalizedAuthors = Array.isArray(authors)
    ? authors.map(author => String(author ?? '').trim()).filter(Boolean)
    : []
  const limit = Math.max(1, Math.trunc(Number(visibleCount)) || 2)

  return normalizedAuthors.slice(0, limit).join(', ')
}

export function createLibraryFilters() {
  return {
    query: '',
    type: '',
    yearPartitions: []
  }
}

export function toggleYearPartition(selected = [], partition) {
  const normalized = String(partition ?? '')
  if (!normalized) return [...selected]

  return selected.includes(normalized)
    ? selected.filter(item => item !== normalized)
    : [...selected, normalized]
}

export function calculateLibraryMetrics(documents = []) {
  const academicPapers = documents.filter(document => (
    document.type === 'journal' || document.type === 'conference'
  )).length

  return {
    total: documents.length,
    expertSelected: documents.filter(document => document.expertSelected).length,
    academicPapers,
    professionalResources: documents.length - academicPapers
  }
}

export function getYearPartitions(documents, visibleCount = 4) {
  const years = [...new Set(documents
    .filter(document => document.year !== null && document.year !== undefined && document.year !== '')
    .map(document => Number(document.year)))]
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
    const yearPartitions = Array.isArray(filters.yearPartitions)
      ? filters.yearPartitions.map(String)
      : []
    const matchesYear = yearPartitions.length === 0
      || yearPartitions.some(partition => (
        partition.startsWith('older:')
          ? Number(document.year) < Number(partition.split(':')[1])
          : String(document.year) === partition
      ))

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

export function reconcileSelectedDocumentId(
  documents,
  currentDocumentId,
  compactView = false
) {
  const currentExists = documents.some(document => document.id === currentDocumentId)
  if (currentExists) return currentDocumentId

  return compactView ? '' : (documents[0]?.id ?? '')
}

export function addDocumentToQa(documents, documentId) {
  return documents.map(document => (
    document.id === documentId
      ? { ...document, qaIndexed: true }
      : { ...document }
  ))
}
