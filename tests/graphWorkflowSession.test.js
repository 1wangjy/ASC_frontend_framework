import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createGraphWorkflowSessionRegistry,
  resolveGraphProjectResumeRoute
} from '../src/features/navigation/graphWorkflowSession.js'

test('prefers the backend simulation stage when resuming a graph project', () => {
  assert.equal(resolveGraphProjectResumeRoute({
    projectId: 'p1',
    simulationId: 's1',
    evolutionStatus: 'environment_preparing'
  }, '/process/p1'), '/simulation/s1')

  for (const evolutionStatus of [
    'evolution_running',
    'evolution_completed',
    'evolution_stopped',
    'evolution_failed'
  ]) {
    assert.equal(resolveGraphProjectResumeRoute({
      projectId: 'p1',
      simulationId: 's1',
      evolutionStatus
    }, '/process/p1'), '/simulation/s1/start')
  }

  assert.equal(resolveGraphProjectResumeRoute({ projectId: 'p1' }, '/process/p1'), '/process/p1')
})

test('keeps one project on its latest environment, simulation, report, and interaction route', () => {
  const registry = createGraphWorkflowSessionRegistry()

  registry.remember({
    projectIds: ['base-1', 'pro-1'],
    simulationId: 'sim-1',
    route: '/simulation/sim-1'
  })
  assert.equal(registry.resolve(['base-1', 'pro-1']), '/simulation/sim-1')

  registry.advanceSimulation('sim-1', '/simulation/sim-1/start?maxRounds=24')
  assert.equal(registry.resolve(['pro-1']), '/simulation/sim-1/start?maxRounds=24')

  registry.remember({
    projectIds: ['pro-1'],
    simulationId: 'sim-1',
    reportId: 'report-1',
    route: '/report/report-1?taskId=task-1'
  })
  assert.equal(registry.resolve(['base-1']), '/report/report-1?taskId=task-1')

  registry.advanceReport('report-1', '/interaction/report-1')
  assert.equal(registry.resolve(['base-1', 'pro-1']), '/interaction/report-1')
})

test('does not mix the workflow routes of different graph projects', () => {
  const registry = createGraphWorkflowSessionRegistry()
  registry.remember({ projectIds: ['p1'], simulationId: 's1', route: '/simulation/s1' })
  registry.remember({ projectIds: ['p2'], simulationId: 's2', route: '/simulation/s2' })

  registry.advanceSimulation('s1', '/simulation/s1/start')

  assert.equal(registry.resolve(['p1']), '/simulation/s1/start')
  assert.equal(registry.resolve(['p2']), '/simulation/s2')
  assert.equal(registry.resolve(['missing']), '')
})

test('clears all aliases when a logical graph project is deleted', () => {
  const registry = createGraphWorkflowSessionRegistry()
  registry.remember({
    projectIds: ['base-1', 'pro-1'],
    simulationId: 'sim-1',
    reportId: 'report-1',
    route: '/report/report-1'
  })

  registry.clear(['base-1', 'pro-1'])

  assert.equal(registry.resolve(['base-1', 'pro-1']), '')
  assert.equal(registry.advanceSimulation('sim-1', '/simulation/sim-1/start'), false)
  assert.equal(registry.advanceReport('report-1', '/interaction/report-1'), false)
})

test('the project table resumes the active workflow route instead of forcing Process', async () => {
  const panel = await readFile(
    new URL('../src/features/projects/GraphProjectWorkspacePanel.vue', import.meta.url),
    'utf8'
  )
  const selectBlock = panel.slice(
    panel.indexOf('function selectProject'),
    panel.indexOf('function requestProjectDeletion')
  )

  assert.match(panel, /workflowSession\.remember/)
  assert.match(selectBlock, /workflowSession\.resolve\(item\.memberProjectIds\)/)
  assert.match(selectBlock, /route\.fullPath !== resumeRoute/)
})

test('the floating task progress action resumes the active workflow route instead of forcing Process', async () => {
  const shell = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')
  const viewProjectBlock = shell.slice(
    shell.indexOf('function viewProject'),
    shell.indexOf('onMounted(monitor.start)')
  )

  assert.match(shell, /const logicalGraphProjects = computed/)
  assert.match(shell, /:items="logicalGraphProjects"/)
  assert.ok(viewProjectBlock.indexOf('workflowSession.resolve') >= 0)
  assert.ok(viewProjectBlock.indexOf('workflowSession.resolve') < viewProjectBlock.indexOf("name: 'Process'"))
  assert.match(viewProjectBlock, /route\.fullPath !== resumeRoute/)
})

test('analysis preparation resumes an existing project workflow before creating another simulation', async () => {
  const step1 = await readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8')
  const enterBlock = step1.slice(
    step1.indexOf('const handleEnterEnvSetup = async'),
    step1.indexOf('const selectOntologyItem')
  )

  assert.ok(enterBlock.indexOf('workflowSession.resolve') < enterBlock.indexOf('createSimulation'))
  assert.match(enterBlock, /workflowSession\.remember/)
})

test('Process owns graph construction only and does not mount a second environment-setup implementation', async () => {
  const mainView = await readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(mainView, /import Step2EnvSetup/)
  assert.doesNotMatch(mainView, /<Step2EnvSetup/)
  assert.doesNotMatch(mainView, /currentStep\.value = 2/)
})
