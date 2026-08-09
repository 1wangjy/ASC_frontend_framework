export function createSimulationViewLifecycleController({
  checkEnvironment = async () => ({ env_alive: false }),
  closeEnvironment = async () => {},
  checkRunning = async () => false,
  forceStop = async () => {},
  load = async () => {},
  reset = () => {},
  onCheckError = () => {},
  onLoadError = () => {}
} = {}) {
  let mounted = true
  let generation = 0
  let activeSimulationId = ''

  function createContext(simulationId, currentGeneration) {
    return {
      simulationId,
      generation: currentGeneration,
      isCurrent: () => (
        mounted
        && activeSimulationId === simulationId
        && generation === currentGeneration
      )
    }
  }

  async function enter(simulationId) {
    generation++
    activeSimulationId = String(simulationId || '')
    const context = createContext(activeSimulationId, generation)
    reset(context)
    if (!context.simulationId) return

    async function loadCurrent() {
      if (!context.isCurrent()) return
      try {
        await load(context)
      } catch (error) {
        if (context.isCurrent()) onLoadError(error, context)
      }
    }

    function reportCurrentCheckError(error) {
      if (context.isCurrent()) onCheckError(error, context)
    }

    let environment
    try {
      environment = await checkEnvironment(context.simulationId)
    } catch (error) {
      reportCurrentCheckError(error)
      return loadCurrent()
    }
    if (!context.isCurrent()) return

    if (environment?.env_alive) {
      try {
        await closeEnvironment(context.simulationId)
      } catch (error) {
        if (!context.isCurrent()) return
        reportCurrentCheckError(error)
        try {
          await forceStop(context.simulationId, context)
        } catch (forceError) {
          reportCurrentCheckError(forceError)
        }
      }
      return loadCurrent()
    }

    let running
    try {
      running = await checkRunning(context.simulationId)
    } catch (error) {
      reportCurrentCheckError(error)
      return loadCurrent()
    }
    if (!context.isCurrent()) return

    if (running) {
      try {
        await forceStop(context.simulationId, context)
      } catch (error) {
        reportCurrentCheckError(error)
      }
    }
    return loadCurrent()
  }

  function stop() {
    generation++
    mounted = false
  }

  return { enter, stop }
}
