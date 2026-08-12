# Report Center Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the single-report generation lifecycle out of the graph simulation page and into the existing report-center sidebar module, with real progress recovery, preview, download, and qualified QA navigation.

**Architecture:** A pure lifecycle model joins logical graph projects with saved reports and decides which projects can generate, open, download, or enter QA. A generation controller enforces the one-project-one-report rule across uncertain network outcomes. `ReportCenterView` renders the lifecycle records, while the existing focused `ReportView` remains the report reader and gains shared report actions.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios, Node test runner, Vite 7.

## Global Constraints

- Modify frontend code only; do not modify or restart the backend on port 5002.
- Keep one graph project associated with at most one backend report until a future backend versioning contract exists.
- Treat any existing non-empty `report_id` as report ownership, regardless of completed, generating, or failed status.
- Never send `force_regenerate: true`; never automatically retry `/api/report/generate`.
- Report generation POST is allowed only after a direct user click and a fresh successful existing-report check.
- Keep the current report-center and report-reader visual language; do not bring the old five-step workflow UI into these pages.
- Keep unrelated untracked `tmp/` content untouched and unstaged.

---

### Task 1: Graph-to-report lifecycle records

**Files:**
- Create: `src/features/reports/reportProjectLifecycleModel.js`
- Create: `tests/reportProjectLifecycleModel.test.js`

**Interfaces:**
- Consumes: logical graph projects from `buildLogicalGraphProjects(items)` and raw reports from `listReports()`.
- Produces: `isEvolutionComplete(project) -> boolean`.
- Produces: `buildReportProjectRecords(projects, reports) -> ReportProjectRecord[]`.
- `ReportProjectRecord`: `{ projectId, graphId, simulationId, projectName, evolutionStatus, reportId, reportStatus, reportTaskId, report, canGenerate, canPreview, canDownload, canOpenQa }`.

- [ ] **Step 1: Write failing lifecycle-model tests**

```js
test('offers generation only for an evolved project without any report', () => {
  const [record] = buildReportProjectRecords([{
    projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '哈哈哈',
    evolutionStatus: 'evolution_completed'
  }], [])

  assert.equal(record.canGenerate, true)
  assert.equal(record.reportId, '')
  assert.equal(record.canOpenQa, false)
})

test('any existing report id prevents another report generation request', () => {
  for (const status of ['generating', 'completed', 'failed']) {
    const [record] = buildReportProjectRecords([{
      projectId: 'p1', graphId: 'g1', simulationId: 's1', name: '哈哈哈',
      evolutionStatus: 'evolution_completed'
    }], [{ report_id: `r-${status}`, simulation_id: 's1', graph_id: 'g1', status }])
    assert.equal(record.canGenerate, false)
    assert.equal(record.reportId, `r-${status}`)
    assert.equal(record.canOpenQa, status === 'completed')
  }
})
```

Add cases for: unfinished evolution excluded from generation; graph-ID match takes precedence over simulation-ID match; unmatched saved reports remain visible as report-only records; duplicate backend rows resolve deterministically to the newest row without authorizing a second report.

- [ ] **Step 2: Run the focused test and record RED**

Run: `node --test tests/reportProjectLifecycleModel.test.js`

Expected: failure because `reportProjectLifecycleModel.js` does not exist.

- [ ] **Step 3: Implement the pure lifecycle model**

```js
export function isEvolutionComplete(project = {}) {
  return String(project.evolutionStatus || '').trim() === 'evolution_completed'
}

export function buildReportProjectRecords(projects = [], reports = []) {
  // Normalize IDs, associate by graph_id then simulation_id, and publish
  // capabilities from evolution/report status. Never infer completion from UI progress.
}
```

Use `normalizeReportStatus` from `reportReaderModel.js`. A report-only unmatched row must use `未关联图谱` and set all mutation capabilities to `false`.

- [ ] **Step 4: Run focused tests and record GREEN**

Run: `node --test tests/reportProjectLifecycleModel.test.js tests/reportCenterModel.test.js tests/graphTaskMonitorModel.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the lifecycle boundary**

```powershell
git add -- src/features/reports/reportProjectLifecycleModel.js tests/reportProjectLifecycleModel.test.js
git commit -m "feat: model graph report lifecycles"
```

### Task 2: Strict single-report generation controller

**Files:**
- Modify: `src/features/reports/singleReportModel.js`
- Modify: `tests/singleReportFlow.test.js`

**Interfaces:**
- Produces: `existingReportFromStatus(response) -> { reportId, reportStatus, taskId } | null`.
- `createSingleReportFlow(...)` keeps `inspect(simulationId)`, `proceed(simulationId)`, and `snapshot()`.
- `snapshot()` gains `reportStatus` and `taskId`.

- [ ] **Step 1: Add failing non-completed ownership tests**

```js
test('opens an existing generating report instead of creating another one', async () => {
  let generateCalls = 0
  const opened = []
  const flow = createSingleReportFlow({
    checkExistingReport: async () => ({ success: true, data: {
      has_report: true, report_id: 'r-running', report_status: 'generating', task_id: 't1'
    }}),
    requestReport: async () => { generateCalls += 1 },
    openReport: destination => opened.push(destination)
  })

  await flow.proceed('s1')
  assert.equal(generateCalls, 0)
  assert.deepEqual(opened, [{ reportId: 'r-running', taskId: 't1' }])
})
```

Add the same assertion for failed reports, a response with `report_id` but an inconsistent `has_report` flag, concurrent `proceed()` calls, a network failure after the existing-report check, and a context switch from `s1` to `s2` while the first check is pending. A response that claims `has_report: true` but omits `report_id` must fail closed and must not generate.

- [ ] **Step 2: Run the single-report tests and record RED**

Run: `node --test tests/singleReportFlow.test.js`

Expected: the generating/failed ownership tests fail because the current helper only recognizes completed reports.

- [ ] **Step 3: Implement fail-closed report ownership**

```js
export function existingReportFromStatus(response = {}) {
  const data = response?.data || {}
  const reportId = String(data.report_id || '').trim()
  if (response?.success !== true || !reportId) return null
  return {
    reportId,
    reportStatus: String(data.report_status || '').trim().toLowerCase() || 'unknown',
    taskId: String(data.task_id || '').trim()
  }
}
```

`proceed()` must open any non-empty report ID regardless of an inconsistent `has_report` flag. It must call `requestReport` only when a fresh successful check explicitly returns `has_report: false` with no report ID. `has_report: true` without an ID, unknown/missing flags, failed checks, and transport failures all block generation. Keep one in-flight generation promise per active simulation.

- [ ] **Step 4: Run focused API/flow tests**

Run: `node --test tests/singleReportFlow.test.js tests/reportApi.test.js tests/graphApiAttemptCount.test.js`

Expected: all tests pass, including exactly one report-generation POST on a transport failure.

- [ ] **Step 5: Commit strict ownership**

```powershell
git add -- src/features/reports/singleReportModel.js tests/singleReportFlow.test.js
git commit -m "fix: prevent duplicate project reports"
```

### Task 3: Safe backend report download

**Files:**
- Create: `src/features/reports/reportDownload.js`
- Create: `tests/reportDownload.test.js`
- Modify: `tests/reportApi.test.js`

**Interfaces:**
- Consumes: `downloadReport(reportId)` returning a Blob-compatible payload.
- Produces: `buildReportFilename(projectName) -> string`.
- Produces: `saveReportDownload({ reportId, projectName, downloadReport, browser }) -> Promise<string>` returning the chosen filename.

- [ ] **Step 1: Write failing download tests**

```js
test('downloads the backend blob with a safe graph-project filename', async () => {
  const clicks = []
  const filename = await saveReportDownload({
    reportId: 'r1',
    projectName: '哈哈哈 / 测试',
    downloadReport: async () => new Blob(['# report'], { type: 'text/markdown' }),
    browser: createFakeDownloadBrowser(clicks)
  })
  assert.equal(filename, '哈哈哈-测试-研究报告.md')
  assert.deepEqual(clicks, ['哈哈哈-测试-研究报告.md'])
})
```

Add tests for absent browser APIs, backend failure, URL revocation, empty Blob rejection, and project names made entirely from invalid filename characters. The current Axios response interceptor exposes only the Blob, not response headers, so this implementation must not pretend to read `Content-Disposition`.

- [ ] **Step 2: Run download tests and record RED**

Run: `node --test tests/reportDownload.test.js tests/reportApi.test.js`

Expected: failure because `reportDownload.js` does not exist.

- [ ] **Step 3: Implement the download helper**

```js
export async function saveReportDownload({ reportId, projectName, downloadReport, browser }) {
  const response = await downloadReport(reportId)
  const blob = response instanceof Blob ? response : response?.data
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('后端未返回可下载的报告文件')
  // Create one object URL, click one hidden anchor, revoke in finally.
}
```

Normalize Windows-invalid filename characters (`<>:"/\\|?*`) to `-`, collapse repeated separators, and cap the basename length before adding `.md`.

- [ ] **Step 4: Run focused download tests**

Run: `node --test tests/reportDownload.test.js tests/reportApi.test.js tests/apiRuntime.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit download support**

```powershell
git add -- src/features/reports/reportDownload.js tests/reportDownload.test.js tests/reportApi.test.js
git commit -m "feat: download saved research reports"
```

### Task 4: Report-center lifecycle UI and controller wiring

**Files:**
- Create: `src/features/reports/reportCenterController.js`
- Create: `tests/reportCenterController.test.js`
- Modify: `src/views/ReportCenterView.vue`
- Modify: `src/features/reports/reportCenterModel.js`
- Modify: `tests/reportCenterModel.test.js`
- Modify: `tests/reportNavigation.test.js`

**Interfaces:**
- `createReportCenterController({ listReports, checkExistingReport, generateReport, downloadReport, getProjects, openReport, browser, onChange })`.
- Methods: `refresh()`, `generate(record)`, `download(record)`, `stop()`.
- State: `{ loading, mutatingProjectId, downloadingReportId, reports, records, error, actionError }`.

- [ ] **Step 1: Write controller race and action tests**

Test all of the following with injected deferred promises:

```js
test('a double click shares one generation request', async () => {
  const controller = createReportCenterController(dependencies)
  const first = controller.generate(evolvedRecord)
  const second = controller.generate(evolvedRecord)
  assert.strictEqual(first, second)
  await first
  assert.equal(generateCalls, 1)
})
```

Also prove: refresh suppresses stale responses; existing report opens instead of generating; failed check blocks POST; generation completion triggers one list refresh; `stop()` suppresses late state mutation; download state is scoped by report ID.

- [ ] **Step 2: Run controller tests and record RED**

Run: `node --test tests/reportCenterController.test.js`

Expected: failure because the controller does not exist.

- [ ] **Step 3: Implement the controller with injected side effects**

The controller must derive records through `buildReportProjectRecords`, use `createSingleReportFlow` for generation, and use `saveReportDownload` for downloads. `getProjects()` is a synchronous getter over `buildLogicalGraphProjects(monitor.state.items)`; the controller must not start, stop, or duplicate the global graph monitor. `openReport({ reportId, taskId })` is injected by `ReportCenterView` and performs the existing Vue Router navigation. `browser` is forwarded only to the download helper.

- [ ] **Step 4: Write failing report-center view contracts**

```js
assert.match(source, /buildReportProjectRecords|createReportCenterController/)
assert.match(source, /生成报告/)
assert.match(source, /预览/)
assert.match(source, /下载/)
assert.match(source, /去问答/)
assert.doesNotMatch(source, /force_regenerate\s*:\s*true/)
```

Require separate buttons rather than nesting buttons inside a full-card `<router-link>`.

- [ ] **Step 5: Implement lifecycle cards without redesigning the module**

Keep the current header, grid, typography, and card visual style. Render actions from record capabilities:

```vue
<button v-if="record.canGenerate" @click="generateRecord(record)">生成报告</button>
<router-link v-if="record.reportId" :to="reportRoute(record)">预览</router-link>
<button v-if="record.canDownload" @click="downloadRecord(record)">下载</button>
<button v-if="record.canOpenQa" @click="openQa(record)">去问答</button>
```

`openQa(record)` must route to `{ name: 'AscQa', query: { projectId: record.projectId, reportId: record.reportId } }`.

- [ ] **Step 6: Run report-center tests**

Run: `node --test tests/reportCenterController.test.js tests/reportProjectLifecycleModel.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js`

Expected: all tests pass.

- [ ] **Step 7: Commit the report center**

```powershell
git add -- src/features/reports/reportCenterController.js src/features/reports/reportCenterModel.js src/views/ReportCenterView.vue tests/reportCenterController.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js
git commit -m "feat: manage reports from the report center"
```

### Task 5: Shared preview, download, and QA actions on report detail

**Files:**
- Create: `src/features/reports/ReportActions.vue`
- Create: `tests/reportActions.test.js`
- Modify: `src/components/ReportReader.vue`
- Modify: `src/views/ReportView.vue`
- Modify: `tests/reportReaderView.test.js`
- Modify: `tests/reportNavigation.test.js`

**Interfaces:**
- `ReportReader` emits `report-state` with `{ report, status }` after each controller publication.
- `ReportActions` props: `{ reportId, projectId, projectName, status }`.
- `ReportActions` emits `download` and `open-qa`.

- [ ] **Step 1: Write failing action-availability tests**

```js
test('completed reports expose download and qualified QA actions', async () => {
  const html = await renderSfc('/src/features/reports/ReportActions.vue', {
    reportId: 'r1', projectId: 'p1', projectName: '哈哈哈', status: 'completed'
  })
  assert.match(html, /下载/)
  assert.match(html, /去问答/)
})
```

Generating reports expose progress/preview only; failed reports expose neither download nor QA. Missing project association keeps download but hides QA.

- [ ] **Step 2: Run action tests and record RED**

Run: `node --test tests/reportActions.test.js tests/reportReaderView.test.js`

Expected: failure because `ReportActions.vue` does not exist and `ReportReader` emits no state.

- [ ] **Step 3: Implement shared actions and route wiring**

`ReportView` resolves `projectId` through the existing logical-project/read-only fallback chain, handles download through `saveReportDownload`, and routes QA with both IDs. It must not call report generation.

- [ ] **Step 4: Run report detail regressions**

Run: `node --test tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js tests/workflowPageContinuity.test.js`

Expected: all tests pass; cached report instances still ignore unrelated report routes.

- [ ] **Step 5: Commit report actions**

```powershell
git add -- src/features/reports/ReportActions.vue src/components/ReportReader.vue src/views/ReportView.vue tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js
git commit -m "feat: add report preview and actions"
```

### Task 6: End graph evolution at the report-center handoff

**Files:**
- Modify: `src/components/Step3Simulation.vue`
- Modify: `src/views/SimulationRunView.vue`
- Modify: `tests/singleReportFlow.test.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/reportNavigation.test.js`

**Interfaces:**
- Graph evolution produces navigation only: `{ name: 'Reports', query: { projectId, simulationId } }`.
- `Step3Simulation` no longer imports or calls `checkReportForSimulation`, `generateReport`, or `createSingleReportFlow`.

- [ ] **Step 1: Write failing handoff contracts**

```js
assert.match(step3Source, /前往报告生成/)
assert.match(step3Source, /name:\s*['"]Reports['"]/)
assert.doesNotMatch(step3Source, /generateReport|checkReportForSimulation|createSingleReportFlow/)
assert.doesNotMatch(step3Source, /生成ASC洞察报告|进入问答环节/)
```

Require the handoff only when simulation status is completed; running/stopped/failed simulations cannot navigate as “演化完成”.

- [ ] **Step 2: Run workflow tests and record RED**

Run: `node --test tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js`

Expected: source-contract failures because report generation still lives inside `Step3Simulation.vue`.

- [ ] **Step 3: Replace generation with explicit report-center navigation**

Keep simulation and graph-evolution data unchanged. Replace the old report-generation button/handler with one button that routes to the report center and passes the current project/simulation IDs. Remove report-flow state and its automatic mount-time inspection from this component.

- [ ] **Step 4: Run graph/report workflow regressions**

Run: `node --test tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js tests/workflowPageContinuity.test.js tests/graphWorkspaceLifecycle.test.js`

Expected: all tests pass; switching pages still does not restart simulation.

- [ ] **Step 5: Commit the workflow handoff**

```powershell
git add -- src/components/Step3Simulation.vue src/views/SimulationRunView.vue tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js
git commit -m "refactor: hand evolved graphs to report center"
```

### Task 7: Report-center verification checkpoint

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-report-center-migration.md` with exact results only.

**Interfaces:**
- Produces a working report module while the legacy interaction route remains available as a temporary fallback.

- [ ] **Step 1: Run report-focused tests**

Run: `node --test tests/reportApi.test.js tests/reportProjectLifecycleModel.test.js tests/reportDownload.test.js tests/reportCenterController.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/reportReaderModel.test.js tests/reportReaderController.test.js tests/reportReaderView.test.js tests/reportActions.test.js tests/singleReportFlow.test.js tests/workflowPageContinuity.test.js`

Expected: zero failures.

- [ ] **Step 2: Run the full frontend suite**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 4: Perform a controlled real-browser smoke test**

Use the existing port-3000 frontend and port-5002 backend. With a real evolved project, verify report-center eligibility, existing-report reuse, generating/completed display, preview, and download. Do not click “生成报告” during read-only verification; test its POST only with an explicitly selected disposable project or a controlled browser route intercept.

Network audit must prove: no automatic `/api/report/generate`; no graph build/simulation create; opening and returning use GET/status requests only; one deliberate generation click produces at most one POST.

- [ ] **Step 5: Check repository boundaries**

Run: `git diff --check 192e1c6..HEAD`, `git diff --name-only 192e1c6..HEAD`, and `git status --short`.

Expected: no backend paths, no whitespace errors, and unrelated `tmp/` remains untracked and unstaged.

- [ ] **Step 6: Record evidence and commit the checkpoint**

Append exact test counts, build output, browser URLs, report/project IDs, request counts, and any backend contract gaps to this plan. Stage only the plan and commit:

```powershell
git add -- docs/superpowers/plans/2026-08-12-report-center-migration.md
git commit -m "docs: verify report center migration"
```

#### Task 7 verification results (2026-08-12)

- Report-focused command: `node --test tests/reportApi.test.js tests/reportProjectLifecycleModel.test.js tests/reportDownload.test.js tests/reportCenterController.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/reportReaderModel.test.js tests/reportReaderController.test.js tests/reportReaderView.test.js tests/reportActions.test.js tests/singleReportFlow.test.js tests/workflowPageContinuity.test.js` — exit 0; 90 tests, 90 passed, 0 failed.
- Full frontend command: `node --test tests/*.test.js` — exit 0; 382 tests, 382 passed, 0 failed.
- Production build: `npm run build` — exit 0; Vite 7.2.7 transformed 763 modules. The only warning was the pre-existing mixed dynamic/static `d3` import warning.
- Reviewer-minor TDD closeout: before the implementation, `node --test tests/ascLabExperience.test.js` reported 58 tests, 57 passed and 1 failed because stopped simulations still displayed `Running` with the default progress; after the implementation it reported 58 tests, 58 passed. Stopped now displays `Stopped` at 50%, never completed/100%.
- Port ownership: existing `http://127.0.0.1:3000` was PID 11728 running Vite from `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`, not this worktree. It was left untouched. The current worktree was verified on temporary `http://127.0.0.1:4175` against the existing `http://127.0.0.1:5002` backend (PID 14132), using Chrome 151.0.7922.76 with a separate headless profile.
- Real backend inventory before the browser smoke: `GET /api/report/list` returned 7 reports, all `completed`; `GET /api/graph/project/list` returned 8 projects. No generating report existed in the current backend data.
- Report-center browser result: 6 rendered lifecycle cards: 5 completed report cards and 1 unmatched/unknown project record; 5 Preview links, 5 Download buttons, and 3 project-qualified QA buttons. The real completed fixture was project `proj_3a65ef421cc6`, simulation `sim_1df0b4f7267d`, graph `nexus_b1826c08d4ab49bc`, report `report_1a6c38f80e39`.
- Existing-report reuse: browser-issued `GET /api/report/check/sim_1df0b4f7267d` returned `has_report: true`, `report_status: completed`, and `report_id: report_1a6c38f80e39`; no generation request followed.
- Preview: `http://127.0.0.1:4175/report/report_1a6c38f80e39` rendered the completed document, Download, and qualified QA action. Returning to `/reports` used only GET/status/read requests.
- Download: one deliberate completed-report Download click issued exactly one `GET /api/report/report_1a6c38f80e39/download` and no write request.
- Network audit: 15 backend API requests, all 15 GET and all 15 HTTP 200; write attempts 0; automatic `/api/report/generate` 0; graph build/ontology generation 0; simulation create/start 0. Report count after the smoke remained 7, all completed.
- Controlled generation-click result: the real backend snapshot exposed no eligible Generate button and no disposable project was authorized, so no generation click was performed. Generation attempts and POSTs were 0. The one-click/one-POST behavior remains covered by the controller regression; no backend state was invented to force a browser POST.
- Generating-display gap: the backend had no generating report, so that visual state could not be proven against live data. It remains covered by `reportActions`, reader-controller, lifecycle-model, and report-center tests.
- Boundary commands: `git diff --check 192e1c6..HEAD` exited 0; `git diff --name-only 192e1c6..HEAD` contained frontend plans/reports, frontend source, and frontend tests only, with no backend path; worktree `tmp/` was absent. No file under `D:/WEB`, no port-5002 backend file, and no port-3001 reference-frontend file was modified.
