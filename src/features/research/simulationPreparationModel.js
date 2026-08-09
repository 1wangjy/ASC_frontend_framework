import { normalizeResearchQuestion } from './researchQuestionWorkflow.js'

export const GRAPH_BUILD_RESEARCH_QUESTION_ERROR = '当前项目缺少研究问题，不能开始图谱构建。'

export function projectResearchQuestion(project) {
  return normalizeResearchQuestion(project?.query_prompt)
    || normalizeResearchQuestion(project?.simulation_requirement)
}

export function canBuildGraphProject(project) {
  return Boolean(projectResearchQuestion(project))
}

export async function runGraphBuildProjectRequest({ project, payload, buildGraph }) {
  if (!canBuildGraphProject(project)) {
    return {
      canStart: false,
      error: GRAPH_BUILD_RESEARCH_QUESTION_ERROR,
      response: null
    }
  }

  return {
    canStart: true,
    error: '',
    response: await buildGraph(payload)
  }
}

export function simulationPreparationState(simulationId, project) {
  if (!normalizeResearchQuestion(simulationId) || !project) return 'waiting-project'
  return projectResearchQuestion(project) ? 'ready' : 'missing-question'
}
