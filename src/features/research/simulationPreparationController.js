import { normalizeResearchQuestion } from './researchQuestionWorkflow.js'
import { simulationPreparationState } from './simulationPreparationModel.js'

export function simulationPreparationKey(simulationId, project) {
  return [
    normalizeResearchQuestion(simulationId),
    normalizeResearchQuestion(project?.project_id),
    normalizeResearchQuestion(project?.graph_id)
  ].join('|')
}

export function createSimulationPreparationController({
  start = async () => {},
  stop = () => {},
  reset = () => {},
  onState = () => {},
  reportMissing = () => {}
} = {}) {
  let mounted = true
  let generation = 0
  let activeKey = null
  let activeState = null
  let prepareStarted = false
  let missingReported = false

  function createContext(simulationId, project, key, state, currentGeneration) {
    return {
      simulationId,
      project,
      key,
      state,
      generation: currentGeneration,
      isCurrent: () => (
        mounted
        && generation === currentGeneration
        && activeKey === key
        && activeState === state
      )
    }
  }

  async function update(simulationId, project) {
    const key = simulationPreparationKey(simulationId, project)
    const state = simulationPreparationState(simulationId, project)
    const keyChanged = key !== activeKey
    const stateChanged = state !== activeState

    if (keyChanged) {
      generation++
      activeKey = key
      activeState = state
      prepareStarted = false
      missingReported = false
      stop()
      reset(createContext(simulationId, project, key, state, generation))
    } else if (stateChanged) {
      generation++
      activeState = state
      prepareStarted = false
      if (state !== 'ready') stop()
    }

    const context = createContext(simulationId, project, key, state, generation)
    onState(state, context)
    if (state === 'waiting-project') return

    if (state === 'missing-question') {
      if (!missingReported) {
        missingReported = true
        reportMissing(context)
      }
      return
    }

    if (prepareStarted) return
    prepareStarted = true
    await start(context)
  }

  function stopController() {
    generation++
    mounted = false
    stop()
  }

  return {
    update,
    stop: stopController
  }
}
