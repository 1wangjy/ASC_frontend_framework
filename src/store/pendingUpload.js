/**
 * 临时存储待上传的文件和查询 Prompt
 * 用于首页点击启动引擎后立即跳转，在Process页面再进行API调用
 */
import { reactive } from 'vue'

const state = reactive({
  files: [],
  filesByStage: {
    base: [],
    professional: []
  },
  queryPrompt: '',
  simulationRequirement: '',
  focusEntities: '',
  focusEvents: '',
  dataType: 'markdown',
  buildStage: 'base',
  sourceCorpusType: 'survey',
  baseMetadataPath: '',
  baseProjectId: '',
  pdfLibraryFileIds: [],
  pdfLibraryFiles: [],
  isPending: false
})

export function setPendingUpload(files, queryPrompt, focusEntities = '', focusEvents = '', options = {}) {
  state.files = files
  state.filesByStage = {
    base: options.filesByStage?.base || (options.buildStage === 'base' ? files : []),
    professional: options.filesByStage?.professional || (options.buildStage === 'professional' ? files : [])
  }
  state.queryPrompt = queryPrompt
  state.simulationRequirement = queryPrompt
  state.focusEntities = focusEntities
  state.focusEvents = focusEvents
  state.dataType = options.dataType || 'markdown'
  state.buildStage = options.buildStage || 'base'
  state.sourceCorpusType = options.sourceCorpusType || (state.buildStage === 'professional' ? 'research' : 'survey')
  state.baseMetadataPath = options.baseMetadataPath || ''
  state.baseProjectId = options.baseProjectId || ''
  state.pdfLibraryFileIds = options.pdfLibraryFileIds || []
  state.pdfLibraryFiles = options.pdfLibraryFiles || []
  state.isPending = true
}

export function getPendingUpload() {
  return {
    files: state.files,
    filesByStage: state.filesByStage,
    queryPrompt: state.queryPrompt,
    simulationRequirement: state.simulationRequirement,
    focusEntities: state.focusEntities,
    focusEvents: state.focusEvents,
    dataType: state.dataType,
    buildStage: state.buildStage,
    sourceCorpusType: state.sourceCorpusType,
    baseMetadataPath: state.baseMetadataPath,
    baseProjectId: state.baseProjectId,
    pdfLibraryFileIds: state.pdfLibraryFileIds,
    pdfLibraryFiles: state.pdfLibraryFiles,
    isPending: state.isPending
  }
}

export function clearPendingUpload() {
  state.files = []
  state.filesByStage = {
    base: [],
    professional: []
  }
  state.queryPrompt = ''
  state.simulationRequirement = ''
  state.focusEntities = ''
  state.focusEvents = ''
  state.dataType = 'markdown'
  state.buildStage = 'base'
  state.sourceCorpusType = 'survey'
  state.baseMetadataPath = ''
  state.baseProjectId = ''
  state.pdfLibraryFileIds = []
  state.pdfLibraryFiles = []
  state.isPending = false
}

export default state
