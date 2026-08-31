const SEARCH_FIELDS = ['title', 'authors', 'journal', 'doi', 'abstract']

function normalizeLiteratureYear(value) {
  const normalizedYear = String(value ?? '').trim()
  return /^\d{4}$/.test(normalizedYear) ? normalizedYear : ''
}

export function getLiteratureEntryTypes(literature = [], defaultTypes = []) {
  const rows = Array.isArray(literature) ? literature : []
  const types = new Set()

  for (const value of [...defaultTypes, ...rows.map((item) => item?.entry_type)]) {
    const normalizedType = String(value ?? '').trim()
    if (normalizedType) types.add(normalizedType)
  }

  return [...types]
}

export function getLiteratureYears(literature = []) {
  const rows = Array.isArray(literature) ? literature : []
  const years = new Set(rows.map((item) => normalizeLiteratureYear(item?.year)).filter(Boolean))

  return [...years].sort((left, right) => Number(right) - Number(left))
}

export function filterLiteratureByQuery(literature = [], query = '', entryType = '', year = '') {
  const rows = Array.isArray(literature) ? literature : []
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase()
  const normalizedType = String(entryType ?? '').trim()
  const normalizedYear = normalizeLiteratureYear(year)

  return rows.filter((item) => {
    const matchesQuery = !normalizedQuery || SEARCH_FIELDS.some((field) => (
      String(item?.[field] ?? '').toLocaleLowerCase().includes(normalizedQuery)
    ))
    const matchesType = !normalizedType || String(item?.entry_type ?? '').trim() === normalizedType
    const matchesYear = !normalizedYear || normalizeLiteratureYear(item?.year) === normalizedYear

    return matchesQuery && matchesType && matchesYear
  })
}

export function paginateLiterature(literature = [], requestedPage = 1, requestedPageSize = 10) {
  const rows = Array.isArray(literature) ? literature : []
  const numericPageSize = Math.trunc(Number(requestedPageSize))
  const pageSize = numericPageSize > 0 ? numericPageSize : 10
  const totalItems = rows.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const numericPage = Math.trunc(Number(requestedPage)) || 1
  const currentPage = Math.min(totalPages, Math.max(1, numericPage))
  const start = (currentPage - 1) * pageSize

  return {
    items: rows.slice(start, start + pageSize),
    currentPage,
    pageSize,
    totalItems,
    totalPages,
  }
}
