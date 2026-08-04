# Frontend-Backend API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the active Vue pages to the existing Flask API with correct HTTP contracts, real loading/empty/error states, and a complete frontend-to-backend endpoint matrix.

**Architecture:** Keep `src/api` as the only HTTP layer. Add small pure adapters for project selection, PDF records, graph data, and CoD answers so Vue components do not depend directly on backend field variants. Active views orchestrate requests and render explicit real-data states; they never silently substitute Mock results.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios 1, Node test runner, Vite 7, existing Flask API as a read-only contract reference.

## Global Constraints

- Modify files only under `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`.
- Do not modify any file under `backend/`.
- Do not implement or simulate `POST /api/graph/launch`; document it as backend missing.
- Use `POST /api/report/generate/status` with JSON `task_id` and/or `simulation_id`.
- Do not invent DOI, author, journal, citation, or graph values that the backend did not return.
- Do not fall back to Mock answers, Mock documents, or Mock graph nodes when an API is empty or fails.
- Keep `src/api/index.js` as the only Axios instance and preserve `X-NEXUS-USER` behavior.
- Write and run a failing test before each production-code task.
- Do not call real LLM, Zep, upload, or delete endpoints from automated tests.

---

### Task 1: Correct and lock the frontend HTTP contracts

**Files:**
- Create: `tests/apiContracts.test.js`
- Modify: `src/api/graph.js`
- Modify: `src/api/report.js`

**Interfaces:**
- Consumes: Existing shared Axios client from `src/api/index.js`.
- Produces: `listProjects(params = {})` and `getReportStatus({ taskId, simulationId })`.

- [ ] **Step 1: Write the failing API source-contract tests**

Create `tests/apiContracts.test.js` using `node:test`, `node:assert/strict`, and `readFileSync`. Assert that:

```js
test('lists graph projects through the existing backend route', () => {
  assert.match(graphApiSource, /export function listProjects\(params = \{\}\)/)
  assert.match(graphApiSource, /url: '\/api\/graph\/project\/list'/)
  assert.match(graphApiSource, /method: 'get'/)
})

test('posts report status identifiers in a JSON body', () => {
  assert.match(reportApiSource, /getReportStatus = \(\{ taskId, simulationId \} = \{\}\)/)
  assert.match(reportApiSource, /service\.post\('\/api\/report\/generate\/status', payload\)/)
  assert.doesNotMatch(reportApiSource, /params:\s*\{\s*report_id/)
})
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `node --test tests/apiContracts.test.js`

Expected: FAIL because `listProjects` does not exist and `getReportStatus` still sends GET with `report_id`.

- [ ] **Step 3: Implement the minimal API wrappers**

Add to `src/api/graph.js`:

```js
export function listProjects(params = {}) {
  return service({
    url: '/api/graph/project/list',
    method: 'get',
    params
  })
}
```

Replace the report status wrapper with:

```js
export const getReportStatus = ({ taskId, simulationId } = {}) => {
  const payload = {}
  if (taskId) payload.task_id = taskId
  if (simulationId) payload.simulation_id = simulationId
  return service.post('/api/report/generate/status', payload)
}
```

- [ ] **Step 4: Run the contract tests**

Run: `node --test tests/apiContracts.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add tests/apiContracts.test.js src/api/graph.js src/api/report.js
git commit -m "fix: align frontend api contracts"
```

---

### Task 2: Add shared real-project selection

**Files:**
- Create: `src/features/projects/projectContextModel.js`
- Create: `tests/projectContextModel.test.js`

**Interfaces:**
- Consumes: Project objects returned by `GET /api/graph/project/list`.
- Produces: `ACTIVE_PROJECT_STORAGE_KEY`, `listGraphProjects(projects)`, and `resolveActiveProject(projects, preferredProjectId)`.

- [ ] **Step 1: Write failing project-selection tests**

Cover these exact cases:

```js
test('keeps only projects with graph ids', () => {
  assert.deepEqual(listGraphProjects([
    { project_id: 'p1', graph_id: null },
    { project_id: 'p2', graph_id: 'g2' }
  ]).map(project => project.project_id), ['p2'])
})

test('restores the preferred usable project', () => {
  assert.equal(resolveActiveProject(projects, 'p1').project_id, 'p1')
})

test('falls back to the most recently updated usable project', () => {
  assert.equal(resolveActiveProject(projects, 'missing').project_id, 'p2')
})

test('returns null when no graph project exists', () => {
  assert.equal(resolveActiveProject([{ project_id: 'p1' }], 'p1'), null)
})
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `node --test tests/projectContextModel.test.js`

Expected: FAIL because `projectContextModel.js` does not exist.

- [ ] **Step 3: Implement the pure selection model**

Use the stable storage key `nexus_active_project_id`. Filter on a non-empty `graph_id`; sort fallback candidates by `updated_at`, then `created_at`, descending. Do not access `localStorage` inside the pure model.

- [ ] **Step 4: Run the model tests**

Run: `node --test tests/projectContextModel.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/features/projects/projectContextModel.js tests/projectContextModel.test.js
git commit -m "feat: add active graph project selection"
```

---

### Task 3: Adapt real backend graphs for the existing canvas

**Files:**
- Create: `src/features/knowledge/graphApiAdapter.js`
- Create: `tests/graphApiAdapter.test.js`

**Interfaces:**
- Consumes: `{ nodes, edges }` returned by `GET /api/graph/data/:graphId`.
- Produces: `adaptGraphForExplorer(graph)` returning `{ nodes, edges }` in the current `GraphCanvas` format.

- [ ] **Step 1: Write failing graph-adapter tests**

Tests must assert:

```js
const adapted = adaptGraphForExplorer({
  nodes: [
    { uuid: 'n1', name_zh: '碳化硅', entity_type: '原料', aliases: ['SiC'] },
    { id: 'n2', name: '抗热震性', attributes: { entity_type: '性能' } }
  ],
  edges: [
    { uuid: 'e1', source_node_uuid: 'n1', target_node_uuid: 'n2', relation_type: '影响' },
    { uuid: 'dangling', source_node_uuid: 'n1', target_node_uuid: 'missing' }
  ]
})

assert.equal(adapted.nodes[0].nodeId, 'n1')
assert.equal(adapted.nodes[0].label, '碳化硅')
assert.deepEqual(adapted.nodes[0].aliases, ['SiC'])
assert.equal(adapted.edges.length, 1)
assert.equal(adapted.edges[0].source, 'n1')
assert.ok(Number.isFinite(adapted.nodes[0].x))
```

Also adapt endpoint objects such as `{ uuid: 'n1' }`, preserve supplied numeric coordinates, return empty arrays for malformed input, and produce identical coordinates for identical input.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/graphApiAdapter.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter**

Normalize node IDs from `node_id ?? uuid ?? id`, names from `name_zh ?? display_name ?? name`, and types from `entity_type ?? attributes.entity_type ?? '未分类'`. Normalize edge IDs from `edge_id ?? uuid ?? id`; normalize source from `source_node_uuid ?? source_uuid ?? source` and target from `target_node_uuid ?? target_uuid ?? target`, accepting either string IDs or endpoint objects. Filter dangling edges, compute relationship counts, and place missing coordinates on deterministic concentric rings within the 760x520 view box.

- [ ] **Step 4: Run the adapter tests**

Run: `node --test tests/graphApiAdapter.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/features/knowledge/graphApiAdapter.js tests/graphApiAdapter.test.js
git commit -m "feat: adapt backend graphs for explorer"
```

---

### Task 4: Load real projects and graph data in the knowledge explorer

**Files:**
- Modify: `src/views/KnowledgeExplorerView.vue`
- Create: `tests/knowledgeExplorerApiIntegration.test.js`

**Interfaces:**
- Consumes: `listProjects`, `getGraphData`, project-context functions, and `adaptGraphForExplorer`.
- Produces: A real-data `/knowledge/explorer` page with project selection and explicit request states.

- [ ] **Step 1: Write failing integration-source tests**

Assert that the view imports `listProjects` and `getGraphData`, imports `adaptGraphForExplorer`, no longer imports `graphExplorerData.js`, loads on `onMounted`, exposes a project `<select>`, and renders loading, error, no-project, and empty-graph messages.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/knowledgeExplorerApiIntegration.test.js`

Expected: FAIL because the view still imports static graph data.

- [ ] **Step 3: Implement real project and graph loading**

Use refs for `projects`, `selectedProjectId`, `graphNodes`, `graphEdges`, `loading`, and `errorMessage`. On mount:

1. Call `listProjects()`.
2. Resolve the active graph project using `localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)`.
3. Persist a valid selection.
4. Call `getGraphData(activeProject.graph_id)`.
5. Adapt the response with `adaptGraphForExplorer(response.data ?? response)`.

On project change, reset graph focus and load the selected graph. A retry button repeats the failed operation. Never import or display `graphExplorerData.js`.

- [ ] **Step 4: Run the focused and existing frontend tests**

Run: `node --test tests/knowledgeExplorerApiIntegration.test.js tests/ascLabExperience.test.js`

Expected: PASS after updating any old assertion that explicitly required static graph imports; preserve search and focus behavior tests.

- [ ] **Step 5: Commit the task**

```powershell
git add src/views/KnowledgeExplorerView.vue tests/knowledgeExplorerApiIntegration.test.js tests/ascLabExperience.test.js
git commit -m "feat: load real graph projects in explorer"
```

---

### Task 5: Connect the document library to SQLite-backed PDF APIs

**Files:**
- Create: `src/features/library/pdfLibraryAdapter.js`
- Create: `tests/pdfLibraryAdapter.test.js`
- Modify: `src/features/library/DocumentImportModal.vue`
- Modify: `src/features/library/DocumentDetails.vue`
- Modify: `src/views/DocumentLibraryView.vue`
- Create: `tests/documentLibraryApiIntegration.test.js`

**Interfaces:**
- Consumes: `listPdfFiles`, `uploadPdfFiles`, `deletePdfFile`, `getPdfPreviewUrl`, and `getPdfDownloadUrl`.
- Produces: `adaptPdfLibraryRecord(record)` and a real-data document page.

- [ ] **Step 1: Write failing PDF adapter tests**

Assert the exact mapping:

```js
const record = adaptPdfLibraryRecord({
  file_id: 'pdf_1',
  filename: 'thermal-shock.pdf',
  category: '实验论文',
  description: '热震实验记录',
  file_size: 2048,
  sha256: 'abc',
  created_at: '2025-03-02T10:00:00'
})

assert.equal(record.id, 'pdf_1')
assert.equal(record.title, 'thermal-shock.pdf')
assert.equal(record.year, 2025)
assert.equal(record.abstract, '热震实验记录')
assert.equal(record.doi, '')
assert.deepEqual(record.authors, [])
```

Missing fields must yield stable empty values and never sample academic metadata.

- [ ] **Step 2: Run and verify adapter failure**

Run: `node --test tests/pdfLibraryAdapter.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the PDF record adapter**

Return every field currently consumed by `libraryModel`, `DocumentTable`, and `DocumentDetails`, including empty arrays for authors/keywords, category-based tags, file size, hash, and created timestamp. Use `type: 'pdf'`, `typeLabel: category || 'PDF 文献'`, and `parsingStatus: 'stored'`.

- [ ] **Step 4: Run the adapter test**

Run: `node --test tests/pdfLibraryAdapter.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing document-page API integration tests**

Assert that `DocumentLibraryView.vue` imports all five PDF API functions, no longer imports `libraryData.js`, loads files on mount, creates `FormData` with `files`, and reloads after upload/delete. Assert that `DocumentImportModal` emits actual `File[]`, accepts `busy` and `errorMessage`, and does not display “前端模拟导入”. Assert that DOI and batch actions are visibly disabled as unsupported by the current backend.

- [ ] **Step 6: Run and verify page integration failure**

Run: `node --test tests/documentLibraryApiIntegration.test.js`

Expected: FAIL because the page still uses seed documents and simulated import.

- [ ] **Step 7: Implement real list/upload/preview/download/delete flows**

Load `listPdfFiles()` on mount and adapt `response.data`. The modal retains selected `File` objects and emits `{ mode: 'upload', files }`. The parent appends every file to `FormData` under `files`, calls `uploadPdfFiles`, refreshes, closes, and shows the backend message. Details actions open preview, navigate to download, and ask for browser confirmation before `deletePdfFile`. Render explicit loading, error, retry, and empty states.

- [ ] **Step 8: Run library tests**

Run: `node --test tests/pdfLibraryAdapter.test.js tests/documentLibraryApiIntegration.test.js tests/ascLabExperience.test.js`

Expected: PASS after replacing assertions that required seed data or simulated success.

- [ ] **Step 9: Commit the task**

```powershell
git add src/features/library/pdfLibraryAdapter.js src/features/library/DocumentImportModal.vue src/features/library/DocumentDetails.vue src/views/DocumentLibraryView.vue tests/pdfLibraryAdapter.test.js tests/documentLibraryApiIntegration.test.js tests/ascLabExperience.test.js
git commit -m "feat: connect document library to pdf api"
```

---

### Task 6: Connect the QA page to CoD GraphRAG and real evaluation APIs

**Files:**
- Create: `src/features/qa/qaApiAdapter.js`
- Create: `tests/qaApiAdapter.test.js`
- Modify: `src/features/qa/qaDemoModel.js`
- Modify: `src/features/qa/ConversationPanel.vue`
- Modify: `src/views/AscQaView.vue`
- Create: `tests/qaApiIntegration.test.js`

**Interfaces:**
- Consumes: `listProjects`, `codGraphRAGQuery`, `judgeQAWithLLM`, `submitQAFeedback`, and shared project selection.
- Produces: `adaptCodGraphRagResponse(payload)`, `completeApiAnswer(state, adaptedAnswer)`, and a real-data QA page.

- [ ] **Step 1: Write failing CoD response-adapter tests**

Use a realistic backend envelope:

```js
const adapted = adaptCodGraphRagResponse({
  success: true,
  data: {
    qa_run_id: 'qarun_1',
    final_answer: '核心结论。\n\n## 机理\n碳化硅改善热震性能。',
    references: [{
      reference_id: 'R1',
      source_label: 'paper.pdf',
      original_quote: '实验原文',
      page_number: 4,
      metadata: {}
    }],
    citation_bindings: [{ reference_id: 'R1', answer_excerpt: '碳化硅改善热震性能。' }],
    debug_trace: { stages: [{ stage: 'retrieval' }, { stage: 'answer' }] }
  }
})

assert.equal(adapted.qaRunId, 'qarun_1')
assert.equal(adapted.answer.summary, '核心结论。')
assert.equal(adapted.answer.sections[0].title, '机理')
assert.deepEqual(adapted.answer.sections[0].citations, ['R1'])
assert.equal(adapted.references[0].id, 'R1')
```

Also cover plain text without Markdown headings, empty references, the backend envelope, and an empty `final_answer` error.

- [ ] **Step 2: Run and verify adapter failure**

Run: `node --test tests/qaApiAdapter.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the CoD response adapter and API completion state**

Parse the first non-heading paragraph as summary and Markdown `##` headings as sections. If no headings exist, create one `回答` section for remaining text. Map references as follows: `reference_id -> id`, `source_label || paper_id || source_file_id || reference_id -> title`, `source -> source`, `metadata.year -> year`, `page_number -> locator`, and `original_quote -> excerpt`; use an empty authors string when the backend supplies none. Bind citations by matching `answer_excerpt` to section bodies; if a binding cannot be localized, list it in the summary citation set. Add `qaRunId` and `errorMessage` to QA state. `completeApiAnswer` sets `phase: 'answered'`, real answer/references, and opens evidence only when references exist.

- [ ] **Step 4: Run adapter and state tests**

Run: `node --test tests/qaApiAdapter.test.js tests/ascLabExperience.test.js`

Expected: PASS while existing evaluation-state behavior remains intact.

- [ ] **Step 5: Write failing QA page integration tests**

Assert that `AscQaView.vue` imports `listProjects` and `codGraphRAGQuery`, does not import or call `completeMockAnswer`, sends `question`, `project_id`, `graph_id`, and mapped `reasoning_mode`, sets evaluation service mode to `api`, disables submission without a graph, and renders retryable API errors. Assert that static recent conversations are labeled as example questions rather than persisted history.

- [ ] **Step 6: Run and verify page integration failure**

Run: `node --test tests/qaApiIntegration.test.js`

Expected: FAIL because the page still completes answers with a timer and Mock data.

- [ ] **Step 7: Implement real QA orchestration**

Load projects on mount, resolve and persist the active graph project, and expose a project selector in the QA header/settings area. Convert the visible reasoning values exactly as `Auto -> auto`, `CoT -> cot`, and `ToT -> tot`. Convert `sendQuestion` to async: start loading state, call `codGraphRAGQuery`, adapt response, and apply `completeApiAnswer`. On failure, keep the question visible, set `phase: 'error'`, and provide a retry action. Remove the completion timer. Use real evaluation APIs and include `qa_run_id` in feedback payloads where supported by the existing backend wrapper.

- [ ] **Step 8: Run QA tests**

Run: `node --test tests/qaApiAdapter.test.js tests/qaApiIntegration.test.js tests/ascLabExperience.test.js`

Expected: PASS after replacing Mock-answer assertions with real API orchestration assertions.

- [ ] **Step 9: Commit the task**

```powershell
git add src/features/qa/qaApiAdapter.js src/features/qa/qaDemoModel.js src/features/qa/ConversationPanel.vue src/views/AscQaView.vue tests/qaApiAdapter.test.js tests/qaApiIntegration.test.js tests/ascLabExperience.test.js
git commit -m "feat: connect qa page to graphrag api"
```

---

### Task 7: Publish the endpoint matrix and verify the frontend

**Files:**
- Create: `docs/frontend-backend-api-contract.md`
- Modify: `tests/apiContracts.test.js`

**Interfaces:**
- Consumes: Every exported function in `src/api/graph.js`, `pdfLibrary.js`, `report.js`, and `simulation.js`, plus Flask routes inspected read-only.
- Produces: A complete API handoff table and a verified production build.

- [ ] **Step 1: Extend the failing contract test for complete inventory coverage**

Add a test that extracts frontend endpoint strings and verifies that the documentation contains, at minimum, every exported frontend API function name. Include explicit assertions that the documentation marks:

```text
POST /api/graph/launch -> 后端待实现
POST /api/report/generate/status -> 已对齐
```

- [ ] **Step 2: Run and verify documentation coverage failure**

Run: `node --test tests/apiContracts.test.js`

Expected: FAIL because `docs/frontend-backend-api-contract.md` does not exist.

- [ ] **Step 3: Write the complete endpoint matrix**

Create one row per frontend API operation with these columns:

```text
模块 | 前端函数 | HTTP 方法 | URL | 页面/功能 | 后端文件与路由 | 状态 | 调用位置 | 限制
```

Cover graph/GraphRAG, PDF library, report, and simulation. Use only these status values: `已对齐并接入新版页面`, `已对齐但仅旧页面使用`, `已对齐但当前未调用`, `前后端方法已修正`, `后端待实现`. Record that report status expects `task_id` or `simulation_id`, PDF records lack academic metadata, and CoD queries require explicit scope.

- [ ] **Step 4: Run the complete test suite**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with no failures.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: Vite exits 0 and writes `dist/` without compile errors.

- [ ] **Step 6: Perform read-only backend smoke checks while the local server is running**

Run from PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:5001/health
Invoke-RestMethod http://127.0.0.1:5001/api/graph/project/list -Headers @{'X-NEXUS-USER'='local-asc-analyst'}
Invoke-RestMethod http://127.0.0.1:5001/api/pdf-library/files -Headers @{'X-NEXUS-USER'='local-asc-analyst'}
```

Expected: each request returns successfully; empty arrays are acceptable.

- [ ] **Step 7: Verify repository scope**

Run:

```powershell
git status --short
git diff --name-only f1ca71a..HEAD
```

Expected: every changed path is under the frontend repository; no backend file appears.

- [ ] **Step 8: Commit the contract and final test update**

```powershell
git add docs/frontend-backend-api-contract.md tests/apiContracts.test.js
git commit -m "docs: publish frontend backend api contract"
```
