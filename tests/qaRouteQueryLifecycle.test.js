import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
    const deferredAnswer = probe().deferredQaAnswers.shift()
    if (deferredAnswer) await deferredAnswer
    return {
      success: true,
      data: {
        qa_run_id: 'run-' + postNumber,
        final_answer: 'answer-for-post-' + postNumber,
        ...(probe().qaResponseData || {}),
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

const multiDiscussionApiProbeSource = `
  export async function getMultiDiscussionCapabilities() {
    return {
      data: {
        default_model_mode: 'default',
        model_modes: [{ mode: 'default', label: '默认模式', model: 'qwen-test' }],
        vision: { vision_ready: true, vision_model: 'qwen-test' },
        image_limits: { max_images: 6, max_image_bytes: 12582912 }
      }
    }
  }

  export async function getMultiDiscussionConversation() {
    return { data: { messages: [] } }
  }

  export async function getMultiDiscussionProgress() {
    return { data: {} }
  }

  export async function sendMultiDiscussionMessage() {
    throw new Error('sending multi-turn questions is outside this page-switch test')
  }

  export function resolveMultiDiscussionAssetUrl(path) {
    return path || ''
  }
`

const reportApiProbeSource = `
  export async function getReport(reportId) {
    const report = globalThis.${QA_PROBE_KEY}.reports.find(item => item.report_id === reportId)
    if (!report) throw new Error('report not found')
    return { success: true, data: { ...report } }
  }

  export async function listReports() {
    const probe = globalThis.${QA_PROBE_KEY}
    probe.reportLoads += 1
    if (probe.projectError) throw probe.projectError
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
    deferredQaAnswers: [],
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
    state: reactive({ completedRevision: 0, items: probe.projects, running: false }),
    async start() {
      probe.monitor.state.running = true
      try { await probe.monitor.refresh() } catch (_) { /* The real monitor reports offline without rejecting start. */ }
    },
    stop() { probe.monitor.state.running = false },
    async refresh() {
      probe.projectLoads.push({ limit: 50 })
      if (probe.projectError) throw probe.projectError
      const deferredLoad = probe.deferredProjectLoads.shift()
      if (deferredLoad) await deferredLoad
      probe.monitor.state.items = probe.projects.map(project => ({ ...project }))
    }
  }
  return probe
}

async function mountQa(initialPath = '/?projectId=p1&reportId=r1', options = {}) {
  const moduleOverrides = {
    'src/api/graph.js': graphApiProbeSource,
    'src/api/report.js': reportApiProbeSource,
    'src/features/tasks/graphTaskMonitor.js': graphTaskMonitorProbeSource
  }
  if (options.stubMultiDiscussion === true) {
    moduleOverrides['src/features/qa/multiDiscussion/api.js'] = multiDiscussionApiProbeSource
    moduleOverrides['src/features/qa/multiDiscussion/api'] = multiDiscussionApiProbeSource
  }
  const queryUrl = new URL(initialPath, 'http://qa.test')
  if (!queryUrl.searchParams.has('mode')) queryUrl.searchParams.set('mode', 'single')
  return mountWorkflowRoutes({
    initialPath: queryUrl.pathname + queryUrl.search,
    moduleOverrides,
    routes: [
      { path: '/', alias: '/research', name: 'AscQa', component: '/src/views/AscQaView.vue' },
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

function projectContextText(root) {
  return renderedText(findRenderedNode(root, node => hasRenderedClass(node, 'qa-project-context')))
}

function findTextarea(root) {
  return findRenderedNode(root, node => node?.type === 'textarea')
}

test('switches between the single-turn home and the graph-scoped multi-turn page', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa(undefined, { stubMultiDiscussion: true })

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    assert.match(renderedText(fixture.root), /今天想研究什么？/)

    await clickButton(fixture.root, '智能会话')
    await clickButton(fixture.root, '原知识对话（兼容入口）')
    await waitFor(
      () => assert.match(renderedText(fixture.root), /从一个图谱问题开始/),
      'multi-turn page did not replace the single-turn home'
    )

    const multiPage = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-multi-page'))
    assert.ok(multiPage)
    assert.match(renderedText(multiPage), /围绕当前图谱提出第一个问题，后续追问将自动继承上下文/)
    assert.doesNotMatch(renderedText(multiPage), /尚未开始会话|固定作用域/)
    assert.ok(findRenderedNode(multiPage, node => hasRenderedClass(node, 'qa-multi-page__workspace--empty')))
    assert.match(renderedText(multiPage), /为什么 SiC 含量会影响抗氧化性能？/)
    assert.match(renderedText(multiPage), /这些机制中，哪一种更可能主导损伤？/)
    assert.match(renderedText(multiPage), /这个结论有哪些关键依据和适用边界？/)
    assert.doesNotMatch(renderedText(multiPage), /材料基础与体系设计|制备成型与工艺控制/)
    assert.equal(
      findRenderedNodes(multiPage, node => hasRenderedClass(node, 'multi-discussion-guide')).length,
      3
    )

    await clickButton(fixture.root, '为什么 SiC 含量会影响抗氧化性能？')
    assert.equal(draftValue(fixture.root), '为什么 SiC 含量会影响抗氧化性能？')

    await clickButton(fixture.root, '深度研究')
    await waitFor(
      () => assert.match(renderedText(fixture.root), /今天想研究什么？/),
      'single-turn home did not return'
    )
    assert.equal(findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-multi-page')), null)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('restores a graph discussion into the bounded history workspace', async () => {
  const previousStorage = globalThis.localStorage
  const values = new Map([
    ['nexus_multi_discussion_v1:g1', JSON.stringify({
      conversationId: 'md_graph_1',
      messages: [
        { localId: 'user-1', role: 'user', content: '历史问题', createdAt: '2026-08-21T02:00:00.000Z' },
        { localId: 'assistant-1', role: 'assistant', content: '历史回答', createdAt: '2026-08-21T02:01:00.000Z' }
      ]
    })]
  ])
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
  const probe = createProbe()
  probe.projects = probe.projects.map(project => ({ ...project, runnerStatus: 'completed' }))
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa(undefined, { stubMultiDiscussion: true })

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await waitFor(
      () => assert.match(projectContextText(fixture.root), /Project One/),
      'qualified graph project was not selected'
    )
    await clickButton(fixture.root, '智能会话')
    await clickButton(fixture.root, '原知识对话（兼容入口）')
    await waitFor(
      () => assert.match(renderedText(fixture.root), /与当前图谱持续讨论/),
      'saved multi-turn history did not select the history presentation'
    )

    const multiPage = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-multi-page'))
    assert.match(renderedText(multiPage), /延续已有讨论上下文，继续追问、验证与深入分析/)
    assert.match(renderedText(multiPage), /已记忆 1 轮/)
    assert.match(renderedText(multiPage), /历史问题/)
    assert.ok(findRenderedNode(multiPage, node => hasRenderedClass(node, 'qa-multi-page__workspace--history')))
    assert.equal(findRenderedNodes(multiPage, node => hasRenderedClass(node, 'multi-discussion-guide')).length, 0)

    await clickButton(fixture.root, '新建会话')
    await waitFor(
      () => assert.match(renderedText(fixture.root), /从一个图谱问题开始/),
      'new discussion did not return to the empty presentation'
    )
    assert.doesNotMatch(renderedText(multiPage), /已记忆 1 轮|固定作用域|历史问题/)
    assert.ok(findRenderedNode(multiPage, node => hasRenderedClass(node, 'qa-multi-page__workspace--empty')))
    assert.equal(values.has('nexus_multi_discussion_v1:g1'), false)
  } finally {
    await fixture.close()
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
    delete globalThis[QA_PROBE_KEY]
  }
})

function hasRenderedClass(node, className) {
  const values = Array.isArray(node?.props?.class)
    ? node.props.class.flat(Infinity)
    : [node?.props?.class]
  return values.some(value => String(value || '').split(/\s+/).includes(className))
}

function findRenderedNodes(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node)
  for (const child of node?.children || []) findRenderedNodes(child, predicate, matches)
  return matches
}

async function clickButton(root, label) {
  const button = findRenderedNode(
    root,
    node => node?.type === 'button' && renderedText(node).includes(label)
  )
  assert.ok(button, `expected button ${label}`)
  button.focus?.()
  const handlers = Array.isArray(button.props.onClick)
    ? button.props.onClick
    : [button.props.onClick]
  for (const handler of handlers) {
    if (typeof handler === 'function') await handler({ stopPropagation() {} })
  }
  await settleWorkflowUpdates()
}

async function submitComposer(root) {
  const form = findRenderedNode(root, node => node?.type === 'form' && node.props?.class === 'composer')
  assert.ok(form, 'expected the real QuestionComposer form')
  const handlers = Array.isArray(form.props.onSubmit) ? form.props.onSubmit : [form.props.onSubmit]
  for (const handler of handlers) {
    if (typeof handler === 'function') await handler({ preventDefault() {} })
  }
  await settleWorkflowUpdates()
}

async function setDraft(root, value) {
  const textarea = findTextarea(root)
  assert.ok(textarea, 'expected the real QuestionComposer textarea')
  if (textarea.props['onUpdate:modelValue']) await textarea.props['onUpdate:modelValue'](value)
  else await textarea.props.onInput({ target: { value } })
  await nextTick()
}

function draftValue(root) {
  const textarea = findTextarea(root)
  assert.ok(textarea, 'expected the real QuestionComposer textarea')
  return textarea.props.value
}

test('selects a qualified project in the overlay and writes the project route without requiring a report', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/')

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial qualification did not load')
    assert.equal(fixture.router.currentRoute.value.query.projectId, undefined)
    await clickButton(fixture.root, '选择图谱')
    await clickButton(fixture.root, 'Project One')

    await waitFor(() => {
      assert.equal(fixture.router.currentRoute.value.query.projectId, 'p1')
      assert.equal(fixture.router.currentRoute.value.query.reportId, undefined)
    }, 'qualified selection did not update the project ID')
    assert.equal(probe.projectLoads.length, 3)
    assert.equal(probe.reportLoads, 0)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('keeps the composer disabled when no completed graph qualifies', async () => {
  const probe = createProbe()
  probe.projects = probe.projects.map(project => ({ ...project, status: 'graph_building', stage: 'building' }))
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/')

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'project qualification did not load')
    await waitFor(() => {
      assert.match(projectContextText(fixture.root), /未选择项目/)
      const sendButton = findRenderedNode(
        fixture.root,
        node => node?.type === 'button' && node.props?.class === 'send-button'
      )
      assert.equal(sendButton?.props?.disabled, true)
    }, 'composer was not disabled for an empty qualified-project list')
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('rejects a route whose explicit project does not exist', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=missing&reportId=r2')

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'project qualification did not load')
    assert.doesNotMatch(projectContextText(fixture.root), /Project One/)
    const sendButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && node.props?.class === 'send-button'
    )
    assert.equal(sendButton?.props?.disabled, true)
    assert.equal(probe.qaPosts.length, 0)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('keeps an invalid project route unselected when retry succeeds instead of falling back to storage', async () => {
  const previousStorage = globalThis.localStorage
  const values = new Map([['nexus_active_project_id', 'p1']])
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }
  const probe = createProbe()
  probe.projectError = new Error('project service unavailable')
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=missing&reportId=r2')

  try {
    await waitFor(() => assert.ok(findRenderedNode(fixture.root, node => node?.type === 'button' && renderedText(node) === '重试')), 'initial retry control did not render')
    probe.projectError = null
    await clickButton(fixture.root, '重试')
    await waitFor(() => assert.equal(probe.projectLoads.length, 3), 'retry did not reload qualification')

    assert.equal(fixture.router.currentRoute.value.query.projectId, 'missing')
    assert.equal(fixture.router.currentRoute.value.query.reportId, 'r2')
    assert.doesNotMatch(projectContextText(fixture.root), /Project One/)
    const sendButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && node.props?.class === 'send-button'
    )
    assert.equal(sendButton?.props?.disabled, true)
  } finally {
    await fixture.close()
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
    delete globalThis[QA_PROBE_KEY]
  }
})

test('changing a qualified route into an invalid project clears its old QA context', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=p1&reportId=r1&conversation=thermal-shock')

  try {
    await waitFor(() => assert.match(renderedText(fixture.root), /answer-for-post-1/), 'initial answer did not finish')
    await fixture.router.push('/?projectId=missing&reportId=r2')
    await waitFor(() => {
      assert.equal(probe.projectLoads.length, 3)
      assert.doesNotMatch(renderedText(fixture.root), /answer-for-post-1/)
      assert.doesNotMatch(projectContextText(fixture.root), /Project One/)
    }, 'invalid project scope did not clear its prior context')
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('changing the qualified route scope clears old QA and ignores its late answer', async () => {
  const probe = createProbe()
  let finishOldAnswer
  probe.deferredQaAnswers.push(new Promise(resolve => { finishOldAnswer = resolve }))
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=p1&reportId=r1')

  try {
    await waitFor(() => assert.match(projectContextText(fixture.root), /Project One/), 'initial scope did not qualify')
    await setDraft(fixture.root, 'old scoped question')
    await submitComposer(fixture.root)
    await waitFor(() => assert.equal(probe.qaPosts.length, 1), 'old question did not start')

    await fixture.router.push('/?projectId=p2&reportId=r2')
    await waitFor(() => assert.match(projectContextText(fixture.root), /Project Two/), 'new scope did not qualify')
    assert.doesNotMatch(renderedText(fixture.root), /old scoped question/)

    finishOldAnswer()
    await settleWorkflowUpdates()
    assert.doesNotMatch(renderedText(fixture.root), /answer-for-post-1/)

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p2&reportId=r2')
    await settleWorkflowUpdates()
    assert.match(projectContextText(fixture.root), /Project Two/)
    assert.equal(probe.projectLoads.length, 3)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('project selector traps keyboard focus and restores the opener when closed', async () => {
  const selectorSource = readFileSync(new URL('../src/features/qa/QaProjectSelector.vue', import.meta.url), 'utf8')
  assert.match(selectorSource, /activeElement\s*===\s*dialog\.value/)

  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa('/?projectId=p1&reportId=r1')

  try {
    await waitFor(() => assert.match(projectContextText(fixture.root), /Project One/), 'initial scope did not qualify')
    const opener = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('更换图谱')
    )
    assert.ok(opener)
    opener.focus()
    await clickButton(fixture.root, '更换图谱')

    const dialog = findRenderedNode(fixture.root, node => node?.props?.role === 'dialog')
    assert.ok(dialog)
    assert.equal(fixture.document.activeElement, dialog)
    assert.equal(dialog.contains(fixture.document.activeElement), true)
    const focusable = dialog.querySelectorAll()
    const first = focusable[0]
    const last = focusable.at(-1)
    assert.notEqual(first, dialog)
    assert.notEqual(last, dialog)

    let initialBackwardPrevented = false
    let initialBackwardActiveElement = null
    await dialog.props.onKeydown({
      key: 'Tab',
      shiftKey: true,
      preventDefault: () => {
        initialBackwardActiveElement = fixture.document.activeElement
        initialBackwardPrevented = true
      },
      stopPropagation() {}
    })
    assert.equal(initialBackwardActiveElement, dialog)
    assert.equal(initialBackwardPrevented, true)
    assert.equal(fixture.document.activeElement, last)

    dialog.focus()
    let initialForwardPrevented = false
    await dialog.props.onKeydown({
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => { initialForwardPrevented = true },
      stopPropagation() {}
    })
    assert.equal(initialForwardPrevented, true)
    assert.equal(fixture.document.activeElement, first)

    last.focus()
    let forwardPrevented = false
    await dialog.props.onKeydown({ key: 'Tab', shiftKey: false, preventDefault: () => { forwardPrevented = true }, stopPropagation() {} })
    assert.equal(forwardPrevented, true)
    assert.equal(fixture.document.activeElement, first)

    first.focus()
    let backwardPrevented = false
    await dialog.props.onKeydown({ key: 'Tab', shiftKey: true, preventDefault: () => { backwardPrevented = true }, stopPropagation() {} })
    assert.equal(backwardPrevented, true)
    assert.equal(fixture.document.activeElement, last)

    await dialog.props.onKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
    await settleWorkflowUpdates()
    assert.equal(findRenderedNode(fixture.root, node => node?.props?.role === 'dialog'), null)
    assert.equal(fixture.document.activeElement, opener)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('deactivation keeps the QA project controller alive but real unmount stops it once', async () => {
  const probe = createProbe()
  probe.controllerStops = 0
  globalThis[QA_PROBE_KEY] = probe
  const controllerProbeSource = `
    export function createQaProjectContextController({ onChange }) {
      const probe = globalThis.${QA_PROBE_KEY}
      const selected = {
        projectId: 'p1', graphId: 'g1', simulationId: 's1', reportId: 'r1',
        projectName: 'Project One', reportStatus: 'completed', project: { project_id: 'p1', graph_id: 'g1' }
      }
      const state = { loading: false, records: [selected], selected, error: '', requestVersion: 0 }
      return {
        async refresh() { onChange(structuredClone(state)); return structuredClone(state) },
        select() { return true },
        clear() { state.selected = null; onChange(structuredClone(state)) },
        snapshot() { return structuredClone(state) },
        stop() { probe.controllerStops += 1 }
      }
    }
  `
  const fixture = await mountWorkflowRoutes({
    initialPath: '/?projectId=p1&reportId=r1&mode=single',
    moduleOverrides: {
      'src/api/graph.js': graphApiProbeSource,
      'src/api/report.js': reportApiProbeSource,
      'src/features/tasks/graphTaskMonitor.js': graphTaskMonitorProbeSource,
      'src/features/qa/qaProjectContextController.js': controllerProbeSource
    },
    routes: [
      { path: '/', alias: '/research', name: 'AscQa', component: '/src/views/AscQaView.vue' },
      { path: '/documents', name: 'Documents', component: DocumentsView }
    ]
  })

  try {
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    assert.equal(probe.controllerStops, 0)
  } finally {
    await fixture.close()
    assert.equal(probe.controllerStops, 1)
    delete globalThis[QA_PROBE_KEY]
  }
})

test('cached AscQaView consumes a qualified single-turn query once and preserves its result without a follow-up composer', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    const conversationUrl = '/?projectId=p1&reportId=r1&conversation=thermal-shock'
    await fixture.router.push(conversationUrl)
    await waitFor(() => {
      assert.equal(probe.qaPosts.length, 1)
      assert.match(renderedText(fixture.root), /answer-for-post-1/)
    }, 'first conversation query did not finish')

    assert.equal(findTextarea(fixture.root), null)
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push(conversationUrl)
    await settleWorkflowUpdates()

    assert.equal(probe.projectLoads.length, 2)
    assert.equal(probe.qaPosts.length, 1)
    assert.equal(findTextarea(fixture.root), null)
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

test('single-turn result connects the real answer and reasoning modules without mixing their content', async () => {
  const probe = createProbe()
  probe.qaResponseData = {
    llm_cod_direct_answer: '<p>真实 LLMs + CoD 主回答<c>R1</c></p>',
    cod_direct_answer: [
      '<div class="cod-direct-answer-block"><i>真实 CoD 内容<c>R1</c></i></div>',
      '<div class="omd-direct-answer-block"><strong>真实 OMD 内容</strong></div>'
    ].join(''),
    logic_chain_derivation: '真实详细推理链内容',
    qa_quantitative_metrics: {
      confidence_score: 0.91,
      evidence_strength_score: 0.82,
      ontology_alignment_score: 0.77,
      path_validity_score: 0.84,
      condition_completeness_score: 0.69,
      risk_control_score: 0.73
    },
    reasoning_route: {
      selected_mode: 'tot',
      reason: '真实 ToT 路由',
      structural_score: 0.75,
      semantic_score: 0.66,
      structural_metrics: {
        mechanism_coverage_score: 0.81,
        path_evidence_alignment_score: 0.79,
        reasoning_readiness_score: 0.76,
        max_path_length: 4
      }
    },
    routed_reasoning_paths: [{ natural_language_path: '路径甲 -> 路径乙' }]
  }
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await fixture.router.push('/?projectId=p1&reportId=r1&conversation=thermal-shock')
    await waitFor(() => {
      assert.equal(probe.qaPosts.length, 1)
      assert.match(renderedText(fixture.root), /真实 LLMs \+ CoD 主回答/)
    }, 'single-turn answer did not finish')

    const pageText = renderedText(fixture.root)
    assert.match(pageText, /问题摘要/)
    assert.match(pageText, /当前问答模式/)
    assert.match(pageText, /深度研究/)
    assert.match(pageText, /LLMs \+ CoD 主回答/)
    assert.doesNotMatch(pageText, /查看引用证据/)
    assert.match(pageText, /查看质量评估/)
    assert.match(pageText, /回答详情/)
    assert.match(pageText, /CoD 直接回答/)
    assert.match(pageText, /OMD 本体增强/)
    assert.match(pageText, /详细推理链/)
    assert.match(pageText, /CoT \/ ToT 逻辑/)
    assert.doesNotMatch(pageText, /提交时间/)
    assert.match(pageText, /真实 CoD 内容/)

    await clickButton(fixture.root, 'OMD 本体增强')
    assert.match(renderedText(fixture.root), /真实 OMD 内容/)
    await clickButton(fixture.root, '详细推理链')
    assert.match(renderedText(fixture.root), /真实详细推理链内容/)
    await clickButton(fixture.root, 'CoT / ToT 逻辑')
    const reasoningText = renderedText(fixture.root)
    assert.match(reasoningText, /ToT/)
    assert.match(reasoningText, /真实 ToT 路由/)
    assert.match(reasoningText, /路径甲.*路径乙/)
    await clickButton(fixture.root, '查看质量评估')
    const qualityText = renderedText(fixture.root)
    assert.match(qualityText, /回答质量/)
    assert.match(qualityText, /证据强度82(?:\.00)?%/)
    assert.match(qualityText, /推理质量/)
    assert.match(qualityText, /机制覆盖度81%/)
    assert.match(qualityText, /最长推理路径4 跳/)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('single-turn result hides answer detail modules when the backend returned no detail fields', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await fixture.router.push('/?projectId=p1&reportId=r1&conversation=thermal-shock')
    await waitFor(() => assert.match(renderedText(fixture.root), /answer-for-post-1/), 'answer did not finish')

    assert.doesNotMatch(renderedText(fixture.root), /回答详情|CoD 直接回答|OMD 本体增强|详细推理链|CoT \/ ToT 逻辑/)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('single-turn loading reveals the established query stages without explanatory notices', async () => {
  const probe = createProbe()
  let finishAnswer
  probe.deferredQaAnswers.push(new Promise(resolve => { finishAnswer = resolve }))
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await fixture.router.push('/?projectId=p1&reportId=r1&conversation=thermal-shock')
    await waitFor(() => assert.equal(probe.qaPosts.length, 1), 'single-turn query did not start')

    const pageText = renderedText(fixture.root)
    assert.match(pageText, /正在执行全局查询/)
    assert.match(pageText, /LLM Initial Answer（初步回答）/)
    assert.match(pageText, /Query Decomposition/)
    assert.match(pageText, /Answer Synthesis（受约束综合）/)
    assert.match(pageText, /执行中/)
    assert.match(pageText, /等待中/)
    assert.doesNotMatch(pageText, /已向后端提交请求/)
    assert.doesNotMatch(pageText, /页面没有卡死/)

    const session = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-session'))
    const backAction = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-result-back'))
    const summaryCard = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-result-context'))
    const summaryQuestion = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-result-context__question'))
    const modeBadge = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'qa-result-context__mode-badge'))
    const progressCard = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'query-progress'))
    const progressTitle = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'query-progress__title'))
    const elapsed = findRenderedNode(fixture.root, node => hasRenderedClass(node, 'query-progress__elapsed'))
    const steps = findRenderedNodes(fixture.root, node => hasRenderedClass(node, 'query-progress__step'))

    assert.ok(session)
    assert.equal(backAction?.parent, session)
    assert.equal(summaryCard?.parent, session)
    assert.ok(session.children.indexOf(backAction) < session.children.indexOf(summaryCard))
    assert.match(renderedText(summaryQuestion), /分析 ASC Al₂O₃-SiC-C 材料体系的热震稳定性及主要影响因素/)
    assert.equal(renderedText(modeBadge), '深度研究')
    assert.match(renderedText(progressTitle), /正在执行全局查询/)
    assert.match(renderedText(elapsed), /\d+s/)
    assert.equal(steps.length, 9)
    assert.equal(hasRenderedClass(steps.at(-1), 'query-progress__step--wide'), true)
    assert.ok(progressCard)

    finishAnswer()
    await waitFor(() => assert.match(renderedText(fixture.root), /answer-for-post-1/), 'answer did not finish')
  } finally {
    finishAnswer?.()
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})

test('result page returns to the QA home while preserving the selected project and report', async () => {
  const probe = createProbe()
  globalThis[QA_PROBE_KEY] = probe
  const fixture = await mountQa()

  try {
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await fixture.router.push('/?projectId=p1&reportId=r1&conversation=thermal-shock')
    await waitFor(() => assert.match(renderedText(fixture.root), /answer-for-post-1/), 'answer did not finish')

    await clickButton(fixture.root, '返回首页')
    await settleWorkflowUpdates()

    assert.match(renderedText(fixture.root), /今天想研究什么？/)
    assert.doesNotMatch(renderedText(fixture.root), /answer-for-post-1/)
    assert.equal(fixture.router.currentRoute.value.path, '/research')
    assert.equal(fixture.router.currentRoute.value.query.projectId, 'p1')
    assert.equal(fixture.router.currentRoute.value.query.reportId, 'r1')
    assert.equal(fixture.router.currentRoute.value.query.conversation, undefined)
    assert.equal(fixture.router.currentRoute.value.query.new, undefined)
    assert.equal(probe.projectLoads.length, 2)
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
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&reportId=r1')
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 2)

    await fixture.router.push('/?projectId=p2&reportId=r2')
    await waitFor(() => {
      assert.equal(probe.projectLoads.length, 3)
      assert.match(projectContextText(fixture.root), /Project Two/)
    }, 'changed project query was not consumed')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p2&reportId=r2')
    await settleWorkflowUpdates()
    assert.equal(probe.projectLoads.length, 3)
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
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
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
    assert.equal(probe.projectLoads.length, 2)

    await fixture.router.push('/?projectId=p1&reportId=r1&new=n2')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), '')
    await setDraft(fixture.root, 'draft after n2')

    await fixture.router.push('/documents')
    await settleWorkflowUpdates()
    await fixture.router.push('/?projectId=p1&reportId=r1&new=n2')
    await settleWorkflowUpdates()
    assert.equal(draftValue(fixture.root), 'draft after n2')
    assert.equal(probe.projectLoads.length, 2)
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
    await waitFor(() => assert.equal(probe.projectLoads.length, 2), 'initial project list did not load')
    let finishProjectRefresh
    probe.deferredProjectLoads.push(new Promise(resolve => { finishProjectRefresh = resolve }))
    probe.monitor.state.completedRevision += 1
    await waitFor(() => assert.equal(probe.projectLoads.length, 3), 'monitor refresh did not start')

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
    assert.equal(probe.projectLoads.length, 3)
    assert.equal(probe.qaPosts.length, 1)
  } finally {
    await fixture.close()
    delete globalThis[QA_PROBE_KEY]
  }
})
