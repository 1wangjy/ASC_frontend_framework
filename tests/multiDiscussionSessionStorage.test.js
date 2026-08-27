import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearSavedMultiDiscussion,
  hasSavedMultiDiscussion,
  multiDiscussionStorageKey,
  readSavedMultiDiscussion,
  shouldLockMultiDiscussionNavigation
} from '../src/features/qa/multiDiscussion/sessionStorage.js'

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries))
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
}

test('recognizes saved multi-turn history only for its graph project', () => {
  const storage = createStorage({
    [multiDiscussionStorageKey('graph-a')]: JSON.stringify({
      conversationId: 'md_graph_a',
      messages: [
        { role: 'user', content: '图谱 A 的问题' },
        { role: 'assistant', content: '图谱 A 的回答' }
      ]
    })
  })

  assert.equal(hasSavedMultiDiscussion(storage, 'graph-a'), true)
  assert.equal(hasSavedMultiDiscussion(storage, 'graph-b'), false)
  assert.equal(readSavedMultiDiscussion(storage, 'graph-a').conversationId, 'md_graph_a')
})

test('does not restore empty or damaged multi-turn records', () => {
  const storage = createStorage({
    [multiDiscussionStorageKey('empty')]: JSON.stringify({ conversationId: '', messages: [] }),
    [multiDiscussionStorageKey('damaged')]: '{bad json'
  })

  assert.equal(hasSavedMultiDiscussion(storage, 'empty'), false)
  assert.equal(hasSavedMultiDiscussion(storage, 'damaged'), false)
  assert.equal(hasSavedMultiDiscussion({ getItem() { throw new Error('blocked') } }, 'graph-a'), false)
})

test('new multi-turn question clears only the selected graph history', () => {
  const storage = createStorage({
    [multiDiscussionStorageKey('graph-a')]: JSON.stringify({
      conversationId: 'md_a', messages: [{ role: 'user', content: 'A' }]
    }),
    [multiDiscussionStorageKey('graph-b')]: JSON.stringify({
      conversationId: 'md_b', messages: [{ role: 'user', content: 'B' }]
    })
  })

  clearSavedMultiDiscussion(storage, 'graph-a')

  assert.equal(hasSavedMultiDiscussion(storage, 'graph-a'), false)
  assert.equal(hasSavedMultiDiscussion(storage, 'graph-b'), true)
})

test('locks project changes only while a multi-turn answer is running', () => {
  assert.equal(shouldLockMultiDiscussionNavigation('multi', true), true)
  assert.equal(shouldLockMultiDiscussionNavigation('multi', false), false)
  assert.equal(shouldLockMultiDiscussionNavigation('single', true), false)
})
