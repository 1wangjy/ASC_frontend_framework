import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIT_TYPE_OPTIONS,
  literatureTypeLabel,
  normalizeLiteratureEntryType,
} from '../src/platform/types/entities.js'
import { filterLiteratureByQuery, getLiteratureEntryTypes } from '../src/platform/utils/literatureSearch.js'

const CANONICAL = LIT_TYPE_OPTIONS.map((option) => option.value)

test('legacy BibTeX types fold onto the canonical vocabulary', () => {
  assert.equal(normalizeLiteratureEntryType('article'), 'journal')
  assert.equal(normalizeLiteratureEntryType('InProceedings'), 'conference')
  assert.equal(normalizeLiteratureEntryType('Journal-Article'), 'journal')
  assert.equal(normalizeLiteratureEntryType('  book '), 'book')
  assert.equal(normalizeLiteratureEntryType('incollection'), 'book')
  assert.equal(normalizeLiteratureEntryType(''), '')
  assert.equal(normalizeLiteratureEntryType('misc'), '')
})

test('type labels are the canonical Chinese labels, never the raw imported value', () => {
  assert.equal(literatureTypeLabel('journal'), '期刊论文')
  assert.equal(literatureTypeLabel('article'), '期刊论文')
  assert.equal(literatureTypeLabel('inproceedings'), '会议论文')
  assert.equal(literatureTypeLabel('book'), '书籍')
  assert.equal(literatureTypeLabel(''), '')
})

test('the by-type rail lists one entry per concept even when stored values are mixed', () => {
  const rows = [
    { entry_type: 'journal', title: 'a' },
    { entry_type: 'article', title: 'b' },
    { entry_type: 'inproceedings', title: 'c' },
    { entry_type: 'conference', title: 'd' },
    { entry_type: '', title: 'e' },
  ]

  const types = getLiteratureEntryTypes(rows, CANONICAL)

  assert.deepEqual(types, CANONICAL)
  assert.equal(types.filter((type) => type === 'journal').length, 1)
  assert.equal(types.filter((type) => type === 'conference').length, 1)
})

test('filtering by a canonical type still matches rows stored with legacy values', () => {
  const rows = [
    { entry_type: 'journal', title: 'a', year: '2020' },
    { entry_type: 'article', title: 'b', year: '2020' },
    { entry_type: 'inproceedings', title: 'c', year: '2021' },
    { entry_type: '', title: 'd', year: '2021' },
  ]

  assert.deepEqual(filterLiteratureByQuery(rows, '', 'journal', '').map((row) => row.title), ['a', 'b'])
  assert.deepEqual(filterLiteratureByQuery(rows, '', 'conference', '').map((row) => row.title), ['c'])
  assert.deepEqual(filterLiteratureByQuery(rows, '', 'article', '').map((row) => row.title), ['a', 'b'])
  assert.deepEqual(filterLiteratureByQuery(rows, '', '', '2021').map((row) => row.title), ['c', 'd'])
  assert.deepEqual(filterLiteratureByQuery(rows, '', 'book', ''), [])
})
