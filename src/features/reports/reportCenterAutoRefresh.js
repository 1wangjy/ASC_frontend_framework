export function createReportCenterAutoRefresh({
  refresh,
  shouldContinue,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
  intervalMs = 3000
} = {}) {
  if (typeof refresh !== 'function') throw new TypeError('refresh is required')
  if (typeof shouldContinue !== 'function') throw new TypeError('shouldContinue is required')

  let active = false
  let generation = 0
  let timer = null
  let inFlight = null

  function clearTimer() {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  function scheduleNext(version) {
    clearTimer()
    if (!active || version !== generation || !shouldContinue()) return
    timer = schedule(() => {
      timer = null
      run({ background: true }, version)
    }, intervalMs)
  }

  function run(options = {}, version = generation) {
    if (!active || version !== generation) return Promise.resolve()
    if (inFlight) return inFlight

    const pending = Promise.resolve()
      .then(() => refresh(options))
      .finally(() => {
        if (inFlight === pending) inFlight = null
        if (active && version === generation) scheduleNext(version)
      })
    inFlight = pending
    return pending
  }

  function activate(options = {}) {
    if (active) return inFlight || Promise.resolve()
    active = true
    generation += 1
    return run(options, generation)
  }

  function refreshNow(options = {}) {
    if (!active) return activate(options)
    clearTimer()
    return run(options, generation)
  }

  function sync() {
    if (!active || inFlight) return
    if (shouldContinue()) scheduleNext(generation)
    else clearTimer()
  }

  function deactivate() {
    if (!active) return
    active = false
    generation += 1
    clearTimer()
  }

  return { activate, refreshNow, sync, deactivate, stop: deactivate }
}
