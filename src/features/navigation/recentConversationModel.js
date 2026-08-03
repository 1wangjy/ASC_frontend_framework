export const DEFAULT_VISIBLE_CONVERSATIONS = 3

export function getVisibleRecentConversations(
  conversations = [],
  expanded = false,
  limit = DEFAULT_VISIBLE_CONVERSATIONS
) {
  return expanded ? [...conversations] : conversations.slice(0, limit)
}

export function findRecentConversation(conversations = [], conversationId = '') {
  return conversations.find(conversation => conversation.id === conversationId) ?? null
}
