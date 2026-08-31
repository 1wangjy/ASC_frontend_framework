import test from 'node:test'
import assert from 'node:assert/strict'

import {
  areAllCurrentPageLiteratureSelected,
  clearLiteratureSelection,
  removeLiteratureSelection,
  toggleCurrentPageLiteratureSelection,
  toggleLiteratureSelection,
} from '../src/platform/utils/literatureSelection.js'

test('toggles one literature by its stable lit_id', () => {
  const selected = toggleLiteratureSelection(new Set(), 'LIT_A')
  assert.deepEqual([...selected], ['LIT_A'])

  const cancelled = toggleLiteratureSelection(selected, 'LIT_A')
  assert.deepEqual([...cancelled], [])
  assert.deepEqual([...selected], ['LIT_A'])
})

test('selects and cancels only the current page while preserving other pages', () => {
  const selectedOnAnotherPage = new Set(['LIT_11'])
  const currentPageIds = ['LIT_1', 'LIT_2', 'LIT_3']

  const selected = toggleCurrentPageLiteratureSelection(selectedOnAnotherPage, currentPageIds)
  assert.deepEqual([...selected], ['LIT_11', 'LIT_1', 'LIT_2', 'LIT_3'])
  assert.equal(areAllCurrentPageLiteratureSelected(selected, currentPageIds), true)

  const cancelled = toggleCurrentPageLiteratureSelection(selected, currentPageIds)
  assert.deepEqual([...cancelled], ['LIT_11'])
  assert.equal(areAllCurrentPageLiteratureSelected(cancelled, currentPageIds), false)
})

test('clears every selection and removes a deleted literature safely', () => {
  const selected = new Set(['LIT_A', 'LIT_B'])

  assert.deepEqual([...removeLiteratureSelection(selected, 'LIT_A')], ['LIT_B'])
  assert.deepEqual([...clearLiteratureSelection()], [])
  assert.deepEqual([...selected], ['LIT_A', 'LIT_B'])
})
