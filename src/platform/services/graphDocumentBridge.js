import { uploadPdfFiles } from '../../api/pdfLibrary.js'
import { adaptPdfFile, uploadPdfDocuments } from '../../features/library/pdfLibraryAdapter.js'
import platformRequest from '../api/request.js'
import { normalizeLiteratureEntryType } from '../types/entities.js'
import { getAttachmentUrl } from '../api/attachment.js'

const CATEGORY_BY_ENTRY_TYPE = {
  journal: '期刊论文',
  conference: '会议论文',
  patent: '专利',
  book: '手册/图书',
}

function literatureLabel(literature = {}) {
  return String(literature.title || literature.attachment || literature.lit_id || '未命名文献').trim()
}

function bridgeError(message, cause) {
  const error = new Error(message)
  error.cause = cause
  return error
}

async function fetchCurrentAttachmentBlob(literature) {
  return platformRequest.get(getAttachmentUrl(literature.attachment), {
    responseType: 'blob',
  })
}

async function uploadCurrentPdfToLibrary(file, literature) {
  const result = await uploadPdfDocuments(uploadPdfFiles, [file], {
    category: CATEGORY_BY_ENTRY_TYPE[normalizeLiteratureEntryType(literature.entry_type)] || '未分类',
    description: `由数据平台文献 ${literature.lit_id || ''} 提供的本次构图输入副本`,
    // 溯源：让 5001 侧能按 DOI / 平台 file_id 回链到 MongoDB 原文
    doi: literature.doi || '',
    lit_id: literature.lit_id || '',
    platform_file_id: literature.file_id || '',
  })
  if (result.errors.length) {
    throw new Error(result.errors[0]?.error || result.errors[0]?.message || 'PDF 上传失败')
  }
  return result.uploadedFiles[0]
}

export async function prepareDocumentsForGraph(literature = [], dependencies = {}) {
  const selected = Array.isArray(literature) ? literature : []
  if (!selected.length) throw new Error('请至少选择一篇已上传附件的文献')

  const fetchAttachmentBlob = dependencies.fetchAttachmentBlob || fetchCurrentAttachmentBlob
  const uploadPdfToLibrary = dependencies.uploadPdfToLibrary || uploadCurrentPdfToLibrary
  const onProgress = dependencies.onProgress
  const documents = []

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index]
    const label = literatureLabel(item)
    const attachment = String(item?.attachment || '').trim()
    if (!attachment) throw new Error(`文献“${label}”未上传附件，无法用于构图`)

    onProgress?.({ current: index + 1, total: selected.length, literature: item })

    let blob
    try {
      blob = await fetchAttachmentBlob(item)
      if (!blob || Number(blob.size) <= 0) throw new Error('附件内容为空')
    } catch (error) {
      throw bridgeError(`文献“${label}”的附件获取失败，请重试`, error)
    }

    let record
    try {
      const file = new File([blob], attachment, { type: blob.type || 'application/pdf' })
      record = await uploadPdfToLibrary(file, item)
      const fileId = String(record?.file_id ?? record?.id ?? '').trim()
      if (!fileId) throw new Error('5001 未返回文件 ID')
    } catch (error) {
      throw bridgeError(`文献“${label}”上传至构图后端失败，请重试`, error)
    }

    documents.push({
      ...adaptPdfFile(record),
      title: String(item.title || record.filename || attachment).trim(),
    })
  }

  return {
    documents,
    fileIds: documents.map((document) => document.fileId),
  }
}
