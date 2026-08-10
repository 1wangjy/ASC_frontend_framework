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

test('uses one stable cache entry for QA and graph workflow routes', () => {
  assert.deepEqual([...WORKFLOW_VIEW_NAMES], ['AscQaView', 'GraphProjectWorkspaceView'])
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p1' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p2' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p1' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p2' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Documents', fullPath: '/documents' }), '/documents')
})

test('keeps QA completion and graph page state alive while another route is visible', async () => {
  let resolveAnswer
  const answerReady = new Promise(resolve => { resolveAnswer = resolve })
  let qaMounts = 0
  let qaUnmounts = 0
  let graphMounts = 0
  let graphUnmounts = 0

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
      onMounted(() => { graphMounts += 1 })
      onUnmounted(() => { graphUnmounts += 1 })
      return () => h('p', log.value)
    }
  })
  const DocumentsView = defineComponent({ name: 'DocumentsView', setup: () => () => h('p', 'documents') })
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
  await router.push('/documents')
  await nextTick()
  await router.push('/process/p2')
  await nextTick()

  assert.equal(graphMounts, 1)
  assert.equal(graphUnmounts, 0)
  assert.match(renderedText(root), /retained graph log/)
  app.unmount()
})
