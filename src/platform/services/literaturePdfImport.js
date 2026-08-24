import { create, remove, update } from '../api/newData.js'
import { testMongoDB, uploadAttachment } from '../api/attachment.js'
import {
  extractPdfMetadata,
  fallbackTitleFromFilename,
  validatePdfSelection,
} from '../utils/pdfMetadata.js'

const defaultDependencies = {
  validatePdfSelection,
  testMongoDB,
  createLiterature: (payload) => create('lit', payload),
  uploadAttachment,
  extractPdfMetadata,
  updateLiterature: (litId, payload) => update('lit', litId, payload),
  removeLiterature: (litId) => remove('lit', litId),
}

function minimalLiterature(file) {
  return {
    title: fallbackTitleFromFilename(file.name),
    authors: '',
    journal: '',
    year: '',
    volume: '',
    number: '',
    pages: '',
    doi: '',
    abstract: '',
    note: '',
    entry_type: 'journal',
  }
}

function errorMessage(error) {
  return error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || 'PDF 导入失败'
}

export async function importLiteraturePdf(file, options = {}) {
  const dependencies = { ...defaultDependencies, ...(options.dependencies || {}) }
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}

  onProgress('validating')
  await dependencies.validatePdfSelection(file)
  await dependencies.testMongoDB()

  onProgress('uploading')
  const created = await dependencies.createLiterature(minimalLiterature(file))
  const litId = created?.lit_id
  if (!litId) throw new Error('创建文献后未返回 lit_id')

  let attachment
  try {
    attachment = await dependencies.uploadAttachment(file, litId)
  } catch (uploadError) {
    try {
      await dependencies.removeLiterature(litId)
    } catch (rollbackError) {
      throw new Error(`${errorMessage(uploadError)}；临时文献清理失败：${errorMessage(rollbackError)}`)
    }
    throw uploadError
  }

  onProgress('parsing')
  let metadata = {}
  let metadataApplied = false
  let degraded = false

  try {
    metadata = await dependencies.extractPdfMetadata(file)
    if (Object.keys(metadata).length) {
      await dependencies.updateLiterature(litId, metadata)
      metadataApplied = true
    } else {
      degraded = true
    }
  } catch {
    metadata = {}
    degraded = true
  }

  onProgress('complete')
  return {
    literature: {
      ...created,
      ...metadata,
      attachment: attachment?.filename || created.attachment || '',
    },
    metadataApplied,
    degraded,
  }
}
