const CATEGORY_TYPES = {
  期刊论文: 'journal',
  会议论文: 'conference',
  '手册/图书': 'book',
  专利: 'patent'
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

function yearFromDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.getUTCFullYear() : null
}

export function adaptPdfFile(file = {}) {
  // 兼容后端可能返回的多种字段名
  const fileId = String(file.file_id ?? file.id ?? '').trim()
  const filename = String(file.filename ?? file.name ?? file.file_name ?? '').trim() || '未命名 PDF'
  const category = String(file.category ?? '').trim() || '未分类'
  const createdAt = file.created_at ?? file.createdAt ?? file.upload_time ?? ''

  return {
    id: fileId,
    fileId,
    filename,
    title: filename,
    doi: '—',
    authors: [],
    year: yearFromDate(createdAt),
    type: CATEGORY_TYPES[category] || 'pdf',
    typeLabel: category === '未分类' ? 'PDF 文献' : category,
    journal: `后端 PDF 文件 · ${formatBytes(file.file_size)}`,
    volume: '',
    issue: '',
    pages: '',
    language: '',
    keywords: [],
    tags: [category],
    expertSelected: false,
    parsingStatus: 'uploaded',
    qaIndexed: false,
    citationCount: 0,
    knowledgeLevel: 'PDF 文件库',
    abstract: String(file.description ?? '').trim() || '该文件暂未填写说明。',
    chunk: '',
    category,
    contentType: file.content_type || 'application/pdf',
    fileSize: Number(file.file_size) || 0,
    fileSizeLabel: formatBytes(file.file_size),
    createdAt: createdAt,
    updatedAt: file.updated_at ?? file.updatedAt ?? ''
  }
}

function filesFromResponse(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.data?.data)) return response.data.data
  if (Array.isArray(response?.data?.files)) return response.data.files
  if (Array.isArray(response?.files)) return response.files
  if (Array.isArray(response?.data?.items)) return response.data.items
  return []
}

export async function loadPdfDocuments(listPdfFiles, params = {}) {
  const response = await listPdfFiles(params)
  return filesFromResponse(response).map(adaptPdfFile).filter((document) => document.id)
}

export async function uploadPdfDocuments(uploadPdfFiles, files = [], metadata = {}) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  if (metadata.category) formData.append('category', metadata.category)
  if (metadata.description) formData.append('description', metadata.description)

  const response = await uploadPdfFiles(formData)
  const result = response?.data && !Array.isArray(response.data)
    && (response.data.success !== undefined || response.data.errors !== undefined)
    ? response.data
    : response

  return {
    response,
    uploadedCount: Array.isArray(result?.data) ? result.data.length : 0,
    errors: Array.isArray(result?.errors) ? result.errors : [],
    message: String(result?.message ?? '').trim()
  }
}

export function formatPdfUploadErrors(errors = []) {
  const details = errors.map((item) => {
    const filename = String(item?.filename ?? item?.file ?? '未知文件').trim()
    const reason = String(item?.error ?? item?.message ?? '上传失败').trim()
    return `${filename}（${reason}）`
  }).join('；')

  return details ? `部分文件上传失败：${details}` : ''
}

export function preservePdfRefreshError(currentError = '', uploadErrors = []) {
  return uploadErrors.length
    ? formatPdfUploadErrors(uploadErrors)
    : String(currentError ?? '')
}

export async function removePdfDocument(deletePdfFile, fileId) {
  if (!fileId) return null
  return deletePdfFile(fileId)
}
