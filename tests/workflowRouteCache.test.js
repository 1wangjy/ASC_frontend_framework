import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WORKFLOW_VIEW_NAMES,
  WorkflowRouteOutlet,
  workflowRouteViewKey
} from '../src/features/navigation/WorkflowRouteOutlet.js'
import { defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createMemoryVueRenderer, renderedText } from './helpers/createMemoryVueRenderer.js'

test('uses bounded workflow cache keys without query-driven duplicates', () => {
  assert.deepEqual([...WORKFLOW_VIEW_NAMES], [
    'AscQaView',
    'DocumentLibraryView',
    'GraphProjectWorkspaceView',
    'SimulationView',
    'SimulationRunView',
    'ReportCenterView',
    'ReportView',
    'InteractionView'
  ])
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p1' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p2' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'Documents', fullPath: '/documents' }), 'workflow:Documents')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p1' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p2' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Reports', fullPath: '/reports' }), 'workflow:Reports')
  assert.equal(
    workflowRouteViewKey({ name: 'Simulation', params: { simulationId: 'sim_1' }, fullPath: '/simulation/sim_1' }),
    'workflow:Simulation:sim_1'
  )
  assert.equal(
    workflowRouteViewKey({ name: 'SimulationRun', params: { simulationId: 'sim_1' }, fullPath: '/simulation/sim_1/start?maxRounds=24' }),
    'workflow:SimulationRun:sim_1'
  )
  assert.equal(
    workflowRouteViewKey({ name: 'Report', params: { reportId: 'report_1' }, fullPath: '/report/report_1?taskId=t1' }),
    'workflow:Report:report_1'
  )
  assert.equal(
    workflowRouteViewKey({ name: 'Interaction', params: { reportId: 'report_1' }, fullPath: '/interaction/report_1' }),
    'workflow:Interaction:report_1'
  )
})

test('keeps QA completion and graph page state alive while another route is visible', async () => {
  let resolveAnswer
  const answerReady = new Promise(resolve => { resolveAnswer = resolve })
  let qaMounts = 0
  let qaUnmounts = 0
  let graphMounts = 0
  let graphUnmounts = 0
  let updateGraphLog = () => {}

  const AscQaView = defineComponent({
    name: 'AscQaView',
    setup() {
      const answer = ref('answer loading')
      onMounted(() => {
        qaMounts += 1
        answerReady.then(value => { answer.value = value })
      })
      onUnmounted(() => { qaUnmounts += 1 })
      return () => h('p', answer.value)
    }
  })
  const GraphProjectWorkspaceView = defineComponent({
    name: 'GraphProjectWorkspaceView',
    setup() {
      const log = ref('retained graph log')
      updateGraphLog = value => { log.value = value }
      onMounted(() => { graphMounts += 1 })
      onUnmounted(() => { graphUnmounts += 1 })
      return () => h('p', log.value)
    }
  })
  const DocumentsView = defineComponent({ name: 'DocumentLibraryView', setup: () => () => h('p', 'documents') })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'AscQa', component: AscQaView },
      { path: '/documents', name: 'Documents', component: DocumentsView },
      { path: '/process/:projectId', name: 'Process', component: GraphProjectWorkspaceView }
    ]
  })
  const { renderer, root } = createMemoryVueRenderer()
  const app = renderer.createApp(WorkflowRouteOutlet)
  app.use(router)

  await router.push('/')
  await router.isReady()
  app.mount(root)
  await nextTick()
  await router.push('/documents')
  await nextTick()
  resolveAnswer('answer completed while away')
  await answerReady
  await nextTick()
  await router.push('/')
  await nextTick()

  assert.equal(qaMounts, 1)
  assert.equal(qaUnmounts, 0)
  assert.match(renderedText(root), /answer completed while away/)

  await router.push('/process/p1')
  await nextTick()
  updateGraphLog('mutated graph log')
  await nextTick()
  await router.push('/documents')
  await nextTick()
  await router.push('/process/p2')
  await nextTick()

  assert.equal(graphMounts, 1)
  assert.equal(graphUnmounts, 0)
  assert.match(renderedText(root), /mutated graph log/)
  app.unmount()
})

test('keeps simulation and report task pages mounted across sidebar navigation', async () => {
  let simulationMounts = 0
  let simulationUnmounts = 0
  let reportMounts = 0
  let reportUnmounts = 0
  let advanceSimulation = () => {}
  let advanceReport = () => {}

  const DocumentsView = defineComponent({ name: 'DocumentLibraryView', setup: () => () => h('p', 'documents') })
  const SimulationRunView = defineComponent({
    name: 'SimulationRunView',
    setup() {
      const stage = ref('stage 1')
      advanceSimulation = value => { stage.value = value }
      onMounted(() => { simulationMounts += 1 })
      onUnmounted(() => { simulationUnmounts += 1 })
      return () => h('p', stage.value)
    }
  })
  const ReportView = defineComponent({
    name: 'ReportView',
    setup() {
      const section = ref('section 1')
      advanceReport = value => { section.value = value }
      onMounted(() => { reportMounts += 1 })
      onUnmounted(() => { reportUnmounts += 1 })
      return () => h('p', section.value)
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/documents', name: 'Documents', component: DocumentsView },
      { path: '/simulation/:simulationId/start', name: 'SimulationRun', component: SimulationRunView },
      { path: '/report/:reportId', name: 'Report', component: ReportView }
    ]
  })
  const { renderer, root } = createMemoryVueRenderer()
  const app = renderer.createApp(WorkflowRouteOutlet)
  app.use(router)

  await router.push('/simulation/sim_1/start?maxRounds=24')
  await router.isReady()
  app.mount(root)
  await nextTick()
  advanceSimulation('stage 8')
  await nextTick()
  await router.push('/documents')
  await nextTick()
  await router.push('/simulation/sim_1/start?maxRounds=48')
  await nextTick()

  assert.equal(simulationMounts, 1)
  assert.equal(simulationUnmounts, 0)
  assert.match(renderedText(root), /stage 8/)

  await router.push('/report/report_1?taskId=t1')
  await nextTick()
  advanceReport('section 4')
  await nextTick()
  await router.push('/documents')
  await nextTick()
  await router.push('/report/report_1?taskId=t2')
  await nextTick()

  assert.equal(reportMounts, 1)
  assert.equal(reportUnmounts, 0)
  assert.match(renderedText(root), /section 4/)
  app.unmount()
})
