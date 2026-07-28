import service from './index'

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
  const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001'
  const user = encodeURIComponent(localStorage.getItem('nexus_user_id') || 'local-asc-analyst')
  return `${base}/api/pdf-library/files/${fileId}/preview?user=${user}`
}

export function getPdfDownloadUrl(fileId) {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001'
  const user = encodeURIComponent(localStorage.getItem('nexus_user_id') || 'local-asc-analyst')
  return `${base}/api/pdf-library/files/${fileId}/download?user=${user}`
}
