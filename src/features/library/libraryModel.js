function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function createLibraryFilters() {
  return {
    query: '',
    type: '',
    year: '',
    expertStatus: '',
    parsingStatus: '',
    language: ''
  }
}

export function filterDocuments(documents, filters = {}) {
  const query = normalize(filters.query)

  return documents.filter(document => {
    const searchable = [
      document.title,
      document.doi,
      document.journal,
      ...document.authors,
      ...document.keywords,
      ...document.tags
    ].map(normalize).join(' ')

    const matchesQuery = !query || searchable.includes(query)
    const matchesType = !filters.type || document.type === filters.type
    const matchesYear = !filters.year || String(document.year) === String(filters.year)
    const matchesExpert = !filters.expertStatus
      || (filters.expertStatus === 'selected' && document.expertSelected)
      || (filters.expertStatus === 'unselected' && !document.expertSelected)
    const matchesParsing = !filters.parsingStatus || document.parsingStatus === filters.parsingStatus
    const matchesLanguage = !filters.language || document.language === filters.language

    return matchesQuery
      && matchesType
      && matchesYear
      && matchesExpert
      && matchesParsing
      && matchesLanguage
  })
}

export function addDocumentToQa(documents, documentId) {
  return documents.map(document => (
    document.id === documentId
      ? { ...document, qaIndexed: true, statusLabel: '已索引' }
      : { ...document }
  ))
}
