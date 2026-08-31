import test from 'node:test'
import assert from 'node:assert/strict'

import * as literatureSearch from '../src/platform/utils/literatureSearch.js'

const {
  filterLiteratureByQuery,
  getLiteratureEntryTypes,
} = literatureSearch

const literature = [
  {
    lit_id: 'LIT_HIDDEN_RUBBER',
    title: 'Refractory corrosion study',
    authors: 'Alice Chen',
    journal: 'Ceramics International',
    doi: '10.1000/ABC-123',
    abstract: null,
    attachment: 'rubber-only-in-filename.pdf',
    entry_type: 'journal',
    year: 2025,
  },
  {
    lit_id: 'LIT_2',
    title: 'Rubber composites',
    authors: undefined,
    journal: 'Polymer Letters',
    doi: null,
    abstract: 'Thermal response of elastomers',
    entry_type: 'patent',
    year: '2024',
  },
]

test('searches only supported literature fields with case-insensitive partial matching', () => {
  assert.deepEqual(filterLiteratureByQuery(literature, 'RUBber'), [literature[1]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'alice'), [literature[0]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'ceramics'), [literature[0]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'abc-12'), [literature[0]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'elastomer'), [literature[1]])
})

test('empty search restores all literature and null fields are safe', () => {
  assert.deepEqual(filterLiteratureByQuery(literature, '  '), literature)
  assert.deepEqual(filterLiteratureByQuery(literature, 'not-present'), [])
})

test('combines entry type filtering with the existing search query', () => {
  assert.deepEqual(filterLiteratureByQuery(literature, '', 'patent'), [literature[1]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'rubber', 'patent'), [literature[1]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'rubber', 'journal'), [])
  assert.deepEqual(filterLiteratureByQuery(literature, 'alice', ''), [literature[0]])
})

test('keeps standard type choices and appends actual custom entry types safely', () => {
  const rows = [
    ...literature,
    { entry_type: 'thesis' },
    { entry_type: ' thesis ' },
    { entry_type: null },
    { entry_type: undefined },
    { entry_type: '' },
  ]

  assert.deepEqual(
    getLiteratureEntryTypes(rows, ['journal', 'conference', 'patent', 'book']),
    ['journal', 'conference', 'patent', 'book', 'thesis'],
  )
})

test('builds unique valid literature years in descending order', () => {
  assert.equal(typeof literatureSearch.getLiteratureYears, 'function')
  assert.deepEqual(literatureSearch.getLiteratureYears([
    ...literature,
    { year: '2026' },
    { year: ' 2025 ' },
    { year: null },
    { year: undefined },
    { year: '' },
    { year: 'unknown' },
    { year: '2025.5' },
  ]), ['2026', '2025', '2024'])
})

test('combines search, entry type and normalized year filtering', () => {
  assert.deepEqual(filterLiteratureByQuery(literature, 'rubber', 'patent', '2024'), [literature[1]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'rubber', 'patent', 2024), [literature[1]])
  assert.deepEqual(filterLiteratureByQuery(literature, 'rubber', 'patent', '2025'), [])
  assert.deepEqual(filterLiteratureByQuery(literature, 'alice', 'journal', '2025'), [literature[0]])
  assert.deepEqual(filterLiteratureByQuery(literature, '', '', ''), literature)
})

test('paginates literature with a default page size of ten and safe page bounds', () => {
  assert.equal(typeof literatureSearch.paginateLiterature, 'function')
  const rows = Array.from({ length: 23 }, (_, index) => ({ lit_id: `LIT_${index + 1}` }))

  const secondPage = literatureSearch.paginateLiterature(rows, 2)
  assert.deepEqual(secondPage.items.map((item) => item.lit_id), [
    'LIT_11', 'LIT_12', 'LIT_13', 'LIT_14', 'LIT_15',
    'LIT_16', 'LIT_17', 'LIT_18', 'LIT_19', 'LIT_20',
  ])
  assert.deepEqual({
    currentPage: secondPage.currentPage,
    pageSize: secondPage.pageSize,
    totalItems: secondPage.totalItems,
    totalPages: secondPage.totalPages,
  }, {
    currentPage: 2,
    pageSize: 10,
    totalItems: 23,
    totalPages: 3,
  })

  const clampedPage = literatureSearch.paginateLiterature(rows, 99)
  assert.equal(clampedPage.currentPage, 3)
  assert.deepEqual(clampedPage.items.map((item) => item.lit_id), ['LIT_21', 'LIT_22', 'LIT_23'])
})

test('filters the complete result set before applying pagination', () => {
  assert.equal(typeof literatureSearch.paginateLiterature, 'function')
  const matchingRows = Array.from({ length: 15 }, (_, index) => ({
    lit_id: `MATCH_${index + 1}`,
    title: `Rubber study ${index + 1}`,
    entry_type: 'journal',
    year: '2025',
  }))
  const otherRows = Array.from({ length: 5 }, (_, index) => ({
    lit_id: `OTHER_${index + 1}`,
    title: `Ceramic study ${index + 1}`,
    entry_type: 'patent',
    year: '2024',
  }))

  const filtered = filterLiteratureByQuery(
    [...matchingRows, ...otherRows],
    'rubber',
    'journal',
    '2025',
  )
  const secondPage = literatureSearch.paginateLiterature(filtered, 2)

  assert.equal(secondPage.totalItems, 15)
  assert.deepEqual(secondPage.items.map((item) => item.lit_id), [
    'MATCH_11', 'MATCH_12', 'MATCH_13', 'MATCH_14', 'MATCH_15',
  ])
})
