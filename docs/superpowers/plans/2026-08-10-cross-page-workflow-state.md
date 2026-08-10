# Cross-Page Workflow State Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the single active QA request and the graph workflow page alive during sidebar navigation, while removing the duplicate graph-header QA button.

**Architecture:** Replace the plain root `router-view` with a focused `KeepAlive` route outlet that caches only `AscQaView` and `GraphProjectWorkspaceView`. Use one stable cache key per cached route name so query/parameter changes update the existing page instance instead of creating unbounded cached copies. Keep all existing backend APIs and page-local state; do not add persistence or a global QA task UI.

**Tech Stack:** Vue 3.5, Vue Router 4.6, Vite 7, Node.js built-in test runner, Vue custom renderer for lifecycle tests.

## Global Constraints

- Modify frontend code only; do not modify the backend or `D:\WEB`.
- Preserve state only while the current website instance remains open.
- Do not promise recovery of an in-flight QA request after refresh or browser close.
- Allow only the existing single QA request at a time; do not add concurrent QA tasks.
- Do not add a global QA indicator, completion toast, popup, or simulated progress.
- Cache only `AscQaView` and `GraphProjectWorkspaceView`.
- Keep one cached instance per cached route name; do not cache one instance per query string or project ID.
- Keep the left project-card “去问答” and sidebar “问答首页”.
- Remove the black QA button from the graph workflow header.
- Do not add or change backend request payloads in this feature.

---

### Task 1: Add a Focused Workflow Route Cache

**Files:**
- Create: `src/features/navigation/WorkflowRouteOutlet.js`
- Create: `tests/workflowRouteCache.test.js`
- Create: `tests/helpers/createMemoryVueRenderer.js`
- Modify: `src/App.vue`
- Modify: `src/views/AscQaView.vue`
- Modify: `src/views/GraphProjectWorkspaceView.vue`

**Interfaces:**
- Produces: `WORKFLOW_VIEW_NAMES: readonly ['AscQaView', 'GraphProjectWorkspaceView']`
- Produces: `workflowRouteViewKey(route): string`
- Produces: `WorkflowRouteOutlet`, a Vue component that renders `RouterView` through `KeepAlive`
- Produces: `createMemoryVueRenderer(): { renderer, root }` and `renderedText(node): string` for lifecycle tests
- Consumes: Vue `KeepAlive`, `RouterView`, route objects with `name` and `fullPath`

- [ ] **Step 1: Write the failing cache-policy and lifecycle tests**

Create `tests/workflowRouteCache.test.js`. The first test fixes the cache-key contract independently of Vue rendering:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WORKFLOW_VIEW_NAMES,
  WorkflowRouteOutlet,
  workflowRouteViewKey
} from '../src/features/navigation/WorkflowRouteOutlet.js'

test('uses one stable cache entry for QA and graph workflow routes', () => {
  assert.deepEqual([...WORKFLOW_VIEW_NAMES], ['AscQaView', 'GraphProjectWorkspaceView'])
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p1' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'AscQa', fullPath: '/?projectId=p2' }), 'workflow:AscQa')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p1' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Process', fullPath: '/process/p2' }), 'workflow:Process')
  assert.equal(workflowRouteViewKey({ name: 'Documents', fullPath: '/documents' }), '/documents')
})
```

Create `tests/helpers/createMemoryVueRenderer.js` so the lifecycle test runs without adding a DOM dependency:

```js
import { createRenderer } from 'vue'

function detach(node) {
  const siblings = node?.parent?.children
  if (!siblings) return
  const index = siblings.indexOf(node)
  if (index >= 0) siblings.splice(index, 1)
}

export function createMemoryVueRenderer() {
  const root = { type: 'root', children: [], parent: null, props: {}, text: '' }
  const renderer = createRenderer({
    patchProp(node, key, previous, next) { node.props[key] = next },
    insert(child, parent, anchor = null) {
      detach(child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, child)
      else parent.children.push(child)
    },
    remove(node) { detach(node); node.parent = null },
    createElement(type) { return { type, children: [], parent: null, props: {}, text: '' } },
    createText(text) { return { type: '#text', children: [], parent: null, props: {}, text } },
    createComment(text) { return { type: '#comment', children: [], parent: null, props: {}, text } },
    setText(node, text) { node.text = text },
    setElementText(node, text) { node.children = []; node.text = text },
    parentNode(node) { return node.parent },
    nextSibling(node) {
      const siblings = node?.parent?.children || []
      return siblings[siblings.indexOf(node) + 1] || null
    },
    querySelector() { return null },
    setScopeId() {},
    cloneNode(node) { return { ...node, children: [], parent: null, props: { ...node.props } } },
    insertStaticContent(content, parent, anchor) {
      const node = { type: '#static', children: [], parent: null, props: {}, text: content }
      node.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, node)
      else parent.children.push(node)
      return [node, node]
    }
  })
  return { renderer, root }
}

export function renderedText(node) {
  return `${node?.text || ''}${(node?.children || []).map(renderedText).join('')}`
}
```

In `tests/workflowRouteCache.test.js`, add a real Vue lifecycle test with named fake route components:

```js
import { defineComponent, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createMemoryVueRenderer, renderedText } from './helpers/createMemoryVueRenderer.js'

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
  await router.push('/process/p1')
  await nextTick()

  assert.equal(graphMounts, 1)
  assert.equal(graphUnmounts, 0)
  assert.match(renderedText(root), /retained graph log/)
  app.unmount()
})
```

This test mounts `WorkflowRouteOutlet` with a memory router, navigates `/` → `/documents`, resolves the deferred answer, navigates back to `/`, and asserts:

```js
assert.equal(qaMounts, 1)
assert.equal(qaUnmounts, 0)
assert.equal(renderedText(root), 'answer completed while away')
```

Then navigate `/process/p1` → `/documents` → `/process/p1` and assert the graph component mounted once and retained a locally mutated log string. The fake components must be named exactly like the production components so removing `KeepAlive`, changing `include`, or using `fullPath` for cached keys makes the test fail.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/workflowRouteCache.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `WorkflowRouteOutlet.js`.

- [ ] **Step 3: Implement the route-cache policy and outlet**

Create `src/features/navigation/WorkflowRouteOutlet.js`:

```js
import { KeepAlive, defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

export const WORKFLOW_VIEW_NAMES = Object.freeze([
  'AscQaView',
  'GraphProjectWorkspaceView'
])

const WORKFLOW_ROUTE_NAMES = new Set(['AscQa', 'Process'])

export function workflowRouteViewKey(route = {}) {
  const name = String(route?.name || '')
  return WORKFLOW_ROUTE_NAMES.has(name)
    ? `workflow:${name}`
    : String(route?.fullPath || name)
}

export const WorkflowRouteOutlet = defineComponent({
  name: 'WorkflowRouteOutlet',
  setup() {
    return () => h(RouterView, null, {
      default: ({ Component, route }) => h(
        KeepAlive,
        { include: WORKFLOW_VIEW_NAMES },
        () => Component
          ? h(Component, { key: workflowRouteViewKey(route) })
          : null
      )
    })
  }
})
```

Replace the root outlet in `src/App.vue`:

```vue
<template>
  <AscShell>
    <WorkflowRouteOutlet />
  </AscShell>
</template>

<script setup>
import AscShell from './layouts/AscShell.vue'
import { WorkflowRouteOutlet } from './features/navigation/WorkflowRouteOutlet.js'
</script>
```

Add explicit component names at the beginning of each cached page’s `<script setup>`:

```js
defineOptions({ name: 'AscQaView' })
```

```js
defineOptions({ name: 'GraphProjectWorkspaceView' })
```

Do not add `onDeactivated` cleanup to either page. `AscQaView` must retain its current Promise callback and refs, and `GraphProjectWorkspaceView` must retain its child `MainView` instance.

- [ ] **Step 4: Run the focused tests and build**

Run:

```powershell
node --test tests/workflowRouteCache.test.js tests/graphScopedQaFlow.test.js tests/graphProjectWorkspace.test.js
npm run build
```

Expected: all selected tests PASS and Vite reports `built` successfully.

- [ ] **Step 5: Review and commit Task 1**

Confirm the lifecycle test would fail if `KeepAlive` were removed or if the cached key used `route.fullPath`. Then run `git diff --check` and commit:

```powershell
git add src/features/navigation/WorkflowRouteOutlet.js src/App.vue src/views/AscQaView.vue src/views/GraphProjectWorkspaceView.vue tests/workflowRouteCache.test.js tests/helpers/createMemoryVueRenderer.js
git commit -m "feat: preserve workflow pages across navigation"
```

---

### Task 2: Remove the Duplicate Graph-Header QA Button

**Files:**
- Modify: `src/views/MainView.vue`
- Modify: `tests/ascLabExperience.test.js`
- Test: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- Preserves: `openCompletedGraphInQa(project)` for the Step 1 `open-qa` event
- Removes: header-only `canOpenCompletedGraphQa`
- Preserves: `GraphProjectList`’s project-scoped `open-qa` event

- [ ] **Step 1: Change the existing test to describe the non-duplicated UI and verify RED**

Replace the header-button assertions in `tests/ascLabExperience.test.js` with:

```js
test('keeps completed graph workflows visible without a duplicate header QA action', async () => {
  const view = await readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(view, /class="qa-entry-button"/)
  assert.doesNotMatch(view, /canOpenCompletedGraphQa/)
  assert.match(view, /@open-qa="openCompletedGraphInQa"/)
  assert.match(view, /completeTaskGraphForQa\(\{[\s\S]*?navigateWhenReady:\s*false[\s\S]*?\}\)/)
  assert.match(view, /completeMissingTaskGraphForQa\(\{[\s\S]*?navigateWhenReady:\s*false[\s\S]*?\}\)/)
})
```

Keep the existing rendered `GraphProjectList` assertion that exactly one completed project card renders “去问答”.

Run:

```powershell
node --test tests/ascLabExperience.test.js tests/graphProjectWorkspace.test.js
```

Expected: FAIL because the black header button and `canOpenCompletedGraphQa` still exist.

- [ ] **Step 2: Remove only the duplicate header action**

In `src/views/MainView.vue`:

- Remove the `<button class="qa-entry-button">…</button>` from `.header-right`.
- Remove the `canOpenCompletedGraphQa` computed declaration.
- Remove `.qa-entry-button`, hover, and focus-visible CSS rules.
- Keep `openCompletedGraphInQa`, because `Step1GraphBuild` still emits `open-qa` to it.
- Keep `isFinalGraphProject`, because the project watcher still uses it to advance from graph construction to environment setup.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests/ascLabExperience.test.js tests/graphProjectWorkspace.test.js tests/workflowRouteCache.test.js
```

Expected: all tests PASS; rendered project list still contains exactly one project-scoped “去问答”.

- [ ] **Step 4: Review and commit Task 2**

Run `git diff --check`, confirm no other QA entry was removed, and commit:

```powershell
git add src/views/MainView.vue tests/ascLabExperience.test.js
git commit -m "fix: remove duplicate graph header QA action"
```

---

### Task 3: Verify Real Route-Switch Behavior

**Files:**
- No production files unless verification exposes a tested regression.

**Interfaces:**
- Verifies the Task 1 route cache and Task 2 UI behavior as one user flow.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
node --test tests/*.test.js
```

Expected: every test passes with zero failures.

- [ ] **Step 2: Run the production build and repository checks**

Run:

```powershell
npm run build
git diff --check
git status --short
```

Expected: Vite build succeeds, `git diff --check` prints nothing, and the worktree has no uncommitted production changes.

- [ ] **Step 3: Perform a no-POST browser smoke test on the running frontend**

Use the existing frontend at `http://localhost:3000` and the existing read-only backend project list:

1. Open the QA page and type the unique draft `CACHE-SMOKE-QUESTION` without submitting it.
2. Click “文献管理”, then click “问答首页”.
3. Assert the textarea still contains `CACHE-SMOKE-QUESTION`.
4. Open “图谱构建”, select an existing project, and note the selected project ID and visible workflow step.
5. Click “文献管理”, then click “图谱构建”.
6. Assert the same project remains selected and the workflow did not reset to `/process/new`.
7. Assert the graph workflow header no longer contains the black “去图谱问答” button, while the completed project card retains “去问答”.
8. Inspect the network log and confirm the smoke test sent zero QA, ontology, graph-build, simulation-create, or deletion POST requests.

This smoke test intentionally uses a draft rather than submitting a real question. The custom-renderer test already proves a deferred response can complete while the cached page is inactive, and the browser smoke proves the production route outlet retains the real page instance.

- [ ] **Step 4: Final handoff**

Report the full-test count, build result, browser smoke observations, and exact commits. State explicitly that backend code was not modified and that refresh recovery for in-flight QA remains outside scope.
