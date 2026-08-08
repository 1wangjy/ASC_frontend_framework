# Frontend Module Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the QA, document library, and backend workflow routes runnable; remove the four retired portal routes and dead source files; move “新建问答” into “历史问题”; and route the 3000 development frontend to the 5002 backend.

**Architecture:** The ASC shell remains the single application shell. Portal navigation is reduced to QA and documents, while the existing process/simulation/report/interaction route chain stays available as non-primary workflow routes. API callers share one runtime base URL helper; development uses relative `/api` URLs so Vite’s 3000 server proxies them to port 5002.

**Tech Stack:** Vue 3, Vue Router 4, Vite 7, Axios, Node.js built-in test runner.

## Execution Adjustments

- Component assertions were implemented through Vite SSR rendering in `tests/helpers/renderSfc.js`, so the regression test checks rendered UI rather than only matching source text.
- The approved deletion boundary was verified with filesystem/import checks and a full Vite build. No permanent “file must not exist” test was kept because that would test repository layout rather than user-visible behavior.
- The full-suite baseline changed only because tests dedicated to the deleted graph explorer were removed; remaining pre-existing report-task and project-context failures are reported separately.

## Global Constraints

- Keep `/`, `/documents`, `/process/:projectId`, `/simulation/:simulationId`, `/simulation/:simulationId/start`, `/report/:reportId`, and `/interaction/:reportId`.
- Remove `/knowledge`, `/knowledge/explorer`, `/data`, and `/models` plus their exclusive source code.
- Keep graph APIs and graph-dependent workflow components used by QA, documents, simulation, reports, and interaction.
- The default frontend port stays `3000`; the development backend target becomes `http://127.0.0.1:5002`.
- Do not modify `D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main`.
- Do not change backend report-status or project-list request contracts in this task.
- Use `apply_patch` for every source/test/document edit and deletion.
- Existing baseline failures outside this scope must be reported separately rather than hidden.

## File Structure

- `src/features/navigation/appNavigation.js`: primary navigation and sample conversation records.
- `src/config/ascRoutes.js`: retained application and workflow routes.
- `src/components/navigation/AscSidebar.vue`: brand, collapse control, and primary navigation only.
- `src/layouts/AscShell.vue`: shell layout and mobile navigation only.
- `src/features/qa/RecentConversationsPanel.vue`: history list and the relocated new-question action.
- `src/views/AscQaView.vue`: owns QA reset behavior and handles `new-chat` from the history panel.
- `src/api/runtime.js`: normalized API base URL and absolute/relative API URL construction.
- `src/api/index.js`, `src/api/pdfLibrary.js`, `src/components/Step5Interaction.vue`: consumers of the shared runtime API URL.
- `tests/navigationCleanup.test.js`: focused navigation, route, and new-question regression tests.
- `tests/moduleRemoval.test.js`: source-removal boundary test.
- `tests/apiRuntime.test.js`: API URL and port regression tests.
- `tests/fixtures/libraryDocuments.js`: test-only literature records moved out of production source.

---

### Task 1: Reduce navigation and relocate “新建问答”

**Files:**
- Create: `tests/navigationCleanup.test.js`
- Modify: `src/features/navigation/appNavigation.js`
- Modify: `src/config/ascRoutes.js`
- Modify: `src/components/navigation/AscSidebar.vue`
- Modify: `src/layouts/AscShell.vue`
- Modify: `src/features/qa/RecentConversationsPanel.vue`
- Modify: `src/views/AscQaView.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: `primaryNavigation`, `ascRouteDefinitions`, and the existing `AscQaView.reset()` function.
- Produces: `RecentConversationsPanel` event `new-chat`, handled by `AscQaView` as `@new-chat="reset"`.

- [ ] **Step 1: Write the failing navigation and history-panel test**

```js
// tests/navigationCleanup.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { primaryNavigation } from '../src/features/navigation/appNavigation.js'
import { ascRouteDefinitions } from '../src/config/ascRoutes.js'

const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('keeps only QA and documents in primary navigation while retaining workflow routes', () => {
  assert.deepEqual(primaryNavigation.map(({ label, path }) => [label, path]), [
    ['问答首页', '/'],
    ['文献管理', '/documents']
  ])
  assert.deepEqual(ascRouteDefinitions.map(({ name, path }) => [name, path]), [
    ['AscQa', '/'],
    ['Documents', '/documents'],
    ['Process', '/process/:projectId'],
    ['Simulation', '/simulation/:simulationId'],
    ['SimulationRun', '/simulation/:simulationId/start'],
    ['Report', '/report/:reportId'],
    ['Interaction', '/interaction/:reportId']
  ])
})

test('places new chat inside the history panel instead of the sidebar', async () => {
  const [panel, sidebar, shell, qaView] = await Promise.all([
    source('src/features/qa/RecentConversationsPanel.vue'),
    source('src/components/navigation/AscSidebar.vue'),
    source('src/layouts/AscShell.vue'),
    source('src/views/AscQaView.vue')
  ])

  assert.match(panel, /default:\s*'历史问题'/)
  assert.match(panel, />新建问答</)
  assert.match(panel, /\$emit\('new-chat'\)/)
  assert.match(qaView, /@new-chat="reset"/)
  assert.doesNotMatch(sidebar, /新建问答|new-question|new-chat/)
  assert.doesNotMatch(shell, /startNewChat|new-chat/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/navigationCleanup.test.js`

Expected: both tests fail because the old three navigation items/routes and sidebar button still exist, and the panel still says “示例问题”.

- [ ] **Step 3: Implement the minimal navigation and UI changes**

Change `primaryNavigation` to:

```js
export const primaryNavigation = [
  { label: '问答首页', path: '/', icon: 'home' },
  { label: '文献管理', path: '/documents', icon: 'document' }
]
```

Remove the four retired route objects from `ascRouteDefinitions`. Keep the five workflow routes and change their retired `navigationPath: '/knowledge'` values to `navigationPath: '/'`.

Remove the `.new-question` button, CSS, collapsed-state selector, and `new-chat` emit from `AscSidebar.vue`. Remove `useRouter`, `router`, `startNewChat`, and the sidebar `@new-chat` listener from `AscShell.vue`.

In `RecentConversationsPanel.vue`, make the heading row contain the title and action:

```vue
<div class="recent-conversations__heading">
  <div>
    <span>{{ title }}</span>
    <small>{{ conversations.length }} 条</small>
  </div>
  <button class="recent-conversations__new" type="button" @click="$emit('new-chat')">
    <AscIcon name="plus" />
    <span>新建问答</span>
  </button>
</div>
```

Set the title default to `历史问题`, add `new-chat` to `defineEmits`, and add compact responsive styles for `.recent-conversations__new`. In `AscQaView.vue`, add `@new-chat="reset"` to `RecentConversationsPanel`.

Update `tests/ascLabExperience.test.js` navigation, history-label, sidebar, and route expectations to the same two navigation entries and seven retained routes.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/navigationCleanup.test.js`

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit the navigation change**

```powershell
git add -- tests/navigationCleanup.test.js tests/ascLabExperience.test.js src/features/navigation/appNavigation.js src/config/ascRoutes.js src/components/navigation/AscSidebar.vue src/layouts/AscShell.vue src/features/qa/RecentConversationsPanel.vue src/views/AscQaView.vue
git commit -m "feat: simplify portal navigation and move new chat"
```

---

### Task 2: Remove retired modules and confirmed dead source

**Files:**
- Create: `tests/moduleRemoval.test.js`
- Create: `tests/fixtures/libraryDocuments.js`
- Modify: `tests/ascLabExperience.test.js`
- Delete: `tests/graphApiAdapter.test.js`
- Delete: `tests/graphWorkspaceService.test.js`
- Delete: `src/views/KnowledgeView.vue`
- Delete: `src/views/KnowledgeExplorerView.vue`
- Delete: `src/views/DataPlatformView.vue`
- Delete: `src/views/ModelsView.vue`
- Delete: `src/features/knowledge/graphApiAdapter.js`
- Delete: `src/features/knowledge/GraphCanvas.vue`
- Delete: `src/features/knowledge/graphExplorerData.js`
- Delete: `src/features/knowledge/graphExplorerModel.js`
- Delete: `src/features/knowledge/GraphNodeSearch.vue`
- Delete: `src/features/knowledge/graphWorkspaceService.js`
- Delete: `src/features/overview/moduleCatalog.js`
- Delete: `src/features/overview/ModuleOverview.vue`
- Delete: `src/views/Home.vue`
- Delete: `src/views/Process.vue`
- Delete: `src/components/ASCReportUploader.vue`
- Delete: `src/components/HistoricalDataImport.vue`
- Delete: `src/components/HistoryDatabase.vue`
- Delete: `src/components/PdfStorageSidebar.vue`
- Delete: `src/utils/ascPromptBuilder.js`
- Delete: `src/features/library/libraryData.js`
- Delete: `src/assets/ASC_WebPage.png`
- Delete: `src/assets/logo/image.png`
- Delete: `src/assets/logo/nexus_logo_compressed.jpeg`
- Delete: `src/assets/logo/nexus_logo_left.jpeg`
- Delete: `src/assets/logo/nexus_logo_left1.jpeg`

**Interfaces:**
- Consumes: approved deletion list in `docs/superpowers/specs/2026-08-08-frontend-module-cleanup-design.md`.
- Produces: no production import or route referencing the retired module files; literature model tests consume `tests/fixtures/libraryDocuments.js`.

- [ ] **Step 1: Write the failing removal-boundary test**

```js
// tests/moduleRemoval.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'

const removedPaths = [
  'src/views/KnowledgeView.vue',
  'src/views/KnowledgeExplorerView.vue',
  'src/views/DataPlatformView.vue',
  'src/views/ModelsView.vue',
  'src/features/knowledge',
  'src/features/overview',
  'src/views/Home.vue',
  'src/views/Process.vue',
  'src/components/ASCReportUploader.vue',
  'src/components/HistoricalDataImport.vue',
  'src/components/HistoryDatabase.vue',
  'src/components/PdfStorageSidebar.vue',
  'src/utils/ascPromptBuilder.js',
  'src/features/library/libraryData.js',
  'src/assets'
]

test('retired portal modules and confirmed dead source are absent', async () => {
  for (const path of removedPaths) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)), undefined, path)
  }
})
```

- [ ] **Step 2: Run the removal test and verify RED**

Run: `node --test tests/moduleRemoval.test.js`

Expected: fail at `src/views/KnowledgeView.vue` because the retired files still exist.

- [ ] **Step 3: Move the literature sample records into a test fixture**

Create `tests/fixtures/libraryDocuments.js` with the unchanged `export const documents = [...]` content currently in `src/features/library/libraryData.js`. Change the import at the top of `tests/ascLabExperience.test.js` to:

```js
const libraryData = await import('./fixtures/libraryDocuments.js').catch(() => ({}))
```

Remove the `overview`, `graphData`, and `graph` imports and remove the tests that only exercise `moduleCatalog`, `KnowledgeView`, `graphExplorerModel`, or `graphExplorerData`.

- [ ] **Step 4: Delete the approved source and obsolete tests with `apply_patch`**

Delete every file listed in this task. Do not delete `src/api/graph.js`, `src/features/projects`, `src/components/GraphPanel.vue`, `src/components/Step1GraphBuild.vue`, `src/components/Step2SimulationConfig.vue`, `src/components/Step3Simulation.vue`, `src/components/Step4Report.vue`, `src/components/Step5Interaction.vue`, or any retained workflow view.

- [ ] **Step 5: Run the removal and retained experience tests**

Run: `node --test tests/moduleRemoval.test.js tests/ascLabExperience.test.js`

Expected: module-removal test passes; ASC experience tests have no failures caused by missing retired imports or deleted routes. The known report-task assertion may remain and must be reported separately.

- [ ] **Step 6: Commit the source cleanup**

```powershell
git add -A -- tests src
git commit -m "refactor: remove retired portal modules and dead source"
```

---

### Task 3: Route the 3000 frontend to the 5002 backend

**Files:**
- Create: `src/api/runtime.js`
- Create: `tests/apiRuntime.test.js`
- Modify: `vite.config.js`
- Modify: `src/api/index.js`
- Modify: `src/api/pdfLibrary.js`
- Modify: `src/components/Step5Interaction.vue`

**Interfaces:**
- Produces: `API_BASE_URL: string` and `buildApiUrl(path: string, base?: string): string`.
- Consumers: Axios `baseURL`, PDF preview/download URLs, and Step5 deep-link URLs.

- [ ] **Step 1: Write the failing API runtime test**

```js
// tests/apiRuntime.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('normalizes configured API bases and keeps development URLs relative', async () => {
  const runtimeSource = await readFile(
    new URL('../src/api/runtime.js', import.meta.url),
    'utf8'
  ).catch(() => '')
  assert.match(runtimeSource, /export function normalizeApiBaseUrl/)

  const runtime = await import('../src/api/runtime.js')
  assert.equal(runtime.normalizeApiBaseUrl('http://127.0.0.1:5002/'), 'http://127.0.0.1:5002')
  assert.equal(runtime.buildApiUrl('/api/pdf-library/files/1', ''), '/api/pdf-library/files/1')
  assert.equal(
    runtime.buildApiUrl('/api/report/1', 'http://127.0.0.1:5002/'),
    'http://127.0.0.1:5002/api/report/1'
  )

  const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /port:\s*3000/)
  assert.match(vite, /target:\s*'http:\/\/127\.0\.0\.1:5002'/)
})

test('active frontend source no longer hardcodes port 5001', async () => {
  const paths = [
    '../vite.config.js',
    '../src/api/index.js',
    '../src/api/pdfLibrary.js',
    '../src/components/Step5Interaction.vue'
  ]
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /127\.0\.0\.1:5001/, path)
  }
})
```

- [ ] **Step 2: Run the API test and verify RED**

Run: `node --test tests/apiRuntime.test.js`

Expected: assertion failure because `src/api/runtime.js` does not yet export `normalizeApiBaseUrl`; the second test also fails because active files still contain port 5001.

- [ ] **Step 3: Implement the shared API runtime URL**

```js
// src/api/runtime.js
export function normalizeApiBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env?.VITE_API_BASE_URL || ''
)

export function buildApiUrl(path = '', base = API_BASE_URL) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path}`
  return `${normalizeApiBaseUrl(base)}${normalizedPath}`
}
```

Set the Vite proxy target to `http://127.0.0.1:5002`. Import `API_BASE_URL` in `src/api/index.js` and use it as Axios `baseURL`. Import `buildApiUrl` in `src/api/pdfLibrary.js` and build preview/download URLs with it. Import `buildApiUrl` in `Step5Interaction.vue` and replace the local `VITE_API_BASE_URL || 5001` concatenation with `buildApiUrl(deepLink)`.

- [ ] **Step 4: Run the API test and verify GREEN**

Run: `node --test tests/apiRuntime.test.js`

Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit the 5002 connection change**

```powershell
git add -- tests/apiRuntime.test.js src/api/runtime.js src/api/index.js src/api/pdfLibrary.js src/components/Step5Interaction.vue vite.config.js
git commit -m "fix: route frontend development API to port 5002"
```

---

### Task 4: Verify the retained frontend and report exact baseline status

**Files:**
- Modify only if verification finds a regression introduced by Tasks 1–3.

**Interfaces:**
- Consumes: all focused tests and the Vite production build.
- Produces: verified build evidence, focused regression-test evidence, full-suite delta, and optional live proxy evidence.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
node --test tests/navigationCleanup.test.js tests/moduleRemoval.test.js tests/apiRuntime.test.js
```

Expected: all focused cleanup tests pass.

- [ ] **Step 2: Run every remaining Node test and compare with baseline**

Run:

```powershell
$testFiles = Get-ChildItem -Path tests -Filter *.test.js | ForEach-Object { $_.FullName }
node --test $testFiles
```

Expected: no new failures caused by removed files, routes, navigation, history UI, or API runtime. Report any remaining known report-task/project-context failures by exact test name and count.

- [ ] **Step 3: Run the production build**

Run: `npm.cmd run build`

Expected: exit code 0 and a generated `dist` bundle without unresolved imports.

- [ ] **Step 4: Check development ports without starting or stopping user processes**

Run:

```powershell
foreach ($port in 3000, 5002) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -UseBasicParsing -TimeoutSec 2
    "$port HTTP=$($response.StatusCode)"
  } catch {
    "$port NOT_RESPONDING"
  }
}
```

If 5002 responds, request a lightweight proxied endpoint through 3000 and record the HTTP result. If it does not respond, state that static configuration and build were verified but live backend integration was not.

- [ ] **Step 5: Inspect the final diff and worktree**

Run:

```powershell
git status --short
git diff --stat HEAD~3..HEAD
```

Confirm no `D:\WEB` files changed and no retained workflow source was deleted.
