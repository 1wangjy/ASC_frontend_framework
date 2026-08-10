import { buildPdfLibrarySelection } from '../library/libraryWorkflowModel.js'
import { setPendingUpload } from '../../store/pendingUpload.js'

const REQUIRED_RESEARCH_QUESTION_ERROR = '请先填写研究问题。'
const REQUIRED_PROJECT_NAME_ERROR = '请填写图谱名称。'

export function normalizeResearchQuestion(value) {
  return String(value || '').trim()
}

export function createResearchBuildIntent(documents, selectedIds, question) {
  const selection = buildPdfLibrarySelection(documents, selectedIds)
  const submission = question && typeof question === 'object'
    ? question
    : { question }
  const queryPrompt = normalizeResearchQuestion(submission.question)
  const projectName = String(submission.projectName || '').trim()

  return {
    ...selection,
    queryPrompt,
    ...(projectName ? { projectName } : {}),
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
    pdfLibraryFiles: intent.files,
    projectName: intent.projectName || ''
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

export function validateResearchBuildDialogSubmission(submission = {}) {
  const projectName = String(submission.projectName || '').trim()
  const question = normalizeResearchQuestion(submission.question)
  const error = !projectName
    ? REQUIRED_PROJECT_NAME_ERROR
    : (!question ? REQUIRED_RESEARCH_QUESTION_ERROR : '')

  return {
    canSubmit: !error,
    projectName,
    question,
    error
  }
}

function baseFilesFromPending(pending) {
  return pending.filesByStage?.base?.length
    ? pending.filesByStage.base
    : (pending.buildStage && pending.buildStage !== 'base' ? [] : (pending.files || []))
}

export function isRetryableNetworkError(error) {
  const message = error?.message || String(error)
  return message.includes('Network Error')
    || message.includes('ERR_NETWORK')
    || message.includes('ECONNABORTED')
    || message.includes('timeout')
    || error?.code === 'ERR_NETWORK'
    || error?.code === 'ECONNABORTED'
}

export async function runOntologyGenerationWithRetry({
  generateOntology,
  createFormData,
  maxRetries = 3,
  waitForRetry = async () => {},
  onAttempt,
  onAttemptError,
  onFailure
}) {
  const requestedAttempts = Number.isFinite(Number(maxRetries))
    ? Math.trunc(Number(maxRetries))
    : 3
  const totalAttempts = Math.max(1, Math.min(3, requestedAttempts))

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    await onAttempt?.(attempt, totalAttempts)
    let response
    try {
      response = await generateOntology(createFormData(attempt))
    } catch (error) {
      const isNetworkError = isRetryableNetworkError(error)
      const retrying = isNetworkError && attempt < totalAttempts
      await onAttemptError?.({ attempt, error, isNetworkError, retrying })
      if (!retrying) throw error
      await waitForRetry(attempt, error)
      continue
    }

    if (response?.success) return response
    const failure = new Error(response?.error || 'Ontology generation failed')
    await onFailure?.({ stage: 'generate', attempt, error: failure, retrying: false })
    throw failure
  }

  throw new Error('Ontology generation failed')
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
  onAttemptError,
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

  const generationResponse = await runOntologyGenerationWithRetry({
    generateOntology,
    createFormData: () => intent.createGenerationFormData(prepareResponse.data.project_id),
    maxRetries,
    waitForRetry,
    onAttempt,
    onAttemptError,
    onFailure
  })

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
  onPrepared,
  onAttempt,
  onAttemptError,
  onFailure,
  maxRetries = 3,
  waitForRetry = async () => {}
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

  const generationResponse = await runOntologyGenerationWithRetry({
    generateOntology,
    createFormData: () => {
      const formData = new FormData()
      formData.append('project_id', prepareResponse.data.project_id)
      Array.from(files).forEach(file => formData.append('files', file))
      formData.append('query_prompt', researchQuestion)
      formData.append('simulation_requirement', researchQuestion)
      formData.append('build_stage', 'professional')
      formData.append('source_corpus_type', 'research')
      formData.append('base_metadata_path', baseMetadataPath)
      formData.append('base_project_id', baseProjectId)
      return formData
    },
    maxRetries,
    waitForRetry,
    onAttempt,
    onAttemptError,
    onFailure
  })
  return {
    canStart: true,
    error: '',
    researchQuestion,
    prepareResponse,
    generationResponse
  }
}
