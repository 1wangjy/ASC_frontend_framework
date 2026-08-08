# Graph-Scoped QA Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the 3000 frontend's graph build completion to graph-scoped QA against the existing 5002 backend, with the backend project list as the source of truth.

**Architecture:** Keep all backend contracts unchanged. Add small pure project-selection and navigation helpers, make `AscQaView.vue` load `GET /api/graph/project/list`, and make `MainView.vue` redirect a completed graph to `/?projectId=<project_id>`. Remove the obsolete local project registry after both consumers stop using it.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios, Vite 7, Node.js built-in test runner.

## Global Constraints

- Modify only `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`.
- Do not modify the 5002 backend or any file under `D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main\backend`.
- Do not modify the 3001 frontend.
- Keep Vite on port 3000 and keep `/api` proxied to `http://127.0.0.1:5002`.
- Reuse `GET /api/graph/project/list` and `POST /api/graphrag/cod-query`; do not add backend endpoints.
- A live QA request must contain non-empty `question`, `project_id`, and `graph_id`.
- Keep the simulation/report routes as independent legacy workflows; normal graph completion must lead to QA, not Step2.
- Baseline on 2026-08-08: `node --test tests/*.test.js` reports 100 tests, 96 pass, 4 fail. Three failures in `projectContextModel.test.js` are in scope; the existing report polling source assertion in `ascLabExperience.test.js` is out of scope.

---

## File Structure

- Modify `src/features/projects/projectContextModel.js`: normalize/filter backend projects, resolve URL/stored selection priority, and persist only the selected project ID.
- Modify `tests/projectContextModel.test.js`: cover backend response envelopes, strict graph filtering, and three-level selection priority.
- Modify `src/features/qa/qaApiAdapter.js`: reject unscoped or empty QA requests before Axios is called.
- Modify `tests/qaApiAdapter.test.js`: enforce exact `question + project_id + graph_id` payloads and remove the obsolete graph-only compatibility expectation.
- Modify `src/views/AscQaView.vue`: load the backend project list and select the URL project before the stored project.
- Create `tests/graphScopedQaFlow.test.js`: source-level wiring checks for backend-authoritative loading, build completion routing, and registry removal.
- Create `src/features/projects/graphQaNavigation.js`: build a QA route only from a completed project with both IDs.
- Create `tests/graphQaNavigation.test.js`: unit-test valid and invalid completion routes.
- Modify `src/views/MainView.vue`: redirect completed builds to QA and remember the new selection; remove registry writes.
- Delete `src/features/projects/projectRegistry.js`: remove obsolete local project discovery code after all imports are gone.

### Task 1: Make Backend Graph Projects a Strict Domain Model

**Files:**
- Modify: `tests/projectContextModel.test.js`
- Modify: `src/features/projects/projectContextModel.js`

**Interfaces:**
- Consumes: backend envelope `{ success: boolean, data: Project[] }` or a direct `Project[]`.
- Produces: `listGraphProjects(input): Project[]`, requiring non-empty `project_id` and `graph_id`, newest first.
- Produces: `resolveActiveProject(projects, ...preferredProjectIds): Project | null`, honoring preferences in argument order.
- Preserves: `readActiveProjectId(storage)` and `rememberActiveProjectId(storage, projectId)`.

- [ ] **Step 1: Extend the failing tests for response normalization and selection priority**

Add these cases to `tests/projectContextModel.test.js`:

```js
test('unwraps the backend project-list envelope and normalizes identifiers', () => {
  const result = listGraphProjects({
    success: true,
    data: [{ project_id: ' p1 ', graph_id: ' g1 ', updated_at: '2026-08-08T10:00:00Z' }]
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].project_id, 'p1')
  assert.equal(result[0].graph_id, 'g1')
})

test('prefers URL project, then stored project, then newest project', () => {
  assert.equal(resolveActiveProject(projects, 'older', 'newer')?.project_id, 'older')
  assert.equal(resolveActiveProject(projects, 'missing', 'older')?.project_id, 'older')
  assert.equal(resolveActiveProject(projects, 'missing', 'also-missing')?.project_id, 'newer')
})
```

- [ ] **Step 2: Run the focused test and confirm the current model fails**

Run:

```powershell
node --test tests/projectContextModel.test.js
```

Expected: FAIL because the current function keeps projects without `graph_id`, does not unwrap an envelope, and accepts only one preferred ID.

- [ ] **Step 3: Implement strict normalization and ordered preferences**

Replace the project list and resolver logic in `src/features/projects/projectContextModel.js` with this shape while retaining the existing timestamp and storage helpers:

```js
function projectArray(input) {
  if (Array.isArray(input)) return input
  return Array.isArray(input?.data) ? input.data : []
}

export function listGraphProjects(input = []) {
  return projectArray(input)
    .map((project) => ({
      ...project,
      project_id: String(project?.project_id ?? '').trim(),
      graph_id: String(project?.graph_id ?? '').trim()
    }))
    .filter((project) => project.project_id && project.graph_id)
    .sort((left, right) => projectTimestamp(right) - projectTimestamp(left))
}

export function resolveActiveProject(projects = [], ...preferredProjectIds) {
  const usableProjects = listGraphProjects(projects)
  if (!usableProjects.length) return null

  for (const candidate of preferredProjectIds) {
    const projectId = String(candidate ?? '').trim()
    const match = usableProjects.find((project) => project.project_id === projectId)
    if (match) return match
  }

  return usableProjects[0]
}
```

- [ ] **Step 4: Run the domain tests**

Run:

```powershell
node --test tests/projectContextModel.test.js
```

Expected: all project-context tests PASS, including the three baseline failures.

- [ ] **Step 5: Commit the domain model**

```powershell
git add -- src/features/projects/projectContextModel.js tests/projectContextModel.test.js
git commit -m "fix: require complete graph projects for QA"
```

### Task 2: Load Projects from 5002 and Enforce Scoped Questions

**Files:**
- Modify: `tests/qaApiAdapter.test.js`
- Create: `tests/graphScopedQaFlow.test.js`
- Modify: `src/features/qa/qaApiAdapter.js`
- Modify: `src/views/AscQaView.vue`

**Interfaces:**
- Consumes: `listProjects({ limit: 50 }): Promise<{ success, data, count }>` from `src/api/graph.js`.
- Consumes: route query `projectId` and `nexus_active_project_id` from local storage.
- Produces: `buildCodQueryPayload({ question, project, settings })` with all three required scope fields.
- Produces: QA selection priority `route.query.projectId -> stored project ID -> newest backend project`.

- [ ] **Step 1: Replace the obsolete graph-only QA test with strict scope tests**

In `tests/qaApiAdapter.test.js`, remove the `omit_project_id_from_query` case and add:

```js
test('rejects a question without a complete backend graph scope', () => {
  assert.throws(
    () => buildCodQueryPayload({ question: 'Q', project: { project_id: 'p1' } }),
    /project_id.*graph_id/
  )
  assert.throws(
    () => buildCodQueryPayload({ question: ' ', project: { project_id: 'p1', graph_id: 'g1' } }),
    /question/
  )
})
```

Create `tests/graphScopedQaFlow.test.js` with the initial QA wiring contract:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('QA discovers graph projects from the backend instead of the local registry', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /listProjects/)
  assert.match(source, /await listProjects\(\{\s*limit:\s*50\s*\}\)/)
  assert.match(source, /route\.query\.projectId/)
  assert.doesNotMatch(source, /getRegisteredProjectIds|getProject\(/)
  assert.doesNotMatch(source, /projectRegistry/)
})
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
node --test tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js
```

Expected: FAIL because the adapter still permits partial scope and `AscQaView.vue` still reads the local registry.

- [ ] **Step 3: Reject invalid question scopes in the adapter**

Update `buildCodQueryPayload` in `src/features/qa/qaApiAdapter.js` before returning the payload:

```js
const normalizedQuestion = String(question ?? '').trim()
const projectId = String(project?.project_id ?? '').trim()
const graphId = String(project?.graph_id ?? '').trim()

if (!normalizedQuestion) throw new Error('question 不能为空')
if (!projectId || !graphId) throw new Error('问答请求必须同时包含 project_id 和 graph_id')

const payload = {
  question: normalizedQuestion,
  project_id: projectId,
  graph_id: graphId,
  reasoning_mode: REASONING_MODES[settings.reasoning] || 'auto'
}
```

Remove the `omit_project_id_from_query` branch because all retained QA projects originate from the backend project list.

- [ ] **Step 4: Replace local registry discovery in the QA page**

In `src/views/AscQaView.vue`:

1. Import `listProjects` instead of `getProject`.
2. Remove the `projectRegistry.js` import.
3. Load the list once from the existing endpoint.
4. Resolve the URL project before the stored project.

Use this core implementation:

```js
async function loadProjects() {
  projectsLoading.value = true
  projectError.value = ''

  try {
    const response = await listProjects({ limit: 50 })
    projects.value = listGraphProjects(response)
    const selected = resolveActiveProject(
      projects.value,
      route.query.projectId,
      readActiveProjectId(window.localStorage)
    )
    activeProjectId.value = selected?.project_id ?? ''
    rememberActiveProjectId(window.localStorage, activeProjectId.value)
  } catch (error) {
    projects.value = []
    activeProjectId.value = ''
    rememberActiveProjectId(window.localStorage, '')
    projectError.value = error?.message || '无法从后端读取可用知识图谱，请确认 5002 服务正在运行。'
  } finally {
    projectsLoading.value = false
  }
}
```

Keep the existing submit guard `if (!activeProject.value || projectsLoading.value) return`. In the request catch, keep `failApiAnswer` so the question text remains available for retry. When the error indicates a missing graph/project or HTTP 404, call `loadProjects()` after recording the failed answer; do not automatically resend the question.

Add this local classifier and use it inside the existing `sendQuestion` catch:

```js
function isMissingGraphScopeError(error) {
  const status = error?.response?.status
  const message = String(error?.message ?? '').toLowerCase()
  return status === 404 || /graph.*not found|project.*not found|图谱不存在|项目不存在/.test(message)
}

// Inside catch, after failApiAnswer:
if (isMissingGraphScopeError(error)) await loadProjects()
```

- [ ] **Step 5: Run the focused QA tests**

Run:

```powershell
node --test tests/projectContextModel.test.js tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit backend-authoritative QA loading**

```powershell
git add -- src/views/AscQaView.vue src/features/qa/qaApiAdapter.js tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js
git commit -m "feat: load QA graph scope from backend projects"
```

### Task 3: Redirect Completed Graph Builds to QA

**Files:**
- Create: `src/features/projects/graphQaNavigation.js`
- Create: `tests/graphQaNavigation.test.js`
- Modify: `tests/graphScopedQaFlow.test.js`
- Modify: `src/views/MainView.vue`

**Interfaces:**
- Produces: `buildGraphQaRoute(project): RouteLocationRaw | null`.
- Consumes: a completed backend project containing non-empty `project_id` and `graph_id`.
- Produces: Vue Router target `{ name: 'AscQa', query: { projectId } }`.

- [ ] **Step 1: Write failing route-helper and MainView wiring tests**

Create `tests/graphQaNavigation.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGraphQaRoute } from '../src/features/projects/graphQaNavigation.js'

test('builds a QA route from a completed graph project', () => {
  assert.deepEqual(buildGraphQaRoute({ project_id: ' p1 ', graph_id: ' g1 ' }), {
    name: 'AscQa',
    query: { projectId: 'p1' }
  })
})

test('does not route an incomplete graph build', () => {
  assert.equal(buildGraphQaRoute({ project_id: 'p1', graph_id: '' }), null)
  assert.equal(buildGraphQaRoute({ project_id: '', graph_id: 'g1' }), null)
})
```

Append to `tests/graphScopedQaFlow.test.js`:

```js
test('completed graph builds route to QA and no longer write a local registry', async () => {
  const source = await readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')

  assert.match(source, /buildGraphQaRoute/)
  assert.match(source, /rememberActiveProjectId/)
  assert.match(source, /router\.replace\(qaRoute\)/)
  assert.doesNotMatch(source, /registerProject|projectRegistry/)
})
```

- [ ] **Step 2: Run the tests and confirm missing helper/wiring failure**

Run:

```powershell
node --test tests/graphQaNavigation.test.js tests/graphScopedQaFlow.test.js
```

Expected: FAIL because `graphQaNavigation.js` does not exist and `MainView.vue` still writes the registry.

- [ ] **Step 3: Implement the pure route helper**

Create `src/features/projects/graphQaNavigation.js`:

```js
export function buildGraphQaRoute(project = {}) {
  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()
  if (!projectId || !graphId) return null

  return {
    name: 'AscQa',
    query: { projectId }
  }
}
```

- [ ] **Step 4: Wire graph completion to QA in MainView**

In `src/views/MainView.vue`:

1. Remove the `projectRegistry.js` import and every `registerProject(...)` call.
2. Import `rememberActiveProjectId` and `buildGraphQaRoute`.
3. Add one completion helper:

```js
const openCompletedGraphInQa = (project) => {
  const qaRoute = buildGraphQaRoute(project)
  if (!qaRoute) {
    error.value = '图谱构建完成响应缺少 project_id 或 graph_id，无法进入问答。'
    addLog(error.value)
    return false
  }

  rememberActiveProjectId(window.localStorage, project.project_id)
  router.replace(qaRoute)
  return true
}
```

Call `openCompletedGraphInQa(projRes.data)` only after the final `getProject` response reports `graph_id` and the final `loadGraph` completes:

- In the normal `task.status === 'completed'` branch, after updating base/professional metadata.
- In the missing-task fallback when `project.status === 'graph_completed'`, after the final graph load.

Do not call `handleNextStep()` from either completion path. Leave explicit simulation/report routes intact for independent access.

- [ ] **Step 5: Run completion-routing tests**

Run:

```powershell
node --test tests/graphQaNavigation.test.js tests/graphScopedQaFlow.test.js
```

Expected: all completion-routing tests PASS.

- [ ] **Step 6: Commit build-to-QA routing**

```powershell
git add -- src/features/projects/graphQaNavigation.js src/views/MainView.vue tests/graphQaNavigation.test.js tests/graphScopedQaFlow.test.js
git commit -m "feat: open completed graphs in scoped QA"
```

### Task 4: Delete the Obsolete Registry and Verify the Frontend Boundary

**Files:**
- Delete: `src/features/projects/projectRegistry.js`
- Modify: `tests/graphScopedQaFlow.test.js`

**Interfaces:**
- Preserves: `nexus_active_project_id` as the only project-related browser storage entry used by the retained flow.
- Removes: `registerProject`, `getRegisteredProjectIds`, `removeProjectFromRegistry`, and `asc_project_registry`.

- [ ] **Step 1: Add a failing dead-code assertion**

First change the file-system import at the top of `tests/graphScopedQaFlow.test.js` to:

```js
import { access, readFile } from 'node:fs/promises'
```

Then append:

```js

test('removes the obsolete browser project registry', async () => {
  await assert.rejects(
    access(new URL('../src/features/projects/projectRegistry.js', import.meta.url))
  )

  const [qa, process] = await Promise.all([
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')
  ])
  assert.doesNotMatch(`${qa}\n${process}`, /asc_project_registry|projectRegistry|registerProject|getRegisteredProjectIds/)
})
```

- [ ] **Step 2: Run the dead-code test and confirm it fails while the file exists**

Run:

```powershell
node --test tests/graphScopedQaFlow.test.js
```

Expected: FAIL because `src/features/projects/projectRegistry.js` still exists.

- [ ] **Step 3: Delete only the obsolete frontend registry file**

Delete `src/features/projects/projectRegistry.js`. Search the current frontend to confirm there are no remaining consumers:

```powershell
Get-ChildItem src -Recurse -File -Include *.js,*.vue |
  Select-String -Pattern 'projectRegistry|registerProject|getRegisteredProjectIds|removeProjectFromRegistry|asc_project_registry'
```

Expected: no matches.

- [ ] **Step 4: Run all targeted tests**

Run:

```powershell
node --test tests/projectContextModel.test.js tests/qaApiAdapter.test.js tests/graphQaNavigation.test.js tests/graphScopedQaFlow.test.js tests/requestContracts.test.js tests/apiRuntime.test.js
```

Expected: all targeted tests PASS.

- [ ] **Step 5: Run the full frontend suite and distinguish the baseline failure**

Run:

```powershell
node --test tests/*.test.js
```

Expected: the three original `projectContextModel.test.js` failures are gone. The unrelated pre-existing `carries the backend report task id into the report status polling page` assertion may remain; do not change report code as part of this task.

- [ ] **Step 6: Build the production bundle**

Run:

```powershell
npm run build
```

Expected: Vite exits with code 0 and creates the ignored `dist/` output.

- [ ] **Step 7: Verify the 3000-to-5002 proxy without modifying the backend**

With the already configured backend listening on 5002, start the frontend in one terminal:

```powershell
npm run dev
```

In another terminal, call the backend through the frontend origin:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/graph/project/list?limit=50'
```

Expected: a JSON response with `success: true` and a `data` array. If port 5002 is not listening, stop and report that runtime prerequisite rather than editing backend code.

- [ ] **Step 8: Perform the graph-scoped QA smoke test**

At `http://127.0.0.1:3000`:

1. Open 文献管理 and select at least one backend PDF.
2. Start the existing graph workflow and wait for a project with both IDs to complete.
3. Confirm the browser returns to `/?projectId=<new project id>`.
4. Confirm the graph selector displays and selects the new project.
5. Submit two questions and verify both network payloads contain the same `project_id` and `graph_id` with different `question` values.
6. Switch to another graph and confirm the next payload uses that graph's IDs.
7. Confirm normal completion does not open Step2 or emit a missing `simulation_requirement` error.

- [ ] **Step 9: Confirm the protected repositories were untouched**

Run these read-only checks and compare them with the pre-implementation state:

```powershell
git -C 'D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main' status --short
git -C 'D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main' rev-parse HEAD
```

Expected: no new changes or commit movement caused by this implementation. Existing user changes, if any, remain exactly as they were.

- [ ] **Step 10: Commit dead-code cleanup**

```powershell
git add -- tests/graphScopedQaFlow.test.js
git rm -- src/features/projects/projectRegistry.js
git commit -m "refactor: remove obsolete frontend project registry"
```
