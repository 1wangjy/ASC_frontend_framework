import assert from 'node:assert/strict'
import test from 'node:test'

import { defineComponent, h, nextTick, reactive } from 'vue'

import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import {
  mountWorkflowRoutes,
  settleWorkflowUpdates
} from './helpers/mountWorkflowRoutes.js'

const QA_PROBE_KEY = '__ASC_QA_ROUTE_QUERY_PROBE__'

const graphApiProbeSource = `
  function probe() {
    return globalThis.${QA_PROBE_KEY}
  }

  export async function listProjects(params) {
    probe().projectLoads.push(params)
    const deferredLoad = probe().deferredProjectLoads.shift()
    if (deferredLoad) await deferredLoad
    return { data: probe().projects.map(project => ({ ...project })) }
  }

  export async function getProject(projectId) {
    const project = probe().projects.find(item => item.project_id === projectId)
    if (!project) {
      const error = new Error('project not found')
      error.response = { status: 404 }
      throw error
    }
    return { data: { ...project } }
  }

  export async function codGraphRAGQuery(payload) {
    probe().qaPosts.push({ ...payload })
    const postNumber = probe().qaPosts.length
    return {
      success: true,
      data: {
        qa_run_id: 'run-' + postNumber,
        final_answer: 'answer-for-post-' + postNumber,
        references: [],
        citation_bindings: [],
        debug_trace: {
          graph_context: {
            scope_resolution: 'project_id',
            project_id: payload.project_id,
            graph_id: payload.graph_id
          },
          stages: []
        }
      }
    }
  }

  export async function getTaskStatus() {
    return { success: true, data: {} }
  }

  export async function judgeQAWithLLM() {
    throw new Error('evaluation is outside this test')
  }

  export async function submitQAFeedback() {
    throw new Error('evaluation is outside this test')
  }
`

const graphTaskMonitorProbeSource = `
  export function useGraphTaskMonitor() {
    return globalThis.${QA_PROBE_KEY}.monitor
  }
`

const DocumentsView = defineComponent({
  name: 'DocumentsView',
  setup: () => () => h('p', 'documents')
})

function createProbe() {
  return {
    projectLoads: [],
    qaPosts: [],
    deferredProjectLoads: [],
    monitor: {
      state: reactive({ completedRevision: 0 })
    },
    projects: [
      { project_id: 'p1', graph_id: 'g1', project_name: 'Project One' },
      { project_id: 'p2', graph_id: 'g2', project_name: 'Project Two' }
    ]
  }
}

async function mountQa(initialPath = '/?projectId=p1') {
  return mountWorkflowRoutes({
    initialPath,
    moduleOverrides: {
      'src/api/graph.js': graphApiProbeSource,
      'src/features/tasks/graphTaskMonitor.js': graphTaskMonitorProbeSource
    },
    routes: [
      { path: '/', name: 'AscQa', component: '/src/views/AscQaView.vue' },
      { path: '/documents', name: 'Documents', component: DocumentsView }
    ]
  })
}

async function waitFor(assertion, message) {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await settleWorkflowUpdates()
    }
  }
  throw new Error(message, { cause: lastError })
}

function findTextarea(root) {
  return findRenderedNode(root, node => node?.type === 'textarea')
}

async function setDraft(root, value) {
  const textarea = findTextarea(root)
  assert.ok(textarea, 'expected the real QuestionComposer textarea')
  await textarea.props.onInput({ target: { value } })
  await nextTick()
}

function draftValue(root) {
  const textarea = findTextarea(root)
  assert.ok(textarea, 'expected the real QuestionComposer textarea')
  return textarea.props.value
}

test('cached AscQaView consumes a conversation query once and preserves its draft and result on same-URL return', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    const conversationUrl = '/?projectId=p1&conversation=thermal-shock'
    await fixture.router.push(conversationUrl)
    await waitFor(() => {
      assert.equal(probe.qaPosts.length, 1)
      assert.match(renderedText(fixture.root), /answer-for-post-1/)
    }, 'first conversation query did not finish')

    await setDraft(fixture.root, 'retained follow-up draft')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push(conversationUrl)
    await settleWorkflowUpdates()

    assert.equal(probe.projectLoads.length, 1)
    assert.equal(probe.qaPosts.length, 1)
    assert.equal(draftValue(fixture.root), 'retained follow-up draft')
    assert.match(renderedText(fixture.root), /answer-for-post-1/)

    const changedConversationUrl = '/?projectId=p1&conversation=oxidation'
    await fixture.router.push(changedConversationUrl)
    await waitFor(() => {
      assert.equal(probe.qaPosts.length, 2)
      assert.match(renderedText(fixture.root), /answer-for-post-2/)
    }, 'changed conversation query did not finish once')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push(changedConversationUrl)
    await settleWorkflowUpdates()
    assert.equal(probe.qaPosts.length, 2)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('cached AscQaView consumes each changed projectId query once without reloading on same-URL return', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1')
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 1)

    await fixture.router.push('/?projectId=p2')
    await waitFor(() => {
      assert.equal(probe.projectLoads.length, 2)
      assert.match(renderedText(fixture.root), /Project Two/)
    }, 'changed project query was not consumed')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p2')
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 2)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('cached AscQaView consumes each changed new query once without resetting on same-URL return', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    await setDraft(fixture.root, 'draft before new token')
    await fixture.router.push('/?projectId=p1&new=n1')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), '')

    await setDraft(fixture.root, 'draft after n1')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&new=n1')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), 'draft after n1')
    assert.equal(probe.projectLoads.length, 1)

    await fixture.router.push('/?projectId=p1&new=n2')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), '')
    await setDraft(fixture.root, 'draft after n2')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&new=n2')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), 'draft after n2')
    assert.equal(probe.projectLoads.length, 1)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('cached AscQaView waits for an in-flight monitor project refresh before consuming a new conversation token', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    let finishProjectRefresh
    probe.deferredProjectLoads.push(new Promise(resolve => { finishProjectRefresh = resolve }))
    probe.monitor.state.completedRevision += 1
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'monitor refresh did not start')

    const conversationUrl = '/?projectId=p1&conversation=thermal-shock'
    await fixture.router.push(conversationUrl)
    await settleWorkflowUpdates()
    assert.equal(probe.qaPosts.length, 0)

    finishProjectRefresh()
    await waitFor(() => {
      assert.equal(probe.qaPosts.length, 1)
      assert.match(renderedText(fixture.root), /answer-for-post-1/)
    }, 'conversation query was lost after the project refresh')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push(conversationUrl)
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 2)
    assert.equal(probe.qaPosts.length, 1)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})
