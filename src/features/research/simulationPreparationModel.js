import { normalizeResearchQuestion } from './researchQuestionWorkflow.js'

export function projectResearchQuestion(project) {
  return normalizeResearchQuestion(project?.query_prompt)
    || normalizeResearchQuestion(project?.simulation_requirement)
}

export function simulationPreparationState(simulationId, project) {
  if (!normalizeResearchQuestion(simulationId) || !project) return 'waiting-project'
  return projectResearchQuestion(project) ? 'ready' : 'missing-question'
}
