function text(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function decideSimulationRunResume(response = {}, simulationResponse = {}) {
  if (response?.success !== true || !response?.data) {
    return { action: 'error', status: 'error' }
  }

  const runnerStatus = text(response.data.runner_status)
  if (['running', 'starting', 'processing'].includes(runnerStatus)) {
    return { action: 'resume-running', status: 'processing' }
  }
  if (runnerStatus === 'completed') {
    return { action: 'resume-completed', status: 'completed' }
  }
  if (runnerStatus === 'stopped') {
    return { action: 'resume-stopped', status: 'stopped' }
  }
  if (runnerStatus === 'failed') {
    return { action: 'resume-failed', status: 'error' }
  }
  if (['idle', 'ready', 'not_started'].includes(runnerStatus)) {
    const simulationStatus = text(simulationResponse?.data?.status)
    if (simulationResponse?.success !== true) return { action: 'error', status: 'error' }
    if (simulationStatus === 'ready') return { action: 'start', status: 'processing' }
    if (simulationStatus === 'completed') return { action: 'resume-completed', status: 'completed' }
    if (['paused', 'stopped'].includes(simulationStatus)) return { action: 'resume-stopped', status: 'stopped' }
    return { action: 'error', status: 'error' }
  }
  return { action: 'error', status: 'error' }
}
