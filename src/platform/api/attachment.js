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

export function extractAttachmentMetadata(litId, options = {}) {
  return request.post(`/api/attachment/metadata/${encodeURIComponent(litId)}`, {
    overwriteExisting: options.overwriteExisting === true,
  }, {
    timeout: 630000,
  }).then(unwrapApiSuccess)
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

export async function downloadAttachment(filename, browser = globalThis) {
  const attachmentFilename = String(filename ?? '').trim()
  if (!attachmentFilename) {
    throw new Error('附件文件名不能为空')
  }

  const blob = await request.get(getAttachmentUrl(attachmentFilename), {
    responseType: 'blob',
  })
  const downloadFilename = attachmentFilename.toLowerCase().endsWith('.pdf')
    ? attachmentFilename
    : `${attachmentFilename}.pdf`
  const objectUrl = browser.URL.createObjectURL(blob)
  const link = browser.document.createElement('a')

  link.href = objectUrl
  link.download = downloadFilename
  browser.document.body.appendChild(link)

  try {
    link.click()
  } finally {
    link.remove()
    browser.URL.revokeObjectURL(objectUrl)
  }

  return downloadFilename
}
