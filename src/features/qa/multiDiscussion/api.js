import service from '../../../api/index.js'
import { buildApiUrl } from '../../../api/runtime.js'

export function createMultiDiscussionApi(client = service) {
  function sendMultiDiscussionMessage(data, images = []) {
    let requestData = data
    if (images.length) {
      const formData = new FormData()
      formData.append('question', data.question || '')
      formData.append('project_id', data.project_id || '')
      formData.append('graph_id', data.graph_id || '')
      if (data.conversation_id) formData.append('conversation_id', data.conversation_id)
      if (data.request_id) formData.append('request_id', data.request_id)
      if (data.model_mode) formData.append('model_mode', data.model_mode)
      formData.append(
        'enable_multimodal_response',
        data.enable_multimodal_response === true ? 'true' : 'false'
      )
      formData.append(
        'multimodal_render_mode',
        data.multimodal_render_mode || 'evidence_section'
      )
      formData.append('options', JSON.stringify(data.options || {}))
      images.forEach(image => formData.append('images', image, image.name))
      requestData = formData
    }
    return client({
      url: '/api/multi-discussion/chat',
      method: 'post',
      data: requestData,
      ...(images.length ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
      timeout: 15 * 60 * 1000
    })
  }

  function getMultiDiscussionProgress(requestId) {
    return client({
      url: `/api/multi-discussion/progress/${encodeURIComponent(requestId)}`,
      method: 'get',
      timeout: 10 * 1000
    })
  }

  function getMultiDiscussionConversation(conversationId) {
    return client({
      url: `/api/multi-discussion/conversations/${encodeURIComponent(conversationId)}`,
      method: 'get'
    })
  }

  function getMultiDiscussionCapabilities() {
    return client({
      url: '/api/multi-discussion/capabilities',
      method: 'get'
    })
  }

  return {
    sendMultiDiscussionMessage,
    getMultiDiscussionProgress,
    getMultiDiscussionConversation,
    getMultiDiscussionCapabilities
  }
}

export const {
  sendMultiDiscussionMessage,
  getMultiDiscussionProgress,
  getMultiDiscussionConversation,
  getMultiDiscussionCapabilities
} = createMultiDiscussionApi()

export function resolveMultiDiscussionAssetUrl(path, base) {
  if (!path || /^(?:https?:|blob:|data:)/i.test(path)) return path || ''
  return buildApiUrl(path, base)
}
