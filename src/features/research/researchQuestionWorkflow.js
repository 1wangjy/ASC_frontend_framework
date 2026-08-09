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

function baseFilesFromPending(pending) {
  return pending.filesByStage?.base?.length
    ? pending.filesByStage.base
    : (pending.buildStage && pending.buildStage !== 'base' ? [] : (pending.files || []))
}

export function createBaseResearchRequestIntent(pending) {
  const researchQuestion = normalizeResearchQuestion(pending?.queryPrompt || pending?.simulationRequirement)
  if (!researchQuestion) {
    return {
      canStart: false,
      error: REQUIRED_RESEARCH_QUESTION_ERROR,
      researchQuestion
    }
  }

  const initialFiles = baseFilesFromPending(pending || {})
  const pdfLibraryFileIds = Array.isArray(pending?.pdfLibraryFileIds) ? pending.pdfLibraryFileIds : []
  const buildOptions = {
    build_stage: 'base',
    source_corpus_type: 'survey',
    base_metadata_path: ''
  }
  return {
    canStart: true,
    error: '',
    researchQuestion,
    initialFiles,
    pdfLibraryFileIds,
    buildOptions,
    createPreparePayload(projectName) {
      return {
        project_name: projectName,
        query_prompt: researchQuestion,
        simulation_requirement: researchQuestion,
        build_stage: buildOptions.build_stage,
        source_corpus_type: buildOptions.source_corpus_type,
        base_metadata_path: buildOptions.base_metadata_path
      }
    },
    createGenerationFormData(projectId) {
      const formData = new FormData()
      formData.append('project_id', projectId)
      initialFiles.forEach(file => formData.append('files', file))
      pdfLibraryFileIds.forEach(fileId => formData.append('pdf_library_file_ids', fileId))
      formData.append('query_prompt', researchQuestion)
      formData.append('simulation_requirement', researchQuestion)
      formData.append('build_stage', buildOptions.build_stage)
      formData.append('source_corpus_type', buildOptions.source_corpus_type)
      return formData
    }
  }
}

export async function runBaseResearchRequests({
  pending,
  projectName = 'Base Graph Project',
  prepareOntologyProject,
  generateOntology,
  onPrepared,
  onAttempt,
  onFailure,
  maxRetries = 3,
  waitForRetry = async () => {}
}) {
  const intent = createBaseResearchRequestIntent(pending)
  if (!intent.canStart) {
    return {
      canStart: false,
      error: intent.error,
      researchQuestion: intent.researchQuestion,
      prepareResponse: null,
      generationResponse: null
    }
  }

  const prepareResponse = await prepareOntologyProject(intent.createPreparePayload(projectName))
  if (!prepareResponse.success) {
    const error = new Error(prepareResponse.error || 'Project preparation failed')
    await onFailure?.({ stage: 'prepare', attempt: 0, error, retrying: false })
    throw error
  }

  await onPrepared?.(prepareResponse, intent.buildOptions)

  let generationResponse = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const formData = intent.createGenerationFormData(prepareResponse.data.project_id)

    await onAttempt?.(attempt, maxRetries)
    let failure = null
    try {
      generationResponse = await generateOntology(formData)
      if (generationResponse.success) break
      failure = new Error(generationResponse.error || 'Ontology generation failed')
    } catch (error) {
      failure = error
    }

    if (!failure) continue
    const retrying = attempt < maxRetries
    await onFailure?.({ stage: 'generate', attempt, error: failure, retrying })
    if (!retrying) throw failure
    await waitForRetry(attempt, failure)
  }

  if (!generationResponse?.success) {
    throw new Error(generationResponse?.error || 'Ontology generation failed')
  }

  return {
    canStart: true,
    error: '',
    researchQuestion: intent.researchQuestion,
    prepareResponse,
    generationResponse
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
