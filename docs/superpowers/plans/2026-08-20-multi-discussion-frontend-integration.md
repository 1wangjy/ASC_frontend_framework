# Multi-Discussion Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the completed multi-turn question composer to the `/api/multi-discussion` backend, poll public progress safely, and render multi-turn answers without changing the existing composer controls or their styles.

**Architecture:** Keep `AscQaView.vue` as the single mode router. Add a focused Multi-Discussion feature folder containing a testable request model, an injected API client, a single-flight poller, a session composable, the migrated safe Markdown renderer, and a temporary answer-only component. `QuestionComposer.vue` remains the only input toolbar; the new answer component owns no graph selector or duplicate composer.

**Tech Stack:** Vue 3 Composition API, Vite 7, Axios, JavaScript ES modules, Node.js built-in test runner, existing Vite SSR and in-memory Vue test helpers.

## Global Constraints

- Do not change the current Multi-Discussion composer control order, DOM layout, dimensions, colors, borders, radii, spacing, typography, icons, or scoped CSS.
- Preserve the current first-screen title, textarea, mode switch, and recommendation-card layout.
- Model option labels may change only because `/api/multi-discussion/capabilities` supplies the backend's real modes.
- Keep the existing single-turn CoD GraphRAG request, response state, and answer UI unchanged.
- Use the shared Axios client and relative `/api` URLs so Vite continues to route Multi-Discussion to the Python backend on port `5000`.
- Never hard-code the old source frontend's `http://127.0.0.1:5001` base URL.
- The first turn omits `conversation_id`; every accepted follow-up uses the backend-returned `conversation_id`.
- Every turn has a new `request_id`; stale progress and answer responses must not overwrite the active turn.
- One turn may upload the single image currently supported by the existing `QuestionComposer.vue`; transport it as the backend `images` multipart field.
- Do not modify the Multi-Discussion backend, the `3001` data-platform integration, or unrelated dirty-worktree files.

---

## File Map

**Create:**

- `src/features/qa/multiDiscussion/multiDiscussionModel.js` — pure model-mode, request, response, history, scope, and progress adapters.
- `src/features/qa/multiDiscussion/multiDiscussionApi.js` — injectable Axios transport for capabilities, chat, progress, history, and asset URLs.
- `src/features/qa/multiDiscussion/multiDiscussionPoller.js` — restartable single-flight progress poller.
- `src/features/qa/multiDiscussion/useMultiDiscussionSession.js` — Vue session orchestration and browser persistence.
- `src/features/qa/multiDiscussion/markdown.js` — migrated escaped Markdown, tables, chemical formulae, and limited LaTeX rendering.
- `src/features/qa/multiDiscussion/MultiDiscussionConversation.vue` — answer-only temporary message and progress presentation.
- `tests/multiDiscussionModel.test.js` — pure payload and adapter coverage.
- `tests/multiDiscussionApi.test.js` — exact HTTP config and multipart coverage.
- `tests/multiDiscussionPoller.test.js` — overlap, stale response, terminal state, and retry coverage.
- `tests/multiDiscussionSession.test.js` — first turn, follow-up, persistence, restore, scope, and teardown coverage.
- `tests/multiDiscussionRendering.test.js` — safe Markdown and answer component rendering coverage.
- `tests/multiDiscussionViewIntegration.test.js` — `AscQaView` wiring and first-screen/style contract coverage.

**Modify:**

- `src/features/qa/QuestionComposer.vue` — activate the existing multi-turn controls and emit their values without changing scoped CSS.
- `src/views/AscQaView.vue` — branch single versus multi submission, load capabilities, host the session, and render the temporary answer component.
- `tests/questionComposerMulti.test.js` — replace the disabled-placeholder expectations with live-control behavior.
- `tests/qaModeSwitch.test.js` — update the multi-turn send-button expectation while preserving single-turn behavior.
- `tests/graphScopedQaFlow.test.js` — assert that Multi-Discussion receives the currently qualified project and graph scope.

---

### Task 1: Define the Multi-Discussion request and response contract

**Files:**

- Create: `src/features/qa/multiDiscussion/multiDiscussionModel.js`
- Create: `tests/multiDiscussionModel.test.js`

**Interfaces:**

- Produces: `FALLBACK_MODEL_MODES`, `adaptModelModes(payload)`, `buildMultiDiscussionTurn(input)`, `adaptMultiDiscussionMessage(message)`, `adaptMultiDiscussionReply(payload)`, `assertMultiDiscussionScope(payload, scope)`, `isTerminalProgress(payload)`, and `createMultiDiscussionRequestId(runtime)`.
- `buildMultiDiscussionTurn(input)` returns `{ data, images }`, where `data` is JSON-safe and `images` is an array containing zero or one `File`-like value.
- Later tasks consume the normalized message shape `{ localId, role, content, createdAt, references, attachments, visualAnalysis, materialKnowledge, materialAnalysisPlan, multimodalRoute, activeImageContext, visualEvidence, multimodalContent, modelSelection }`.

- [ ] **Step 1: Write the failing model tests**

Create tests that lock the backend contract:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptModelModes,
  buildMultiDiscussionTurn,
  createMultiDiscussionRequestId,
  isTerminalProgress
} from '../src/features/qa/multiDiscussion/multiDiscussionModel.js'

test('uses backend model modes and its declared default', () => {
  const result = adaptModelModes({
    default_model_mode: 'fast_interactive',
    model_modes: [
      { mode: 'default', label: '默认模式', model: 'qwen/qwen3-vl-32b-instruct' },
      { mode: 'fast_interactive', label: '快速交互模式', model: 'google/gemini-3.6-flash' }
    ]
  })
  assert.equal(result.defaultMode, 'fast_interactive')
  assert.deepEqual(result.options.map(item => item.value), ['default', 'fast_interactive'])
})

test('builds the first turn without conversation_id and maps all composer controls', () => {
  const image = { name: 'sem.png', type: 'image/png', size: 1024 }
  const result = buildMultiDiscussionTurn({
    question: ' 如何结合 XRD 与 SEM 判断物相演变？ ',
    scope: { project_id: 'proj_1', graph_id: 'graph_1' },
    requestId: 'mdp_request_1',
    modelMode: 'fast_interactive',
    reasoning: 'CoT',
    multiModule: 'inline',
    image
  })
  assert.equal(result.data.question, '如何结合 XRD 与 SEM 判断物相演变？')
  assert.equal(result.data.project_id, 'proj_1')
  assert.equal(result.data.graph_id, 'graph_1')
  assert.equal(result.data.request_id, 'mdp_request_1')
  assert.equal(result.data.model_mode, 'fast_interactive')
  assert.equal(result.data.options.reasoning_mode, 'cot')
  assert.equal(result.data.enable_multimodal_response, true)
  assert.equal(result.data.multimodal_render_mode, 'inline')
  assert.equal(Object.hasOwn(result.data, 'conversation_id'), false)
  assert.deepEqual(result.images, [image])
})

test('builds a follow-up with conversation_id and evidence-section rendering', () => {
  const result = buildMultiDiscussionTurn({
    question: '有哪些相反证据？',
    scope: { project_id: 'proj_1', graph_id: 'graph_1' },
    conversationId: 'md_0123456789abcdef',
    requestId: 'mdp_request_2',
    modelMode: 'default',
    reasoning: 'ToT',
    multiModule: 'evidence'
  })
  assert.equal(result.data.conversation_id, 'md_0123456789abcdef')
  assert.equal(result.data.options.reasoning_mode, 'tot')
  assert.equal(result.data.multimodal_render_mode, 'evidence_section')
  assert.deepEqual(result.images, [])
})

test('recognizes only completed and failed progress as terminal', () => {
  assert.equal(isTerminalProgress({ status: 'running' }), false)
  assert.equal(isTerminalProgress({ status: 'completed' }), true)
  assert.equal(isTerminalProgress({ status: 'failed' }), true)
})

test('creates a stable prefixed request id from injected crypto', () => {
  const id = createMultiDiscussionRequestId({ randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' })
  assert.equal(id, 'mdp_123e4567e89b12d3a456426614174000')
})
```

- [ ] **Step 2: Run the model test and verify RED**

Run:

```powershell
node --test tests/multiDiscussionModel.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `multiDiscussionModel.js`.

- [ ] **Step 3: Implement the pure contract model**

Implement exact mappings and validation:

```js
const REASONING_MODES = Object.freeze({ Auto: 'auto', CoT: 'cot', ToT: 'tot' })

export const FALLBACK_MODEL_MODES = Object.freeze([
  { value: 'default', label: '默认模式 · Qwen3-VL 32B', model: 'qwen/qwen3-vl-32b-instruct' },
  { value: 'quality_expert', label: '高质量专家模式 · Claude Opus', model: 'anthropic/claude-opus-5' },
  { value: 'fast_interactive', label: '快速交互模式 · Gemini Flash', model: 'google/gemini-3.6-flash' },
  { value: 'balanced_production', label: '默认生产模型 · GPT Terra', model: 'openai/gpt-5.6-terra' }
])

export function buildMultiDiscussionTurn(input = {}) {
  const question = String(input.question || '').trim()
  const projectId = String(input.scope?.project_id || '').trim()
  const graphId = String(input.scope?.graph_id || '').trim()
  if (!question && !input.image) throw new Error('请输入问题或选择图片')
  if (!projectId || !graphId) throw new Error('多轮问答需要有效的 project_id 和 graph_id')
  const data = {
    question,
    project_id: projectId,
    graph_id: graphId,
    request_id: String(input.requestId || '').trim(),
    model_mode: String(input.modelMode || 'default').trim(),
    enable_multimodal_response: true,
    multimodal_render_mode: input.multiModule === 'evidence' ? 'evidence_section' : 'inline',
    options: {
      reasoning_mode: REASONING_MODES[input.reasoning] || 'auto',
      top_k: 10,
      top_k_subgraphs: 5,
      top_k_paths: 8,
      max_hops: 2,
      enable_llm_answer_refinement: false
    }
  }
  const conversationId = String(input.conversationId || '').trim()
  if (conversationId) data.conversation_id = conversationId
  return { data, images: input.image ? [input.image] : [] }
}
```

Add these adapters below the request builder; project and graph IDs come only from the authoritative scope object:

```js
export function adaptModelModes(payload = {}) {
  const raw = Array.isArray(payload.model_modes) ? payload.model_modes : []
  const options = raw
    .map(item => ({
      value: String(item?.mode || '').trim(),
      label: [item?.label, item?.model].filter(Boolean).join(' · '),
      model: String(item?.model || '').trim()
    }))
    .filter(item => item.value && item.label)
  const resolved = options.length ? options : FALLBACK_MODEL_MODES.map(item => ({ ...item }))
  const requestedDefault = String(payload.default_model_mode || '').trim()
  return {
    options: resolved,
    defaultMode: resolved.some(item => item.value === requestedDefault)
      ? requestedDefault
      : resolved[0].value
  }
}

export function adaptMultiDiscussionMessage(message = {}) {
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {}
  return {
    localId: String(message.message_id || message.turn_id || `message-${message.created_at || 'unknown'}`),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: String(message.content || message.answer || ''),
    createdAt: String(message.created_at || ''),
    references: Array.isArray(message.references) ? message.references : (metadata.references || []),
    attachments: Array.isArray(message.attachments) ? message.attachments : (metadata.attachments || []),
    visualAnalysis: message.visual_analysis || metadata.visual_analysis || null,
    materialKnowledge: message.material_knowledge || metadata.material_knowledge || null,
    materialAnalysisPlan: message.material_analysis_plan || metadata.material_analysis_plan || null,
    multimodalRoute: message.multimodal_route || metadata.multimodal_route || null,
    activeImageContext: message.active_image_context || metadata.active_image_context || [],
    visualEvidence: message.visual_evidence || metadata.visual_evidence || null,
    multimodalContent: message.multimodal_content || metadata.multimodal_content || null,
    modelSelection: message.model_selection || metadata.model_selection || null
  }
}

export function adaptMultiDiscussionReply(payload = {}) {
  return {
    conversationId: String(payload.conversation_id || '').trim(),
    message: adaptMultiDiscussionMessage({
      ...payload,
      message_id: payload.turn_id,
      role: 'assistant',
      content: payload.answer
    })
  }
}

export function assertMultiDiscussionScope(payload = {}, scope = {}) {
  if (String(payload.project_id || '') !== String(scope.project_id || '')) {
    throw new Error('后端返回的 project_id 与当前项目不一致')
  }
  if (String(payload.graph_id || '') !== String(scope.graph_id || '')) {
    throw new Error('后端返回的 graph_id 与当前图谱不一致')
  }
  if (!String(payload.conversation_id || '').trim()) {
    throw new Error('后端未返回 conversation_id')
  }
}

export const isTerminalProgress = payload => ['completed', 'failed'].includes(String(payload?.status || ''))

export function createMultiDiscussionRequestId(runtime = globalThis.crypto) {
  const uuid = runtime?.randomUUID?.()
  if (uuid) return `mdp_${uuid.replaceAll('-', '')}`
  return `mdp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}
```

- [ ] **Step 4: Run the model test and verify GREEN**

Run:

```powershell
node --test tests/multiDiscussionModel.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the model contract**

```powershell
git add -- src/features/qa/multiDiscussion/multiDiscussionModel.js tests/multiDiscussionModel.test.js
git commit -m "feat: define multi-discussion frontend contract"
```

---

### Task 2: Add an injectable API client with JSON and multipart transport

**Files:**

- Create: `src/features/qa/multiDiscussion/multiDiscussionApi.js`
- Create: `tests/multiDiscussionApi.test.js`

**Interfaces:**

- Consumes: `{ data, images }` from `buildMultiDiscussionTurn()`.
- Produces: `createMultiDiscussionApi(client, runtime)` returning `{ getCapabilities, sendMessage, getProgress, getConversation, resolveAssetUrl }`.
- `sendMessage(turn)` returns the shared Axios response-interceptor payload, whose business result is under `.data`.

- [ ] **Step 1: Write failing API configuration tests**

Use an injected request function and assert exact configs:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { createMultiDiscussionApi } from '../src/features/qa/multiDiscussion/multiDiscussionApi.js'

test('uses relative multi-discussion endpoints', async () => {
  const calls = []
  const api = createMultiDiscussionApi(config => {
    calls.push(config)
    return Promise.resolve({ success: true, data: {} })
  })
  await api.getCapabilities()
  await api.getProgress('mdp_a/b')
  await api.getConversation('md_0123456789abcdef')
  assert.deepEqual(calls.map(call => call.url), [
    '/api/multi-discussion/capabilities',
    '/api/multi-discussion/progress/mdp_a%2Fb',
    '/api/multi-discussion/conversations/md_0123456789abcdef'
  ])
})

test('sends JSON without images and multipart with images', async () => {
  const calls = []
  const api = createMultiDiscussionApi(config => {
    calls.push(config)
    return Promise.resolve({ success: true, data: {} })
  })
  await api.sendMessage({ data: { question: '文本轮次', options: { reasoning_mode: 'auto' } }, images: [] })
  const blob = new Blob(['png'], { type: 'image/png' })
  await api.sendMessage({ data: { question: '图片轮次', options: { reasoning_mode: 'cot' } }, images: [blob] })
  assert.deepEqual(calls[0].data, { question: '文本轮次', options: { reasoning_mode: 'auto' } })
  assert.equal(calls[1].data instanceof FormData, true)
  assert.equal(calls[1].data.get('question'), '图片轮次')
  assert.equal(calls[1].data.get('options'), JSON.stringify({ reasoning_mode: 'cot' }))
  assert.equal(calls[1].data.getAll('images').length, 1)
})
```

- [ ] **Step 2: Run the API test and verify RED**

```powershell
node --test tests/multiDiscussionApi.test.js
```

Expected: FAIL because `multiDiscussionApi.js` does not exist.

- [ ] **Step 3: Implement `createMultiDiscussionApi`**

Use the current shared client and runtime URL builder:

```js
import service from '../../../api/index.js'
import { buildApiUrl } from '../../../api/runtime.js'

export function createMultiDiscussionApi(client = service, runtime = { FormData: globalThis.FormData }) {
  const request = config => client(config)
  return {
    getCapabilities: () => request({ url: '/api/multi-discussion/capabilities', method: 'get' }),
    getProgress: requestId => request({
      url: `/api/multi-discussion/progress/${encodeURIComponent(requestId)}`,
      method: 'get',
      timeout: 10_000
    }),
    getConversation: conversationId => request({
      url: `/api/multi-discussion/conversations/${encodeURIComponent(conversationId)}`,
      method: 'get'
    }),
    resolveAssetUrl: path => /^(?:https?:|blob:|data:)/i.test(String(path || ''))
      ? String(path || '')
      : buildApiUrl(path),
    sendMessage(turn) {
      if (!turn.images.length) {
        return request({ url: '/api/multi-discussion/chat', method: 'post', data: turn.data, timeout: 15 * 60 * 1000 })
      }
      const body = new runtime.FormData()
      for (const [key, value] of Object.entries(turn.data)) {
        body.append(key, key === 'options' ? JSON.stringify(value) : String(value))
      }
      for (const image of turn.images) body.append('images', image, image.name || 'image')
      return request({ url: '/api/multi-discussion/chat', method: 'post', data: body, timeout: 15 * 60 * 1000 })
    }
  }
}

export const multiDiscussionApi = createMultiDiscussionApi()
```

- [ ] **Step 4: Run API tests and existing runtime tests**

```powershell
node --test tests/multiDiscussionApi.test.js tests/apiRuntime.test.js
```

Expected: all tests PASS and no URL contains port `5001`.

- [ ] **Step 5: Commit the API client**

```powershell
git add -- src/features/qa/multiDiscussion/multiDiscussionApi.js tests/multiDiscussionApi.test.js
git commit -m "feat: add multi-discussion api client"
```

---

### Task 3: Build a restartable single-flight progress poller

**Files:**

- Create: `src/features/qa/multiDiscussion/multiDiscussionPoller.js`
- Create: `tests/multiDiscussionPoller.test.js`

**Interfaces:**

- Produces: `createMultiDiscussionPoller({ poll, onResult, onError, shouldStop, schedule, cancel, initialDelayMs, intervalMs, maxRetryDelayMs })`.
- Returned methods: `start(requestId)`, `stop()`, and `isRunning()`.
- `poll(requestId)` receives the active request ID; a restart invalidates all earlier results.

- [ ] **Step 1: Write failing poller tests**

Cover four independent behaviors:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { createMultiDiscussionPoller } from '../src/features/qa/multiDiscussion/multiDiscussionPoller.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
}

test('keeps progress polling single-flight', async () => {
  const requests = []
  const callbacks = []
  const poller = createMultiDiscussionPoller({
    poll: () => {
      const request = deferred()
      requests.push(request)
      return request.promise
    },
    onResult: () => {},
    onError: error => { throw error },
    shouldStop: () => false,
    schedule: callback => { callbacks.push(callback); return callbacks.length },
    cancel: () => {}
  })
  poller.start('mdp_1')
  callbacks.shift()()
  assert.equal(requests.length, 1)
  requests[0].resolve({ status: 'running' })
  await Promise.resolve()
  await Promise.resolve()
  callbacks.shift()()
  assert.equal(requests.length, 2)
  poller.stop()
})

test('ignores an old response after restart', async () => {
  const oldRequest = deferred()
  const handled = []
  const callbacks = []
  const poller = createMultiDiscussionPoller({
    poll: requestId => requestId === 'old' ? oldRequest.promise : Promise.resolve({ requestId }),
    onResult: value => handled.push(value),
    onError: error => { throw error },
    shouldStop: () => false,
    schedule: callback => { callbacks.push(callback); return callbacks.length },
    cancel: () => {}
  })
  poller.start('old')
  callbacks.shift()()
  poller.start('new')
  oldRequest.resolve({ requestId: 'old' })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(handled, [])
  poller.stop()
})
```

Add these terminal and startup-race tests to the same file:

```js
test('stops after completed progress', async () => {
  const callbacks = []
  const handled = []
  const poller = createMultiDiscussionPoller({
    poll: async () => ({ status: 'completed' }),
    onResult: value => handled.push(value),
    onError: error => { throw error },
    shouldStop: value => value.status === 'completed',
    schedule: callback => { callbacks.push(callback); return callbacks.length },
    cancel: () => {}
  })
  poller.start('mdp_done')
  callbacks.shift()()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(handled, [{ status: 'completed' }])
  assert.equal(poller.isRunning(), false)
  assert.equal(callbacks.length, 0)
})

test('treats an initial 404 as a registration race and schedules the next poll', async () => {
  const callbacks = []
  const errors = []
  let attempts = 0
  const poller = createMultiDiscussionPoller({
    poll: async () => {
      attempts += 1
      if (attempts === 1) throw Object.assign(new Error('not registered'), { status: 404 })
      return { status: 'running' }
    },
    onResult: () => {},
    onError: error => errors.push(error),
    shouldStop: () => false,
    schedule: callback => { callbacks.push(callback); return callbacks.length },
    cancel: () => {}
  })
  poller.start('mdp_race')
  callbacks.shift()()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(errors, [])
  assert.equal(callbacks.length, 1)
  poller.stop()
})
```

- [ ] **Step 2: Run the poller test and verify RED**

```powershell
node --test tests/multiDiscussionPoller.test.js
```

Expected: FAIL because `multiDiscussionPoller.js` does not exist.

- [ ] **Step 3: Implement serial `setTimeout` polling**

Implement generation invalidation and schedule only after the current promise settles:

```js
export function createMultiDiscussionPoller(options) {
  let timer = null
  let running = false
  let generation = 0
  let failureCount = 0
  const schedule = options.schedule || globalThis.setTimeout
  const cancel = options.cancel || globalThis.clearTimeout

  function cancelTimer() {
    if (timer !== null) cancel(timer)
    timer = null
  }

  function queue(requestId, token, delay) {
    cancelTimer()
    if (!running || token !== generation) return
    timer = schedule(() => tick(requestId, token), delay)
  }

  async function tick(requestId, token) {
    timer = null
    if (!running || token !== generation) return
    try {
      const result = await options.poll(requestId)
      if (!running || token !== generation) return
      failureCount = 0
      await options.onResult(result)
      if (options.shouldStop(result)) {
        stop()
        return
      }
      queue(requestId, token, options.intervalMs ?? 650)
    } catch (error) {
      if (!running || token !== generation) return
      const status = Number(error?.status ?? error?.response?.status)
      if (![400, 404].includes(status)) {
        failureCount += 1
        options.onError(error)
      }
      const retry = [400, 404].includes(status)
        ? (options.intervalMs ?? 650)
        : Math.min(options.maxRetryDelayMs ?? 5000, (options.intervalMs ?? 650) * 2 ** failureCount)
      queue(requestId, token, retry)
    }
  }

  function start(requestId) {
    stop()
    running = true
    generation += 1
    failureCount = 0
    queue(requestId, generation, options.initialDelayMs ?? 120)
  }

  function stop() {
    running = false
    generation += 1
    cancelTimer()
  }

  return { start, stop, isRunning: () => running }
}
```

- [ ] **Step 4: Run poller and regression tests**

```powershell
node --test tests/multiDiscussionPoller.test.js tests/reportStatusPoller.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the poller**

```powershell
git add -- src/features/qa/multiDiscussion/multiDiscussionPoller.js tests/multiDiscussionPoller.test.js
git commit -m "feat: add multi-discussion progress poller"
```

---

### Task 4: Activate the existing composer controls without changing styles

**Files:**

- Modify: `src/features/qa/QuestionComposer.vue:57-190`
- Modify: `tests/questionComposerMulti.test.js`
- Modify: `tests/qaModeSwitch.test.js`
- Create: `tests/multiDiscussionViewIntegration.test.js`

**Interfaces:**

- Adds prop: `modelOptions: Array<{ value: string, label: string }>`; default adapts the existing single-turn string list.
- Changes multi-turn `submit` emission to `{ question, image, multiModule }`.
- Keeps single-turn `submit` emission compatible with `AscQaView`.
- The scoped style contract SHA-256 remains `a5f77adb1d89277cc857ac400d25b3dc48c3482a2c4db48f3ac4f1029b2a42f9` after CRLF normalization.

- [ ] **Step 1: Update tests to require live multi-turn behavior**

Change the disabled-placeholder test to assert a live submission:

```js
test('multi-turn mode emits the existing controls without changing their layout', async () => {
  const submitted = []
  const fixture = await mountMultiComposer({
    modelValue: '分析这张显微图',
    modelOptions: [{ value: 'fast_interactive', label: '快速交互模式 · Gemini Flash' }],
    settings: { model: 'fast_interactive', reasoning: 'CoT' },
    onSubmit: payload => submitted.push(payload)
  })
  try {
    const form = findRenderedNode(fixture.root, node => node?.type === 'form')
    const send = findButton(fixture.root, '发送')
    assert.equal(send?.props?.disabled, false)
    await invoke(form.props.onSubmit, { preventDefault() {} })
    assert.deepEqual(submitted, [{ question: '分析这张显微图', image: null, multiModule: 'inline' }])
  } finally {
    await fixture.close()
  }
})
```

Add a source-contract test that hashes only the existing scoped style block:

```js
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

test('preserves the approved QuestionComposer scoped styles byte-for-byte', async () => {
  const source = await readFile(new URL('../src/features/qa/QuestionComposer.vue', import.meta.url), 'utf8')
  const style = source.match(/<style scoped>\s*([\s\S]*?)<\/style>/)?.[1].replace(/\r\n/g, '\n')
  const digest = createHash('sha256').update(style).digest('hex')
  assert.equal(digest, 'a5f77adb1d89277cc857ac400d25b3dc48c3482a2c4db48f3ac4f1029b2a42f9')
})
```

- [ ] **Step 2: Run composer tests and verify RED**

```powershell
node --test tests/questionComposerMulti.test.js tests/qaModeSwitch.test.js tests/multiDiscussionViewIntegration.test.js
```

Expected: FAIL because multi-turn submission remains disabled and `modelOptions` is not used.

- [ ] **Step 3: Wire existing controls without editing `<style scoped>`**

Import `computed` next to the existing Vue imports, add the prop, and normalize both backend option objects and the existing single-turn string options:

```js
modelOptions: {
  type: Array,
  default: () => domesticModelOptions.map(value => ({ value, label: value }))
}

const normalizedModelOptions = computed(() => props.modelOptions
  .map(option => typeof option === 'string'
    ? { value: option, label: option }
    : { value: String(option?.value || ''), label: String(option?.label || option?.value || '') })
  .filter(option => option.value && option.label))
```

Use normalized model option objects in the existing select:

```vue
<option v-for="option in normalizedModelOptions" :key="option.value" :value="option.value">
  {{ option.label }}
</option>
```

Replace only the multi-turn button's hard-coded `disabled` with the same existing button structure:

```vue
<button
  v-if="mode === 'multi'"
  class="send-button"
  type="submit"
  :disabled="disabled || (!modelValue.trim() && !selectedImage)"
>
  <span>发送</span>
  <AscIcon name="send" />
</button>
```

Store the real file and emit it:

```js
selectedImage.value = {
  file: image,
  name: image.name,
  url: URL.createObjectURL(image)
}

function submit() {
  if (props.disabled) return
  if (props.mode === 'multi') {
    if (!props.modelValue.trim() && !selectedImage.value?.file) return
    const payload = {
      question: props.modelValue.trim(),
      image: selectedImage.value?.file || null,
      multiModule: multiModule.value
    }
    emit('submit', payload)
    removeImage()
    return
  }
  if (props.modelValue.trim()) emit('submit')
}
```

Do not edit any line inside `<style scoped>`.

- [ ] **Step 4: Run composer tests and verify GREEN**

```powershell
node --test tests/questionComposerMulti.test.js tests/qaModeSwitch.test.js tests/multiDiscussionViewIntegration.test.js
```

Expected: all tests PASS, including the exact style hash.

- [ ] **Step 5: Commit the live composer controls**

```powershell
git add -- src/features/qa/QuestionComposer.vue tests/questionComposerMulti.test.js tests/qaModeSwitch.test.js tests/multiDiscussionViewIntegration.test.js
git commit -m "feat: activate multi-turn question controls"
```

---

### Task 5: Add the temporary answer-only renderer

**Files:**

- Create: `src/features/qa/multiDiscussion/markdown.js`
- Create: `src/features/qa/multiDiscussion/MultiDiscussionConversation.vue`
- Create: `tests/multiDiscussionRendering.test.js`

**Interfaces:**

- Consumes prop: `state` from `useMultiDiscussionSession`, plus `resolveAssetUrl(path)`.
- Emits: `retry` and `new-discussion`.
- Produces no input toolbar and no graph selector.
- `renderDiscussionMarkdown(value)` returns escaped HTML for the temporary answer view.

- [ ] **Step 1: Write failing Markdown and component tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'
import { renderDiscussionMarkdown } from '../src/features/qa/multiDiscussion/markdown.js'

test('escapes hostile HTML while rendering scientific Markdown', () => {
  const html = renderDiscussionMarkdown('## 结论\nSiC 与 Al2O3。<script>alert(1)</script>')
  assert.match(html, /<h3>结论<\/h3>/)
  assert.match(html, /Al₂O₃/)
  assert.doesNotMatch(html, /<script>/)
})

test('renders progress, conversation messages, references, and visual evidence', async () => {
  const html = await renderSfc('/src/features/qa/multiDiscussion/MultiDiscussionConversation.vue', {
    state: {
      phase: 'answered',
      analysisProgress: { status: 'completed', label: '分析完成', progress: 100 },
      messages: [
        { localId: 'u1', role: 'user', content: '如何判断物相演变？', createdAt: '2026-08-20T00:00:00Z', attachments: [] },
        {
          localId: 'a1',
          role: 'assistant',
          content: '## 回答\n结合 XRD 与 SEM。',
          createdAt: '2026-08-20T00:00:01Z',
          references: [{ reference_id: 'R1', source_label: 'ASC paper' }],
          attachments: [],
          visualEvidence: { status: 'completed', items: [{ image_id: 'img1', image_url: '/api/image/1', caption: 'SEM evidence' }] }
        }
      ],
      error: ''
    },
    resolveAssetUrl: path => path
  })
  assert.match(html, /如何判断物相演变/)
  assert.match(html, /结合 XRD 与 SEM/)
  assert.match(html, /ASC paper/)
  assert.match(html, /SEM evidence/)
  assert.doesNotMatch(html, /目标 Project ID|请选择 proj_id|Multi-Discussion 多轮知识图谱问答/)
})
```

- [ ] **Step 2: Run rendering tests and verify RED**

```powershell
node --test tests/multiDiscussionRendering.test.js
```

Expected: FAIL because the renderer files do not exist.

- [ ] **Step 3: Migrate the safe renderer and answer presentation**

Copy `normalizeDiscussionMarkdown` and `renderDiscussionMarkdown` from the existing source module at:

```text
D:\WEB\VScode\yuan ma\桌面\NEW_backend\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend\src\modules\multiDiscussion\markdown.js
```

Build an answer-only component around normalized state:

```vue
<template>
  <section class="multi-discussion-conversation" aria-live="polite">
    <div v-if="state.phase === 'running'" class="multi-discussion-progress" role="status">
      <strong>{{ state.analysisProgress?.label || '准备科研问答' }}</strong>
      <progress :value="state.analysisProgress?.progress || 2" max="100" />
      <p>{{ state.analysisProgress?.detail || '正在载入当前会话和知识作用域。' }}</p>
    </div>
    <article v-for="message in state.messages" :key="message.localId" :class="['discussion-message', `is-${message.role}`]">
      <strong>{{ message.role === 'user' ? '用户' : 'Multi-Discussion' }}</strong>
      <div v-if="message.role === 'user'" class="message-content">{{ message.content }}</div>
      <div v-else class="message-content is-markdown" v-html="renderDiscussionMarkdown(message.content)" />
    </article>
    <div v-if="state.phase === 'error'" role="alert">
      <p>{{ state.error }}</p>
      <button type="button" @click="$emit('retry')">重试本轮</button>
    </div>
  </section>
</template>
```

Inside each message article, render the normalized evidence fields with these blocks:

```vue
<div v-if="message.attachments?.length" class="message-image-grid">
  <figure v-for="attachment in message.attachments" :key="attachment.asset_id || attachment.url">
    <img :src="resolveAssetUrl(attachment.previewUrl || attachment.url)" :alt="attachment.filename || '材料科研图片'">
    <figcaption>{{ attachment.filename || '材料科研图片' }}</figcaption>
  </figure>
</div>

<ul v-if="message.references?.length" class="discussion-references" aria-label="回答引用">
  <li v-for="reference in message.references" :key="reference.reference_id || reference.source_label">
    <strong>{{ reference.reference_id || '证据' }}</strong>
    <span>{{ reference.source_label || reference.paper_id || reference.source_file_id || '未命名来源' }}</span>
  </li>
</ul>

<section v-if="message.visualAnalysis" class="visual-analysis" aria-label="图片分析">
  <strong>图片分析 · {{ message.visualAnalysis.status || 'unknown' }}</strong>
  <p v-if="message.visualAnalysis.summary">{{ message.visualAnalysis.summary }}</p>
</section>

<section v-if="visualEvidenceItems(message).length" class="answer-visual-evidence" aria-label="视觉证据">
  <figure v-for="evidence in visualEvidenceItems(message)" :key="evidence.image_id || evidence.image_url">
    <img :src="resolveAssetUrl(evidence.image_url)" :alt="evidence.caption || '视觉证据'">
    <figcaption>
      <strong>{{ evidence.caption || '未提供专业 Caption' }}</strong>
      <p v-if="evidence.explanation">{{ evidence.explanation }}</p>
    </figcaption>
  </figure>
</section>
```

Normalize both supported visual-evidence array names in the component script:

```js
const visualEvidenceItems = message => {
  const value = message?.visualEvidence
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.selected_images)) return value.selected_images
  return []
}
```

Port only the CSS selectors used by these answer blocks from the source panel. Do not copy its header, graph selector, model controls, uploader, composer, or persistence logic.

- [ ] **Step 4: Run rendering tests and existing answer tests**

```powershell
node --test tests/multiDiscussionRendering.test.js tests/qaAnswerRendering.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the temporary answer renderer**

```powershell
git add -- src/features/qa/multiDiscussion/markdown.js src/features/qa/multiDiscussion/MultiDiscussionConversation.vue tests/multiDiscussionRendering.test.js
git commit -m "feat: render multi-discussion answers"
```

---

### Task 6: Orchestrate capabilities, conversation memory, and progress

**Files:**

- Create: `src/features/qa/multiDiscussion/useMultiDiscussionSession.js`
- Create: `tests/multiDiscussionSession.test.js`

**Interfaces:**

- Consumes: `getScope()`, `getSettings()`, the Task 2 API, the Task 3 poller factory, and browser storage.
- Produces: `{ state, modelOptions, defaultModelMode, loadCapabilities, restore, send, retry, newDiscussion, stop }`.
- `send({ question, image, multiModule })` is the only method that creates a new turn.

- [ ] **Step 1: Write failing session tests with injected dependencies**

Cover first and follow-up turns:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { createMultiDiscussionSession } from '../src/features/qa/multiDiscussion/useMultiDiscussionSession.js'

test('stores conversation_id from the first turn and sends it on the follow-up', async () => {
  const sent = []
  const persisted = []
  const api = {
    getCapabilities: async () => ({ data: { default_model_mode: 'default', model_modes: [] } }),
    getProgress: async () => ({ data: { status: 'running', progress: 10 } }),
    getConversation: async () => ({ data: { messages: [] } }),
    sendMessage: async turn => {
      sent.push(turn)
      return {
        data: {
          conversation_id: 'md_0123456789abcdef',
          turn_id: `turn_${sent.length}`,
          project_id: 'proj_1',
          graph_id: 'graph_1',
          answer: `answer ${sent.length}`,
          references: []
        }
      }
    }
  }
  const poller = { start() {}, stop() {} }
  const session = createMultiDiscussionSession({
    api,
    createPoller: () => poller,
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: { getItem: () => null, setItem: (key, value) => persisted.push([key, value]), removeItem() {} },
    requestId: (() => { let value = 0; return () => `mdp_${++value}` })()
  })
  await session.send({ question: '第一问', image: null, multiModule: 'inline' })
  await session.send({ question: '继续追问', image: null, multiModule: 'evidence' })
  assert.equal(Object.hasOwn(sent[0].data, 'conversation_id'), false)
  assert.equal(sent[1].data.conversation_id, 'md_0123456789abcdef')
  assert.equal(session.state.messages.filter(item => item.role === 'assistant').length, 2)
  assert.deepEqual(JSON.parse(persisted.at(-1)[1]), { conversationId: 'md_0123456789abcdef' })
})
```

Add these tests below the two-turn test:

```js
test('rejects an answer returned for a different graph', async () => {
  const session = createMultiDiscussionSession({
    api: {
      sendMessage: async () => ({ data: {
        conversation_id: 'md_0123456789abcdef',
        project_id: 'proj_1',
        graph_id: 'graph_other',
        answer: 'wrong scope'
      } }),
      getProgress: async () => ({ data: { status: 'running' } })
    },
    createPoller: () => ({ start() {}, stop() {} }),
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestId: () => 'mdp_scope'
  })
  await session.send({ question: 'scope test', image: null, multiModule: 'inline' })
  assert.equal(session.state.phase, 'error')
  assert.match(session.state.error, /graph_id/)
  assert.equal(session.state.messages.some(item => item.content === 'wrong scope'), false)
})

test('removes an expired stored conversation after a 404 restore', async () => {
  const removed = []
  const session = createMultiDiscussionSession({
    api: {
      getConversation: async () => { throw Object.assign(new Error('missing'), { status: 404 }) },
      getProgress: async () => ({ data: { status: 'running' } })
    },
    createPoller: () => ({ start() {}, stop() {} }),
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: {
      getItem: key => key === 'nexus_multi_discussion_v1:graph_1'
        ? JSON.stringify({ conversationId: 'md_0123456789abcdef' })
        : null,
      setItem() {},
      removeItem: key => removed.push(key)
    }
  })
  await session.restore()
  assert.equal(session.state.phase, 'empty')
  assert.equal(session.state.conversationId, '')
  assert.deepEqual(removed, ['nexus_multi_discussion_v1:graph_1'])
})

test('restores the stored conversation for the current graph', async () => {
  const session = createMultiDiscussionSession({
    api: {
      getConversation: async id => ({ data: {
        conversation_id: id,
        project_id: 'proj_1',
        graph_id: 'graph_1',
        messages: [
          { message_id: 'u1', role: 'user', content: '历史问题' },
          { message_id: 'a1', role: 'assistant', content: '历史回答', references: [{ reference_id: 'R1' }] }
        ]
      } }),
      getProgress: async () => ({ data: { status: 'running' } })
    },
    createPoller: () => ({ start() {}, stop() {} }),
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: {
      getItem: () => JSON.stringify({ conversationId: 'md_0123456789abcdef' }),
      setItem() {},
      removeItem() {}
    }
  })
  await session.restore()
  assert.equal(session.state.phase, 'answered')
  assert.equal(session.state.conversationId, 'md_0123456789abcdef')
  assert.deepEqual(session.state.messages.map(message => message.content), ['历史问题', '历史回答'])
})

test('loads backend model capabilities and exposes its default', async () => {
  const session = createMultiDiscussionSession({
    api: {
      getCapabilities: async () => ({ data: {
        default_model_mode: 'fast_interactive',
        model_modes: [{ mode: 'fast_interactive', label: '快速交互', model: 'google/gemini' }]
      } }),
      getProgress: async () => ({ data: { status: 'running' } })
    },
    createPoller: () => ({ start() {}, stop() {} }),
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: { getItem: () => null, setItem() {}, removeItem() {} }
  })
  const result = await session.loadCapabilities()
  assert.equal(result.defaultMode, 'fast_interactive')
  assert.equal(session.defaultModelMode.value, 'fast_interactive')
  assert.deepEqual(session.modelOptions.value.map(option => option.value), ['fast_interactive'])
})

test('ignores a chat response that resolves after stop', async () => {
  let resolveSend
  const response = new Promise(resolve => { resolveSend = resolve })
  const session = createMultiDiscussionSession({
    api: {
      sendMessage: () => response,
      getProgress: async () => ({ data: { status: 'running' } })
    },
    createPoller: () => ({ start() {}, stop() {} }),
    getScope: () => ({ project_id: 'proj_1', graph_id: 'graph_1' }),
    getSettings: () => ({ model: 'default', reasoning: 'Auto' }),
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestId: () => 'mdp_stale'
  })
  const pending = session.send({ question: 'pending', image: null, multiModule: 'inline' })
  session.stop()
  resolveSend({ data: {
    conversation_id: 'md_0123456789abcdef',
    project_id: 'proj_1',
    graph_id: 'graph_1',
    answer: 'stale answer'
  } })
  await pending
  assert.equal(session.state.messages.some(item => item.content === 'stale answer'), false)
})
```

- [ ] **Step 2: Run session tests and verify RED**

```powershell
node --test tests/multiDiscussionSession.test.js
```

Expected: FAIL because the session module does not exist.

- [ ] **Step 3: Implement the session as a Vue reactive controller**

Use a request generation to reject stale sends:

```js
import { reactive, ref } from 'vue'

import { multiDiscussionApi } from './multiDiscussionApi.js'
import { createMultiDiscussionPoller } from './multiDiscussionPoller.js'
import {
  adaptModelModes,
  adaptMultiDiscussionMessage,
  adaptMultiDiscussionReply,
  assertMultiDiscussionScope,
  buildMultiDiscussionTurn,
  createMultiDiscussionRequestId,
  isTerminalProgress
} from './multiDiscussionModel.js'

export function createMultiDiscussionSession(dependencies = {}) {
  const api = dependencies.api || multiDiscussionApi
  const storage = dependencies.storage || globalThis.localStorage
  const state = reactive({
    phase: 'empty',
    conversationId: '',
    requestId: '',
    messages: [],
    analysisProgress: null,
    error: '',
    lastSubmission: null
  })
  const modelOptions = ref([])
  const defaultModelMode = ref('default')
  let generation = 0
  const poller = (dependencies.createPoller || createMultiDiscussionPoller)({
    poll: requestId => api.getProgress(requestId).then(response => response.data || {}),
    onResult: progress => { state.analysisProgress = progress },
    onError: () => {},
    shouldStop: isTerminalProgress
  })

  const storageKey = graphId => `nexus_multi_discussion_v1:${graphId}`

  function resetState() {
    state.phase = 'empty'
    state.conversationId = ''
    state.requestId = ''
    state.messages.splice(0)
    state.analysisProgress = null
    state.error = ''
    state.lastSubmission = null
  }

  function persistConversation(scope) {
    if (!scope.graph_id || !state.conversationId) return
    storage?.setItem(storageKey(scope.graph_id), JSON.stringify({
      conversationId: state.conversationId
    }))
  }

  async function loadCapabilities() {
    let normalized
    try {
      const response = await api.getCapabilities()
      normalized = adaptModelModes(response.data || {})
    } catch {
      normalized = adaptModelModes({})
    }
    modelOptions.value = normalized.options
    defaultModelMode.value = normalized.defaultMode
    return normalized
  }

  async function restore() {
    stop()
    resetState()
    const scope = dependencies.getScope()
    const key = storageKey(scope.graph_id)
    let stored
    try {
      stored = JSON.parse(storage?.getItem(key) || 'null')
    } catch {
      storage?.removeItem(key)
      return
    }
    if (!stored?.conversationId) return
    const token = generation
    state.phase = 'running'
    try {
      const response = await api.getConversation(stored.conversationId)
      if (token !== generation) return
      const payload = response.data || {}
      assertMultiDiscussionScope(payload, scope)
      state.conversationId = payload.conversation_id
      state.messages.push(...(payload.messages || []).map(adaptMultiDiscussionMessage))
      state.phase = state.messages.length ? 'answered' : 'empty'
    } catch (error) {
      if (token !== generation) return
      const status = error?.status ?? error?.response?.status
      if (status === 404) {
        storage?.removeItem(key)
        resetState()
        return
      }
      state.phase = 'error'
      state.error = error instanceof Error ? error.message : String(error)
    }
  }

  async function send(submission, { replaceFailedUser = false } = {}) {
    const scope = dependencies.getScope()
    const settings = dependencies.getSettings()
    const requestId = (dependencies.requestId || (() => createMultiDiscussionRequestId(globalThis.crypto)))()
    const turn = buildMultiDiscussionTurn({
      ...submission,
      scope,
      requestId,
      conversationId: state.conversationId,
      modelMode: settings.model,
      reasoning: settings.reasoning
    })
    const token = ++generation
    state.phase = 'running'
    state.error = ''
    state.requestId = requestId
    state.lastSubmission = submission
    if (replaceFailedUser && state.messages.at(-1)?.role === 'user') state.messages.pop()
    state.messages.push({ localId: `user-${requestId}`, role: 'user', content: turn.data.question, createdAt: new Date().toISOString(), attachments: [] })
    poller.start(requestId)
    try {
      const response = await api.sendMessage(turn)
      if (token !== generation) return
      assertMultiDiscussionScope(response.data, scope)
      const reply = adaptMultiDiscussionReply(response.data)
      state.conversationId = reply.conversationId
      state.messages.push(reply.message)
      state.analysisProgress = response.data.analysis_progress || state.analysisProgress
      state.phase = 'answered'
      persistConversation(scope)
    } catch (error) {
      if (token !== generation) return
      state.phase = 'error'
      state.error = error instanceof Error ? error.message : String(error)
    } finally {
      if (token === generation) poller.stop()
    }
  }

  function stop() {
    generation += 1
    poller.stop()
  }

  async function retry() {
    if (!state.lastSubmission || state.phase !== 'error') return
    await send(state.lastSubmission, { replaceFailedUser: true })
  }

  function newDiscussion() {
    stop()
    const scope = dependencies.getScope()
    if (scope.graph_id) storage?.removeItem(storageKey(scope.graph_id))
    resetState()
  }

  return {
    state,
    modelOptions,
    defaultModelMode,
    loadCapabilities,
    restore,
    send,
    retry,
    newDiscussion,
    stop
  }
}
```

Persist only `conversationId`; message arrays, object URLs, and raw image bytes stay in memory and are reconstructed from the backend history response.

- [ ] **Step 4: Run session, poller, model, and API tests**

```powershell
node --test tests/multiDiscussionSession.test.js tests/multiDiscussionPoller.test.js tests/multiDiscussionModel.test.js tests/multiDiscussionApi.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the session orchestration**

```powershell
git add -- src/features/qa/multiDiscussion/useMultiDiscussionSession.js tests/multiDiscussionSession.test.js
git commit -m "feat: orchestrate multi-discussion sessions"
```

---

### Task 7: Integrate Multi-Discussion into `AscQaView`

**Files:**

- Modify: `src/views/AscQaView.vue:24-111`
- Modify: `src/views/AscQaView.vue:158-370`
- Modify: `src/views/AscQaView.vue:490-628`
- Modify: `tests/multiDiscussionViewIntegration.test.js`
- Modify: `tests/graphScopedQaFlow.test.js`

**Interfaces:**

- Consumes: `MultiDiscussionConversation`, `createMultiDiscussionSession`, `multiDiscussionApi.resolveAssetUrl`, and `QuestionComposer`'s multi-turn payload.
- Preserves: existing single-turn `requestCodAnswer` branch and project-qualification controller.
- Produces: one first screen and one result screen per selected mode, never two input toolbars.

- [ ] **Step 1: Add failing view-wiring tests**

Use source contract checks for the branch boundary and existing mount helpers for visible behavior:

```js
test('routes multi-turn submit into the session while preserving single-turn requestCodAnswer', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  assert.match(source, /qaState\.value\.mode === 'multi'/)
  assert.match(source, /multiDiscussionSession\.send/)
  assert.match(source, /requestCodAnswer/)
  assert.match(source, /MultiDiscussionConversation/)
})

test('passes backend model options and existing settings into both multi-turn composers', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  assert.match(source, /:model-options="composerModelOptions"/)
  assert.match(source, /@submit="sendQuestion"/)
  assert.match(source, /@retry="retryMultiDiscussion"/)
})
```

Extend the graph-scope test to require the current qualified `projectId` and `graphId` getters to feed the session.

- [ ] **Step 2: Run view tests and verify RED**

```powershell
node --test tests/multiDiscussionViewIntegration.test.js tests/graphScopedQaFlow.test.js
```

Expected: FAIL because `AscQaView` does not import or call the Multi-Discussion session.

- [ ] **Step 3: Add the mode-specific template branch**

Change only the existing first-screen condition from `v-if="qaState.phase === 'empty'"` to `v-if="showQaHome"`. Keep every child of that section in its current order, and add this prop to its existing `QuestionComposer`:

```vue
:model-options="composerModelOptions"
```

Insert this dedicated multi result branch immediately before the current `<section v-else class="qa-session">`; leave the current single-result section as the final `v-else` branch:

```vue
<section v-else-if="qaState.mode === 'multi'" class="qa-session qa-session--multi">
  <button type="button" class="qa-result-back" @click="returnToQaHome">
    <span aria-hidden="true">←</span>
    新建讨论
  </button>
  <MultiDiscussionConversation
    :state="multiDiscussionSession.state"
    :resolve-asset-url="multiDiscussionApi.resolveAssetUrl"
    @retry="retryMultiDiscussion"
    @new-discussion="resetMultiDiscussion"
  />
  <QuestionComposer
    v-model="draft"
    compact
    :disabled="multiDiscussionSession.state.phase === 'running' || !activeProject"
    mode="multi"
    :settings="qaState.settings"
    :model-options="composerModelOptions"
    @update:settings="updateSettings"
    @submit="sendQuestion"
  />
</section>
```

Change the existing `RecentConversationsPanel` condition to `showQaHome && qaState.mode === 'single' && !qaState.evidenceOpen`, so single-turn history is not displayed below the multi-turn first screen.

- [ ] **Step 4: Branch submission and lifecycle logic**

Keep the current single-turn code in a named helper and branch at the entry point:

```js
async function sendQuestion(submission) {
  if (!activeProject.value || projectsLoading.value) return
  if (qaState.value.mode === 'multi') {
    const payload = submission && typeof submission === 'object'
      ? submission
      : { question: draft.value, image: null, multiModule: 'inline' }
    draft.value = ''
    await multiDiscussionSession.send(payload)
    return
  }
  await sendSingleQuestion(typeof submission === 'string' ? submission : draft.value)
}
```

Create the session with authoritative scope getters:

```js
const multiDiscussionSession = createMultiDiscussionSession({
  getScope: () => ({
    project_id: activeProject.value?.projectId || '',
    graph_id: activeProject.value?.graphId || ''
  }),
  getSettings: () => qaState.value.settings,
  storage: browserStorage
})
```

Import `domesticModelOptions`, adapt the single-turn strings to the new option-object contract, and remember the last selection separately for each mode:

```js
const modelSelectionByMode = ref({
  single: qaState.value.settings.model,
  multi: 'default'
})
const singleTurnModelOptions = domesticModelOptions.map(value => ({ value, label: value }))
const composerModelOptions = computed(() => (
  qaState.value.mode === 'multi'
    ? multiDiscussionSession.modelOptions.value
    : singleTurnModelOptions
))
const showQaHome = computed(() => (
  qaState.value.mode === 'multi'
    ? multiDiscussionSession.state.phase === 'empty'
    : qaState.value.phase === 'empty'
))

function updateSettings(patch) {
  qaState.value = updateQaSettings(qaState.value, patch)
  if (patch.model) modelSelectionByMode.value[qaState.value.mode] = patch.model
}

async function updateMode(mode) {
  if (mode === qaState.value.mode) return
  modelSelectionByMode.value[qaState.value.mode] = qaState.value.settings.model
  if (qaState.value.mode === 'multi') multiDiscussionSession.stop()
  qaState.value = selectQaMode(qaState.value, mode)

  if (mode === 'multi') {
    const { options, defaultMode } = await multiDiscussionSession.loadCapabilities()
    const remembered = modelSelectionByMode.value.multi
    const selected = options.some(option => option.value === remembered) ? remembered : defaultMode
    modelSelectionByMode.value.multi = selected
    qaState.value = updateQaSettings(qaState.value, { model: selected })
    await multiDiscussionSession.restore()
    return
  }

  qaState.value = updateQaSettings(qaState.value, {
    model: modelSelectionByMode.value.single
  })
}
```

Rename the body of the current `sendQuestion` to `sendSingleQuestion` and keep it byte-for-byte functionally equivalent. The new branching `sendQuestion` shown above becomes the only submit handler. Add these multi-turn actions:

```js
function retryMultiDiscussion() {
  return multiDiscussionSession.retry()
}

function resetMultiDiscussion() {
  multiDiscussionSession.newDiscussion()
  draft.value = ''
}

async function returnToQaHome() {
  if (qaState.value.mode === 'multi') resetMultiDiscussion()
  else reset()
  const query = { ...route.query }
  delete query.conversation
  delete query.new
  await router.replace({ path: '/', query })
}
```

In `selectQualifiedProject`, when `previousProjectId` differs from the newly selected project, call `multiDiscussionSession.stop()` before changing visible state. After selection, call `multiDiscussionSession.restore()` only when the active mode is `multi`; otherwise retain the existing `reset()` call. Apply the same stop-then-restore ordering in the route-query project-change branch. On unmount, call `multiDiscussionSession.stop()` alongside `qaProjectContext.stop()`.

- [ ] **Step 5: Run focused QA integration tests**

```powershell
node --test tests/multiDiscussionViewIntegration.test.js tests/questionComposerMulti.test.js tests/qaModeSwitch.test.js tests/graphScopedQaFlow.test.js tests/qaApiAdapter.test.js tests/qaRouteQueryLifecycle.test.js
```

Expected: all tests PASS; existing single-turn route-consumption and CoD adapter tests remain green.

- [ ] **Step 6: Commit view integration**

```powershell
git add -- src/views/AscQaView.vue tests/multiDiscussionViewIntegration.test.js tests/graphScopedQaFlow.test.js
git commit -m "feat: connect multi-discussion qa flow"
```

---

### Task 8: Verify the complete frontend integration

**Files:**

- Verify only; do not add generated `dist/` output to Git.

**Interfaces:**

- Consumes the complete feature from Tasks 1-7.
- Produces verification evidence for tests, production build, live API routing, two-turn memory, cleanup, and visual preservation.

- [ ] **Step 1: Run all Multi-Discussion and single-turn regression tests**

```powershell
node --test tests/multiDiscussionModel.test.js tests/multiDiscussionApi.test.js tests/multiDiscussionPoller.test.js tests/multiDiscussionSession.test.js tests/multiDiscussionRendering.test.js tests/multiDiscussionViewIntegration.test.js tests/questionComposerMulti.test.js tests/qaModeSwitch.test.js tests/graphScopedQaFlow.test.js tests/qaApiAdapter.test.js tests/qaRouteQueryLifecycle.test.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the full frontend test suite**

```powershell
node --test
```

Expected: all discovered `tests/*.test.js` tests PASS.

- [ ] **Step 3: Build production assets**

```powershell
npm run build
```

Expected: Vite exits with code `0` and reports generated assets without unresolved imports.

- [ ] **Step 4: Confirm the live backend capability contract**

With the Python backend running on port `5000`, run:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5000/api/multi-discussion/capabilities'
```

Expected: `success` is `True`, `data.model_modes` is non-empty, and `data.default_model_mode` names one returned mode.

- [ ] **Step 5: Verify two real turns through the Vite proxy**

Start the frontend:

```powershell
npm run dev
```

In the UI, select a project already marked eligible for QA, switch to “多轮连续,” select one model returned by capabilities, submit the visible question, then ask “这个结论有哪些相反证据？”. In the browser network panel, verify:

```text
POST /api/multi-discussion/chat                  first request has no conversation_id
GET  /api/multi-discussion/progress/{requestId} progress requests are serial
POST /api/multi-discussion/chat                  second request reuses conversation_id
```

Expected: two assistant answers render, the second request contains the first response's `conversation_id`, and no request targets port `5001` or port `3001`.

- [ ] **Step 6: Verify cleanup and visual preservation**

While a turn is active, navigate away and return. Confirm progress requests stop after navigation. Compare the first screen and tool row to the two approved screenshots and confirm the following remain unchanged:

```text
+ button | model select | reasoning select | multi-module select | send button
```

Run the style contract test once more:

```powershell
node --test tests/questionComposerMulti.test.js tests/multiDiscussionViewIntegration.test.js
```

Expected: the exact scoped-style SHA-256 assertion passes.

- [ ] **Step 7: Inspect only the intended final diff**

```powershell
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

Expected: no whitespace errors; existing `vite.config.js`, `backend_impl/.env`, `backend_impl/data/`, and `backend_impl/package-lock.json` remain outside feature commits.
