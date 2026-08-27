import assert from 'node:assert/strict'
import test from 'node:test'

import { defineComponent, h } from 'vue'

import {
  mountWorkflowRoutes,
  settleWorkflowUpdates
} from './helpers/mountWorkflowRoutes.js'

const PROBE_KEY = '__ASC_WORKFLOW_PAGE_CONTINUITY_PROBE__'

const inertComponentSource = `
  import { defineComponent, h } from 'vue'
  export default defineComponent({
    name: 'WorkflowContinuityStub',
    setup: () => () => h('div')
  })
`

const simulationApiSource = `
  export async function getSimulation() { return { success: true, data: {} } }
  export async function stopSimulation() { throw new Error('unexpected stop request') }
  export async function getEnvStatus() { return { success: true, data: { env_alive: false } } }
  export async function closeSimulationEnv() { throw new Error('unexpected close request') }
`

const graphApiSource = `
  export async function getProject() { return { success: true, data: {} } }
  export async function getGraphData() { return { success: true, data: { nodes: [], edges: [] } } }
`

const lifecycleProbeSource = `
  export function createSimulationViewLifecycleController() {
    const probe = globalThis.${PROBE_KEY}
    return {
      enter(simulationId) { probe.entered.push(simulationId) },
      stop() { probe.stopped += 1 }
    }
  }
`

const qaNavigationSource = `
  export async function navigateGraphProjectToQa() { return false }
`

const reportApiProbeSource = `
  export async function getReport(reportId) {
    globalThis.${PROBE_KEY}.reports.push(reportId)
    return { success: true, data: { report_id: reportId, simulation_id: null } }
  }
`

test('cached environment setup ignores unrelated routes and resumes the same simulation without re-entering', async () => {
  const probe = { entered: [], stopped: 0 }
  globalThis[PROBE_KEY] = probe
  const PlatformDataView = defineComponent({
    name: 'PlatformDataView',
    setup: () => () => h('p', 'platform data')
  })
  const fixture = await mountWorkflowRoutes({
    initialPath: '/simulation/sim_1',
    moduleOverrides: {
      'src/components/GraphPanel.vue': inertComponentSource,
      'src/components/Step2EnvSetup.vue': inertComponentSource,
      'src/components/WorkflowProgressBar.vue': inertComponentSource,
      'src/api/graph': graphApiSource,
      'src/api/simulation': simulationApiSource,
      'src/features/projects/graphQaNavigation.js': qaNavigationSource,
      'src/features/research/simulationViewLifecycleController.js': lifecycleProbeSource
    },
    routes: [
      {
        path: '/simulation/:simulationId',
        name: 'Simulation',
        component: '/src/views/SimulationView.vue',
        props: true
      },
      { path: '/platform/data', name: 'PlatformData', component: PlatformDataView }
    ]
  })

  try {
    assert.deepEqual(probe.entered, ['sim_1'])
    await fixture.router.push('/platform/data')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.entered, ['sim_1'])
    assert.equal(probe.stopped, 0)

    await fixture.router.push('/simulation/sim_1')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.entered, ['sim_1'])
    assert.equal(probe.stopped, 0)
  } finally {
    await fixture.close()
    delete globalThis[PROBE_KEY]
  }
})

test('cached report instances do not load another report route in the background', async () => {
  const probe = { reports: [] }
  globalThis[PROBE_KEY] = probe
  const PlatformDataView = defineComponent({
    name: 'PlatformDataView',
    setup: () => () => h('p', 'platform data')
  })
  const fixture = await mountWorkflowRoutes({
    initialPath: '/report/report_1?taskId=task_1',
    moduleOverrides: {
      'src/components/ReportReader.vue': inertComponentSource,
      'src/api/graph.js': graphApiSource,
      'src/api/simulation.js': simulationApiSource,
      'src/api/report.js': reportApiProbeSource
    },
    routes: [
      {
        path: '/report/:reportId',
        name: 'Report',
        component: '/src/views/ReportView.vue',
        props: true
      },
      { path: '/platform/data', name: 'PlatformData', component: PlatformDataView }
    ]
  })

  try {
    await settleWorkflowUpdates()
    assert.deepEqual(probe.reports, ['report_1'])
    await fixture.router.push('/platform/data')
    await settleWorkflowUpdates()
    await fixture.router.push('/report/report_2?taskId=task_2')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.reports, ['report_1', 'report_2'])
  } finally {
    await fixture.close()
    delete globalThis[PROBE_KEY]
  }
})
