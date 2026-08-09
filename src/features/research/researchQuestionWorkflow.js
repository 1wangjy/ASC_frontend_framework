import { buildPdfLibrarySelection } from '../library/libraryWorkflowModel.js'
import { setPendingUpload } from '../../store/pendingUpload.js'

const REQUIRED_RESEARCH_QUESTION_ERROR = '请先填写研究问题。'

export function normalizeResearchQuestion(value) {
  return String(value || '').trim()
}

export function createResearchBuildIntent(documents, selectedIds, question) {
  const selection = buildPdfLibrarySelection(documents, selectedIds)
  const queryPrompt = normalizeResearchQuestion(question)

  return {
    ...selection,
    queryPrompt,
    canStart: Boolean(queryPrompt),
    error: queryPrompt ? '' : REQUIRED_RESEARCH_QUESTION_ERROR
  }
}

export function startResearchBuildFromLibrary(documents, selectedIds, question) {
  const intent = createResearchBuildIntent(documents, selectedIds, question)
  if (!intent.canStart || !intent.fileIds.length) return intent

  setPendingUpload([], intent.queryPrompt, '', '', {
    dataType: 'pdf_library',
    buildStage: 'base',
    sourceCorpusType: 'survey',
    pdfLibraryFileIds: intent.fileIds,
    pdfLibraryFiles: intent.files
  })
  return intent
}

export function validateResearchQuestionDialogSubmission(value) {
  const question = normalizeResearchQuestion(value)
  return {
    canSubmit: Boolean(question),
    question,
    error: question ? '' : REQUIRED_RESEARCH_QUESTION_ERROR
  }
}

export async function runProfessionalResearchRequests({
  question,
  files = [],
  baseMetadataPath = '',
  baseProjectId = '',
  prepareOntologyProject,
  generateOntology,
  onPrepared
}) {
  const researchQuestion = normalizeResearchQuestion(question)
  if (!researchQuestion) {
    return {
      canStart: false,
      error: REQUIRED_RESEARCH_QUESTION_ERROR,
      researchQuestion,
      prepareResponse: null,
      generationResponse: null
    }
  }

  const prepareResponse = await prepareOntologyProject({
    project_name: 'Professional Research Graph Project',
    query_prompt: researchQuestion,
    simulation_requirement: researchQuestion,
    build_stage: 'professional',
    source_corpus_type: 'research',
    base_metadata_path: baseMetadataPath,
    base_project_id: baseProjectId
  })
  if (!prepareResponse.success) {
    return {
      canStart: true,
      error: '',
      researchQuestion,
      prepareResponse,
      generationResponse: null
    }
  }

  await onPrepared?.(prepareResponse, researchQuestion)

  const formData = new FormData()
  formData.append('project_id', prepareResponse.data.project_id)
  Array.from(files).forEach(file => formData.append('files', file))
  formData.append('query_prompt', researchQuestion)
  formData.append('simulation_requirement', researchQuestion)
  formData.append('build_stage', 'professional')
  formData.append('source_corpus_type', 'research')
  formData.append('base_metadata_path', baseMetadataPath)
  formData.append('base_project_id', baseProjectId)

  const generationResponse = await generateOntology(formData)
  return {
    canStart: true,
    error: '',
    researchQuestion,
    prepareResponse,
    generationResponse
  }
}
