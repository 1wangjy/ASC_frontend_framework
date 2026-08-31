import { create, remove, update } from '../api/newData.js'
import {
  extractAttachmentMetadata,
  testMongoDB,
  uploadAttachment,
} from '../api/attachment.js'
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
  extractAttachmentMetadata,
  extractPdfMetadata,
  reportMetadataError: ({ litId, error }) => {
    console.warn(
      `[literature import] remote metadata extraction failed for ${litId}:`,
      error?.message || error,
    )
  },
  updateLiterature: (litId, payload) => update('lit', litId, payload),
  removeLiterature: (litId) => remove('lit', litId),
}

const METADATA_FIELDS = [
  'title',
  'authors',
  'journal',
  'year',
  'pages',
  'doi',
  'abstract',
  'note',
  'entry_type',
]

function usableMetadata(value) {
  const source = value?.metadata || value || {}
  return Object.fromEntries(
    METADATA_FIELDS
      .filter((field) => source[field] !== null && source[field] !== undefined)
      .map((field) => [field, typeof source[field] === 'string' ? source[field].trim() : source[field]])
      .filter(([, fieldValue]) => fieldValue !== ''),
  )
}

async function extractRemoteMetadata(dependencies, litId) {
  try {
    const result = await dependencies.extractAttachmentMetadata(litId, {
      overwriteExisting: true,
    })
    return {
      metadata: usableMetadata(result),
      literature: result?.literature || null,
    }
  } catch (error) {
    dependencies.reportMetadataError?.({ litId, error })
    return { metadata: {}, literature: null }
  }
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
    entry_type: '',
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
  let persistedLiterature = null

  try {
    const remoteResult = await extractRemoteMetadata(dependencies, litId)
    metadata = remoteResult.metadata
    persistedLiterature = remoteResult.literature

    if (!Object.keys(metadata).length) {
      metadata = usableMetadata(await dependencies.extractPdfMetadata(file))
    }

    if (Object.keys(metadata).length) {
      if (!persistedLiterature?.lit_id) {
        await dependencies.updateLiterature(litId, metadata)
      }
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
      ...(persistedLiterature || {}),
      attachment: persistedLiterature?.attachment || attachment?.filename || created.attachment || '',
    },
    metadataApplied,
    degraded,
  }
}
