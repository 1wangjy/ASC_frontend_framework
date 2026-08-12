import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { decideSimulationRunResume } from '../src/features/simulation/simulationRunResumeModel.js'

test('restores an existing simulation instead of starting it again', () => {
  assert.deepEqual(decideSimulationRunResume({ success: true, data: {
    runner_status: 'running',
    current_round: 15,
    total_rounds: 24
  } }), { action: 'resume-running', status: 'processing' })

  assert.deepEqual(decideSimulationRunResume({ success: true, data: {
    runner_status: 'completed', current_round: 24, total_rounds: 24
  } }), { action: 'resume-completed', status: 'completed' })

  assert.deepEqual(decideSimulationRunResume({ success: true, data: {
    runner_status: 'stopped', current_round: 8, total_rounds: 24
  } }), { action: 'resume-stopped', status: 'stopped' })

  assert.deepEqual(decideSimulationRunResume({ success: true, data: {
    runner_status: 'failed', error: 'runner failed'
  } }), { action: 'resume-failed', status: 'error' })
})

test('starts only when the backend explicitly reports that no run exists', () => {
  assert.deepEqual(decideSimulationRunResume(
    { success: true, data: { runner_status: 'idle', current_round: 0, total_rounds: 0 } },
    { success: true, data: { status: 'ready' } }
  ), { action: 'start', status: 'processing' })

  assert.deepEqual(decideSimulationRunResume(
    { success: true, data: { runner_status: 'idle', current_round: 0, total_rounds: 0 } },
    { success: true, data: { status: 'completed' } }
  ), {
    action: 'resume-completed', status: 'completed'
  })

  assert.deepEqual(decideSimulationRunResume({ success: false, error: 'offline' }), {
    action: 'error', status: 'error'
  })
  assert.deepEqual(decideSimulationRunResume({ success: true, data: {
    runner_status: 'mystery'
  } }), { action: 'error', status: 'error' })
})

test('the simulation component checks status before start and never force restarts on mount', async () => {
  const source = await readFile(
    new URL('../src/components/Step3Simulation.vue', import.meta.url),
    'utf8'
  )
  const mountBlock = source.slice(source.indexOf('onMounted(() =>'), source.indexOf('onUnmounted(() =>'))

  assert.match(source, /decideSimulationRunResume/)
  assert.match(mountBlock, /restoreSimulationRun\(\)/)
  assert.doesNotMatch(mountBlock, /doStartSimulation\(\)/)
  assert.doesNotMatch(source, /force:\s*true/)
})
