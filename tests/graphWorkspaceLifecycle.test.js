import assert from 'node:assert/strict'
import test from 'node:test'

import { defineComponent, h, nextTick } from 'vue'

import { renderedText } from './helpers/createMemoryVueRenderer.js'
import {
  mountWorkflowRoutes,
  settleWorkflowUpdates
} from './helpers/mountWorkflowRoutes.js'

const GRAPH_PROBE_KEY = '__ASC_GRAPH_WORKSPACE_LIFECYCLE_PROBE__'

const mainViewProbeSource = `
  import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue'
  import { useRoute } from 'vue-router'

  export default defineComponent({
    name: 'MainView',
    setup() {
      const route = useRoute()
      const projectId = String(route.params.projectId || '')
      const localState = ref('fresh')
      const probe = globalThis.${GRAPH_PROBE_KEY}
      probe.starts.push(projectId)
      probe.setState = value => { localState.value = value }
      onMounted(() => { probe.mounts.push(projectId) })
      onUnmounted(() => { probe.unmounts.push(projectId) })
      return () => h('p', { class: 'main-view-probe' }, projectId + ':' + localState.value)
    }
  })
`

const DocumentsView = defineComponent({
  name: 'DocumentsView',
  setup: () => () => h('p', 'documents')
})

function createProbe() {
  return { mounts: [], starts: [], unmounts: [], setState: () => {} }
}

async function mountGraphWorkspace(initialPath) {
  return mountWorkflowRoutes({
    initialPath,
    moduleOverrides: { 'src/views/MainView.vue': mainViewProbeSource },
    routes: [
      { path: '/documents', name: 'Documents', component: DocumentsView },
      {
        path: '/process/:projectId?',
        name: 'Process',
        component: '/src/views/GraphProjectWorkspaceView.vue',
        props: true
      }
    ]
  })
}

test('cached GraphProjectWorkspaceView keeps its keyed MainView through unrelated routes and replaces it for p1 to p2', async () => {
  const probe = createProbe()
  globalThis[GRAPH_PROBE_KEY] = probe
  const fixture = await mountGraphWorkspace('/process/p1')

  try {
    assert.match(renderedText(fixture.root), /p1:fresh/)
    probe.setState('mutated-local-state')
    await nextTick()

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.starts, ['p1'])
    assert.deepEqual(probe.unmounts, [])

    await fixture.router.push('/process/p1')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.starts, ['p1'])
    assert.deepEqual(probe.mounts, ['p1'])
    assert.deepEqual(probe.unmounts, [])
    assert.match(renderedText(fixture.root), /p1:mutated-local-state/)

    await fixture.router.push('/process/p2')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.starts, ['p1', 'p2'])
    assert.deepEqual(probe.mounts, ['p1', 'p2'])
    assert.deepEqual(probe.unmounts, ['p1'])
    assert.match(renderedText(fixture.root), /p2:fresh/)
    assert.doesNotMatch(renderedText(fixture.root), /mutated-local-state/)
  } finally {
    await fixture.close()
    delete globalThis[GRAPH_PROBE_KEY]
  }
})

test('GraphProjectWorkspaceView clears only on active explicit process and retains process new while away', async () => {
  const probe = createProbe()
  globalThis[GRAPH_PROBE_KEY] = probe
  const fixture = await mountGraphWorkspace('/process/new')

  try {
    probe.setState('new-workflow-state')
    await nextTick()
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.unmounts, [])

    await fixture.router.push('/process/new')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.starts, ['new'])
    assert.match(renderedText(fixture.root), /new:new-workflow-state/)

    await fixture.router.push('/process')
    await settleWorkflowUpdates()
    assert.deepEqual(probe.unmounts, ['new'])
    assert.doesNotMatch(renderedText(fixture.root), /new:new-workflow-state/)
  } finally {
    await fixture.close()
    delete globalThis[GRAPH_PROBE_KEY]
  }
})
