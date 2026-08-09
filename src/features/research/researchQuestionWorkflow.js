import { buildPdfLibrarySelection } from '../library/libraryWorkflowModel.js'

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
