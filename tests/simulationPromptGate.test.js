import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  projectResearchQuestion,
  simulationPreparationState
} from '../src/features/research/simulationPreparationModel.js'
import {
  createSimulationPreparationController,
  simulationPreparationKey
} from '../src/features/research/simulationPreparationController.js'
import { createSimulationViewLifecycleController } from '../src/features/research/simulationViewLifecycleController.js'

const readyProject = (projectId = 'p1', graphId = 'g1') => ({
  project_id: projectId,
  graph_id: graphId,
  query_prompt: 'Research question'
})

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

test('normalizes project research questions and prefers query_prompt', () => {
  assert.equal(projectResearchQuestion({
    query_prompt: '  Explain oxidation mechanisms.  ',
    simulation_requirement: 'Fallback question'
  }), 'Explain oxidation mechanisms.')
  assert.equal(projectResearchQuestion({
    query_prompt: '   ',
    simulation_requirement: '  Fallback question  '
  }), 'Fallback question')
  assert.equal(projectResearchQuestion({ query_prompt: ' \n ', simulation_requirement: '\t' }), '')
})

test('models simulation preparation as waiting, missing, or ready', () => {
  assert.equal(simulationPreparationState('', { query_prompt: 'Question' }), 'waiting-project')
  assert.equal(simulationPreparationState('s1', null), 'waiting-project')
  assert.equal(simulationPreparationState('s1', {}), 'missing-question')
  assert.equal(simulationPreparationState('s1', { simulation_requirement: 'Question' }), 'ready')
})

test('preparation controller waits for project data then starts the same ready key exactly once', async () => {
  const starts = []
  const states = []
  const controller = createSimulationPreparationController({
    onState: state => states.push(state),
    start: context => { starts.push(context.key) }
  })

  await controller.update('s1', null)
  await controller.update('s1', readyProject())
  await controller.update('s1', readyProject())

  assert.deepEqual(states, ['waiting-project', 'ready', 'ready'])
  assert.deepEqual(starts, ['s1|p1|g1'])
})

test('preparation controller reports a missing question once for the same key', async () => {
  const errors = []
  const controller = createSimulationPreparationController({
    reportMissing: context => errors.push(context.key),
    start: () => assert.fail('missing question must not start preparation')
  })
  const missing = { project_id: 'p1', graph_id: 'g1', query_prompt: '  ' }

  await controller.update('s1', missing)
  await controller.update('s1', missing)

  assert.deepEqual(errors, ['s1|p1|g1'])
})

test('preparation controller resets and starts again when the project-scoped key changes', async () => {
  const starts = []
  const resets = []
  const stops = []
  const controller = createSimulationPreparationController({
    start: context => starts.push(context.key),
    reset: context => resets.push(context.key),
    stop: () => stops.push('stop')
  })

  await controller.update('s1', readyProject('p1', 'g1'))
  await controller.update('s2', readyProject('p2', 'g2'))

  assert.deepEqual(starts, ['s1|p1|g1', 's2|p2|g2'])
  assert.deepEqual(resets, ['s1|p1|g1', 's2|p2|g2'])
  assert.deepEqual(stops, ['stop', 'stop'])
})

test('preparation controller transitions a new project key from ready to missing without preparation', async () => {
  const starts = []
  const errors = []
  const controller = createSimulationPreparationController({
    start: context => starts.push(context.key),
    reportMissing: context => errors.push(context.key)
  })

  await controller.update('s1', readyProject('p1', 'g1'))
  await controller.update('s2', { project_id: 'p2', graph_id: 'g2', simulation_requirement: '' })

  assert.deepEqual(starts, ['s1|p1|g1'])
  assert.deepEqual(errors, ['s2|p2|g2'])
})

test('preparation controller invalidates a late response after stop so it cannot commit or start timers', async () => {
  const pending = deferred()
  let commits = 0
  let timersStarted = 0
  const controller = createSimulationPreparationController({
    start: async context => {
      await pending.promise
      if (!context.isCurrent()) return
      commits++
      timersStarted++
    }
  })

  const running = controller.update('s1', readyProject())
  controller.stop()
  pending.resolve()
  await running

  assert.equal(commits, 0)
  assert.equal(timersStarted, 0)
})

test('preparation controller starts once when an initially missing question becomes ready for the same key', async () => {
  const starts = []
  const controller = createSimulationPreparationController({
    start: context => starts.push(context.key)
  })

  await controller.update('s1', { project_id: 'p1', graph_id: 'g1', query_prompt: '' })
  await controller.update('s1', readyProject())

  assert.deepEqual(starts, ['s1|p1|g1'])
})

test('preparation controller does not restart a prepared key after a transient missing snapshot', async () => {
  const starts = []
  const states = []
  const controller = createSimulationPreparationController({
    start: context => starts.push(context.key),
    onState: state => states.push(state)
  })

  await controller.update('s1', readyProject())
  await controller.update('s1', { project_id: 'p1', graph_id: 'g1', query_prompt: '' })
  await controller.update('s1', readyProject())

  assert.deepEqual(starts, ['s1|p1|g1'])
  assert.deepEqual(states, ['ready', 'ready', 'ready'])
})

test('preparation controller resets an unprepared same-key missing state and blocks start', async () => {
  const resets = []
  const stops = []
  const starts = []
  const controller = createSimulationPreparationController({
    reset: context => resets.push(context.state),
    stop: () => stops.push('stop'),
    start: context => starts.push(context.key)
  })

  await controller.update('s1', null)
  await controller.update('s1', { project_id: '', graph_id: '', query_prompt: '' })

  assert.deepEqual(resets, ['waiting-project', 'missing-question'])
  assert.deepEqual(stops, ['stop', 'stop'])
  assert.deepEqual(starts, [])
})

test('simulation view lifecycle never closes or stops a newer route after an old environment lookup resolves', async () => {
  const firstLookup = deferred()
  const firstClose = deferred()
  const closeTargets = []
  const stopTargets = []
  const loaded = []
  const controller = createSimulationViewLifecycleController({
    checkEnvironment: simulationId => simulationId === 's1'
      ? firstLookup.promise
      : Promise.resolve({ env_alive: false }),
    closeEnvironment: simulationId => {
      closeTargets.push(simulationId)
      return firstClose.promise
    },
    forceStop: async simulationId => stopTargets.push(simulationId),
    load: async context => { if (context.isCurrent()) loaded.push(context.simulationId) }
  })

  const first = controller.enter('s1')
  firstLookup.resolve({ env_alive: true })
  await Promise.resolve()
  await controller.enter('s2')
  firstClose.resolve()
  await first

  assert.deepEqual(closeTargets, ['s1'])
  assert.deepEqual(stopTargets, [])
  assert.deepEqual(loaded, ['s2'])
})

test('simulation view lifecycle discards an environment response that arrives after switching routes', async () => {
  const firstLookup = deferred()
  const closeTargets = []
  const stopTargets = []
  const loaded = []
  const controller = createSimulationViewLifecycleController({
    checkEnvironment: simulationId => simulationId === 's1'
      ? firstLookup.promise
      : Promise.resolve({ env_alive: false }),
    closeEnvironment: async simulationId => closeTargets.push(simulationId),
    forceStop: async simulationId => stopTargets.push(simulationId),
    load: async context => { if (context.isCurrent()) loaded.push(context.simulationId) }
  })

  const first = controller.enter('s1')
  await controller.enter('s2')
  firstLookup.resolve({ env_alive: true })
  await first

  assert.deepEqual(closeTargets, [])
  assert.deepEqual(stopTargets, [])
  assert.deepEqual(loaded, ['s2'])
})

test('simulation view lifecycle warns and still loads when environment or running checks fail', async () => {
  const loaded = []
  const warnings = []
  const environmentFailure = createSimulationViewLifecycleController({
    checkEnvironment: async () => { throw new Error('environment unavailable') },
    onCheckError: (error, context) => warnings.push([error.message, context.simulationId]),
    load: async context => loaded.push(context.simulationId)
  })
  const runningFailure = createSimulationViewLifecycleController({
    checkEnvironment: async () => ({ env_alive: false }),
    checkRunning: async () => { throw new Error('simulation lookup unavailable') },
    onCheckError: (error, context) => warnings.push([error.message, context.simulationId]),
    load: async context => loaded.push(context.simulationId)
  })

  await environmentFailure.enter('s1')
  await runningFailure.enter('s2')

  assert.deepEqual(warnings, [
    ['environment unavailable', 's1'],
    ['simulation lookup unavailable', 's2']
  ])
  assert.deepEqual(loaded, ['s1', 's2'])
})

test('simulation view lifecycle ignores a stale check failure', async () => {
  const pending = deferred()
  const warnings = []
  const loaded = []
  const controller = createSimulationViewLifecycleController({
    checkEnvironment: simulationId => simulationId === 's1'
      ? pending.promise
      : Promise.resolve({ env_alive: false }),
    onCheckError: (error, context) => warnings.push([error.message, context.simulationId]),
    load: async context => loaded.push(context.simulationId)
  })

  const oldEntry = controller.enter('s1')
  await controller.enter('s2')
  pending.resolve(Promise.reject(new Error('stale failure')))
  await oldEntry
  controller.stop()

  assert.deepEqual(warnings, [])
  assert.deepEqual(loaded, ['s2'])
})

test('simulation view lifecycle ignores a rejected check after unmount', async () => {
  const pending = deferred()
  const warnings = []
  const loaded = []
  const controller = createSimulationViewLifecycleController({
    checkEnvironment: () => pending.promise,
    onCheckError: (error, context) => warnings.push([error.message, context.simulationId]),
    load: async context => loaded.push(context.simulationId)
  })

  const entry = controller.enter('s1')
  controller.stop()
  pending.resolve(Promise.reject(new Error('unmounted failure')))
  await entry

  assert.deepEqual(warnings, [])
  assert.deepEqual(loaded, [])
})

test('simulation view lifecycle resets every new route so the view can clear its previous graph spinner', async () => {
  const resets = []
  const controller = createSimulationViewLifecycleController({
    reset: context => resets.push(context.simulationId),
    load: async () => {}
  })

  await controller.enter('s1')
  await controller.enter('s2')

  assert.deepEqual(resets, ['s1', 's2'])
})

test('builds a stable simulation preparation key from simulation and project identifiers', () => {
  assert.equal(simulationPreparationKey(' s1 ', { project_id: ' p1 ', graph_id: ' g1 ' }), 's1|p1|g1')
})

test('Step 1 blocks empty questions before simulation creation and keeps graph QA available', async () => {
  const source = await readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8')
  const guardIndex = source.indexOf('projectResearchQuestion(props.projectData)')
  const createIndex = source.indexOf('await createSimulation(')

  assert.ok(guardIndex >= 0)
  assert.ok(createIndex > guardIndex)
  assert.match(source, /:disabled="currentPhase < 4 \|\| creatingSimulation \|\| !projectResearchQuestion\(projectData\)"/)
  assert.match(source, /@click="emit\('open-qa', projectData\)"/)
  assert.match(source, /当前项目缺少研究问题，不能进入 ASC 分析准备。你仍可使用图谱问答。/)
  assert.match(source, /const simulationPreparationError = computed/)
})

test('Step 2 defers preparation until project data is ready and exposes the missing-question QA recovery', async () => {
  const source = await readFile(new URL('../src/components/Step2EnvSetup.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /onMounted\(\(\) => \{[\s\S]*?startPrepareSimulation\(\)/)
  assert.match(source, /createSimulationPreparationController/)
  assert.match(source, /watch\([\s\S]*?props\.simulationId[\s\S]*?immediate:\s*true/)
  assert.match(source, /isCurrentPreparation/)
  assert.match(source, /当前项目缺少研究问题，无法开始 ASC 分析准备。/)
  assert.match(source, /你仍可使用图谱问答/)
  assert.match(source, /@click="emit\('go-qa', projectData\)"/)
})

test('MainView and SimulationView route project-scoped QA actions through the shared navigator', async () => {
  const [mainView, simulationView] = await Promise.all([
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/SimulationView.vue', import.meta.url), 'utf8')
  ])

  assert.match(mainView, /@open-qa="openCompletedGraphInQa"/)
  assert.match(simulationView, /@go-qa="openProjectGraphInQa"/)
  assert.match(simulationView, /navigateGraphProjectToQa/)
  assert.match(simulationView, /project:\s*projectData\.value/)
  assert.match(simulationView, /route\.name === 'Simulation'/)
  assert.match(simulationView, /String\(route\.params\.simulationId \|\| ''\)\.trim\(\) === ownedSimulationId/)
  assert.match(simulationView, /simulationViewLifecycle\.enter\(simulationId\)/)
  assert.match(simulationView, /createSimulationViewLifecycleController/)
  assert.match(simulationView, /graphLoading\.value = false/)
})

test('simulation prompt gate does not fabricate a default research question', async () => {
  const source = await readFile(new URL('../src/features/research/simulationPreparationModel.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /default research question|默认研究问题|simulation prompt/i)
})
