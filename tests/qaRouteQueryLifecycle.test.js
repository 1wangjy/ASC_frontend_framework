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

  export async function getProject(projectId) {
    const project = probe().projects.find(item => (item.project_id || item.projectId) === projectId)
    if (!project) {
      const error = new Error('project not found')
      error.response = { status: 404 }
      throw error
    }
    return {
      data: {
        ...project,
        project_id: project.project_id || project.projectId,
        graph_id: project.graph_id || project.graphId
      }
    }
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

const reportApiProbeSource = `
  export async function listReports() {
    const probe = globalThis.${QA_PROBE_KEY}
    probe.reportLoads += 1
    const deferredLoad = probe.deferredReportLoads.shift()
    if (deferredLoad) await deferredLoad
    return {
      success: true,
      data: probe.reports.map(report => ({ ...report }))
    }
  }
`

const DocumentsView = defineComponent({
  name: 'DocumentsView',
  setup: () => () => h('p', 'documents')
})

function createProbe() {
  const probe = {
    projectLoads: [],
    reportLoads: 0,
    qaPosts: [],
    deferredProjectLoads: [],
    deferredReportLoads: [],
    projects: [
      { projectId: 'p1', graphId: 'g1', simulationId: 's1', name: 'Project One', status: 'graph_completed', stage: 'professional' },
      { projectId: 'p2', graphId: 'g2', simulationId: 's2', name: 'Project Two', status: 'graph_completed', stage: 'professional' }
    ],
    reports: [
      { project_id: 'p1', graph_id: 'g1', simulation_id: 's1', report_id: 'r1', status: 'completed' },
      { project_id: 'p2', graph_id: 'g2', simulation_id: 's2', report_id: 'r2', status: 'completed' }
    ]
  }
  probe.monitor = {
    state: reactive({ completedRevision: 0, items: probe.projects }),
    async refresh() {
      probe.projectLoads.push({ limit: 50 })
      const deferredLoad = probe.deferredProjectLoads.shift()
      if (deferredLoad) await deferredLoad
      probe.monitor.state.items = probe.projects.map(project => ({ ...project }))
    }
  }
  return probe
}

async function mountQa(initialPath = '/?projectId=p1&reportId=r1') {
  return mountWorkflowRoutes({
    initialPath,
    moduleOverrides: {
      'src/api/graph.js': graphApiProbeSource,
      'src/api/report.js': reportApiProbeSource,
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

async function clickButton(root, label) {
  const button = findRenderedNode(
    root,
    node => node?.type === 'button' && renderedText(node).includes(label)
  )
  assert.ok(button, `expected button ${label}`)
  const handlers = Array.isArray(button.props.onClick)
    ? button.props.onClick
    : [button.props.onClick]
  for (const handler of handlers) {
    if (typeof handler === 'function') await handler({ stopPropagation() {} })
  }
  await settleWorkflowUpdates()
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

test('selects a qualified project in the overlay and writes the matched project and report route pair', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/')

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial qualification did not load')
    assert.equal(fixture.router.currentRoute.value.query.projectId, undefined)
    await clickButton(fixture.root, '选择图谱')
    await clickButton(fixture.root, 'Project One')

    await waitFor(() => {
      assert.equal(fixture.router.currentRoute.value.query.projectId, 'p1')
      assert.equal(fixture.router.currentRoute.value.query.reportId, 'r1')
    }, 'qualified selection did not update both route IDs')
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('keeps the composer disabled when no completed report qualifies', async () => {
  const probe = createProbe()
  probe.reports = probe.reports.map(report => ({ ...report, status: 'generating' }))
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/')

  try {
    await waitFor(() => assert.equal(probe.reportLoads, 1), 'report qualification did not load')
    await waitFor(() => {
      assert.match(renderedText(fixture.root), /已完成报告的图谱项目/)
      const sendButton = findRenderedNode(
        fixture.root,
        node => node?.type === 'button' && renderedText(node).includes('生成中')
      )
      assert.equal(sendButton?.props?.disabled, true)
    }, 'composer was not disabled for an empty qualified-project list')
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('rejects a route whose project and report do not identify the same qualified record', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=p1&reportId=r2')

  try {
    await waitFor(() => assert.equal(probe.reportLoads, 1), 'report qualification did not load')
    assert.doesNotMatch(renderedText(fixture.root), /Project One/)
    const sendButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('生成中')
    )
    assert.equal(sendButton?.props?.disabled, true)
    assert.equal(probe.qaPosts.length, 0)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('cached AscQaView consumes a qualified conversation query once and preserves its draft and result on same-URL return', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    const conversationUrl = '/?projectId=p1&reportId=r1&conversation=thermal-shock'
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

    const changedConversationUrl = '/?projectId=p1&reportId=r1&conversation=oxidation'
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

test('cached AscQaView consumes each changed project and report pair once without reloading on same-URL return', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 1), 'initial project list did not load')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&reportId=r1')
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 1)

    await fixture.router.push('/?projectId=p2&reportId=r2')
    await waitFor(() => {
      assert.equal(probe.projectLoads.length, 2)
      assert.match(renderedText(fixture.root), /Project Two/)
    }, 'changed project query was not consumed')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p2&reportId=r2')
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
    await fixture.router.push('/?projectId=p1&reportId=r1&new=n1')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), '')

    await setDraft(fixture.root, 'draft after n1')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&reportId=r1&new=n1')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), 'draft after n1')
    assert.equal(probe.projectLoads.length, 1)

    await fixture.router.push('/?projectId=p1&reportId=r1&new=n2')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), '')
    await setDraft(fixture.root, 'draft after n2')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&reportId=r1&new=n2')
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

    const conversationUrl = '/?projectId=p1&reportId=r1&conversation=thermal-shock'
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
