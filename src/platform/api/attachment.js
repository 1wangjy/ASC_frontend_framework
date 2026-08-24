import request from './request.js'
import { unwrapApiSuccess } from './request.js'

export function uploadAttachment(file, litId) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('litId', litId)
  return request.post('/api/attachment/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(unwrapApiSuccess)
}

export function removeAttachment(litId) {
  return request.delete(`/api/attachment/remove/${litId}`).then(() => undefined)
}

export function testMongoDB() {
  return request.get('/api/attachment/test')
    .then(unwrapApiSuccess)
    .catch((error) => {
      throw new Error(
        error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || '附件服务不可用',
      )
    })
}

export function getAttachmentUrl(filename) {
  return `/api/attachment/${encodeURIComponent(filename)}`
}
