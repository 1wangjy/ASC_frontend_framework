import service from './index.js'
import { buildApiUrl } from './runtime.js'
import { readBrowserStorageItem } from '../utils/browserStorage.js'

function currentUserId() {
  return encodeURIComponent(readBrowserStorageItem('nexus_user_id') || 'local-asc-analyst')
}

export function uploadPdfFiles(formData, onUploadProgress) {
  return service({
    url: '/api/pdf-library/files',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  })
}

export function listPdfFiles(params = {}) {
  return service({
    url: '/api/pdf-library/files',
    method: 'get',
    params
  })
}

export function deletePdfFile(fileId) {
  return service({
    url: `/api/pdf-library/files/${fileId}`,
    method: 'delete'
  })
}

export function getPdfPreviewUrl(fileId) {
  const user = currentUserId()
  return `${buildApiUrl(`/api/pdf-library/files/${fileId}/preview`)}?user=${user}`
}

export function getPdfDownloadUrl(fileId) {
  const user = currentUserId()
  return `${buildApiUrl(`/api/pdf-library/files/${fileId}/download`)}?user=${user}`
}
