export const multiDiscussionStorageKey = graphId => (
  `nexus_multi_discussion_v1:${String(graphId || '').trim() || 'none'}`
)

export function readSavedMultiDiscussion(storage, graphId) {
  if (!storage?.getItem || !String(graphId || '').trim()) return null
  try {
    const value = JSON.parse(storage.getItem(multiDiscussionStorageKey(graphId)) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function hasSavedMultiDiscussion(storage, graphId) {
  const saved = readSavedMultiDiscussion(storage, graphId)
  return Boolean(
    String(saved?.conversationId || '').trim()
    && Array.isArray(saved?.messages)
    && saved.messages.length
  )
}

export function clearSavedMultiDiscussion(storage, graphId) {
  if (!storage?.removeItem || !String(graphId || '').trim()) return
  try {
    storage.removeItem(multiDiscussionStorageKey(graphId))
  } catch {
    // Conversation memory is optional and must never block a new discussion.
  }
}

export function shouldLockMultiDiscussionNavigation(mode, sending) {
  return mode === 'multi' && sending === true
}
