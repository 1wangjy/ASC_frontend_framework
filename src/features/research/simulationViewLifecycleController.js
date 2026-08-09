export function createSimulationViewLifecycleController({
  checkEnvironment = async () => ({ env_alive: false }),
  closeEnvironment = async () => {},
  checkRunning = async () => false,
  forceStop = async () => {},
  load = async () => {},
  reset = () => {}
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

    try {
      const environment = await checkEnvironment(context.simulationId)
      if (!context.isCurrent()) return

      if (environment?.env_alive) {
        try {
          await closeEnvironment(context.simulationId)
        } catch {
          if (!context.isCurrent()) return
          await forceStop(context.simulationId, context)
        }
      } else {
        const running = await checkRunning(context.simulationId)
        if (!context.isCurrent()) return
        if (running) await forceStop(context.simulationId, context)
      }
      if (!context.isCurrent()) return
      await load(context)
    } catch {
      // The view owns visible diagnostics; stale lifecycle work is intentionally silent.
    }
  }

  function stop() {
    generation++
    mounted = false
  }

  return { enter, stop }
}
