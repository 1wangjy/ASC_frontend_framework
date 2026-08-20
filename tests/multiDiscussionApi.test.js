import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createMultiDiscussionApi,
  resolveMultiDiscussionAssetUrl
} from '../src/features/qa/multiDiscussion/api.js'

function createRecorder() {
  const calls = []
  const client = config => {
    calls.push(config)
    return Promise.resolve(config)
  }
  return { calls, client }
}

test('sends JSON chat requests with the existing contract and timeout', async () => {
  const { calls, client } = createRecorder()
  const api = createMultiDiscussionApi(client)
  const data = {
    question: 'Q', project_id: 'p', graph_id: 'g', conversation_id: 'c', request_id: 'r',
    model_mode: 'fast', enable_multimodal_response: true,
    multimodal_render_mode: 'inline', options: { top_k: 3 }
  }
  await api.sendMultiDiscussionMessage(data)
  assert.deepEqual(calls[0], {
    url: '/api/multi-discussion/chat', method: 'post', data,
    timeout: 15 * 60 * 1000
  })
})

test('sends multipart chat requests with repeated images and string fields', async () => {
  const { calls, client } = createRecorder()
  const api = createMultiDiscussionApi(client)
  const image = new Blob(['image'], { type: 'image/png' })
  image.name = 'sem.png'
  await api.sendMultiDiscussionMessage({
    question: 'Q', project_id: 'p', graph_id: 'g', conversation_id: 'c', request_id: 'r',
    model_mode: 'fast', enable_multimodal_response: true,
    multimodal_render_mode: 'inline', options: { top_k: 3 }
  }, [image, image])
  const config = calls[0]
  assert.equal(config.url, '/api/multi-discussion/chat')
  assert.equal(config.method, 'post')
  assert.equal(config.timeout, 15 * 60 * 1000)
  assert.equal(config.headers['Content-Type'], 'multipart/form-data')
  assert.equal(config.data.get('question'), 'Q')
  assert.equal(config.data.get('project_id'), 'p')
  assert.equal(config.data.get('graph_id'), 'g')
  assert.equal(config.data.get('conversation_id'), 'c')
  assert.equal(config.data.get('request_id'), 'r')
  assert.equal(config.data.get('model_mode'), 'fast')
  assert.equal(config.data.get('enable_multimodal_response'), 'true')
  assert.equal(config.data.get('multimodal_render_mode'), 'inline')
  assert.deepEqual(JSON.parse(config.data.get('options')), { top_k: 3 })
  assert.equal(config.data.getAll('images').length, 2)
})

test('builds relative progress, conversation, and capability requests', async () => {
  const { calls, client } = createRecorder()
  const api = createMultiDiscussionApi(client)
  await api.getMultiDiscussionProgress('req/1')
  await api.getMultiDiscussionConversation('conv/1')
  await api.getMultiDiscussionCapabilities()
  assert.deepEqual(calls.map(({ url, method, timeout }) => ({ url, method, timeout })), [
    { url: '/api/multi-discussion/progress/req%2F1', method: 'get', timeout: 10 * 1000 },
    { url: '/api/multi-discussion/conversations/conv%2F1', method: 'get', timeout: undefined },
    { url: '/api/multi-discussion/capabilities', method: 'get', timeout: undefined }
  ])
})

test('resolves relative assets with the shared API URL helper and preserves absolute URLs', () => {
  assert.equal(resolveMultiDiscussionAssetUrl('/uploads/a.png', 'https://api.example.test/root'), 'https://api.example.test/root/uploads/a.png')
  for (const url of ['http://x.test/a', 'https://x.test/a', 'blob:x', 'data:image/png;base64,x']) {
    assert.equal(resolveMultiDiscussionAssetUrl(url, 'https://api.example.test'), url)
  }
})
