export function createReportStatusPoller({
  poll,
  onResult,
  onError,
  schedule = setInterval,
  cancel = clearInterval,
  intervalMs = 2000
}) {
  let timer = null
  let inFlight = null
  let running = false
  let generation = 0

  async function tick() {
    if (!running || inFlight) return inFlight

    const currentGeneration = generation
    let polled
    try {
      polled = poll()
    } catch (error) {
      polled = Promise.reject(error)
    }
    const request = Promise.resolve(polled)
    inFlight = request

    try {
      const result = await request
      if (running && generation === currentGeneration) await onResult(result)
    } catch (error) {
      if (running && generation === currentGeneration) onError(error)
    } finally {
      if (inFlight === request) inFlight = null
    }
  }

  function start() {
    if (running) return
    running = true
    generation += 1
    tick()
    timer = schedule(tick, intervalMs)
  }

  function stop() {
    if (!running && timer === null) return
    running = false
    generation += 1
    if (timer !== null) cancel(timer)
    timer = null
    inFlight = null
  }

  return { start, stop }
}
