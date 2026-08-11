# Clean Report Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old five-step report workflow screen with a focused report reader that displays one backend-saved report under its graph project name and shows only compact progress while generation is active.

**Architecture:** Add pure report-reader normalization and safe Markdown rendering utilities, then add a single-flight report reader controller for loading and polling real report data. A focused `ReportReader` component renders the result, while `ReportView` owns only route/project association and `ReportCenterView` uses the same graph-based display title.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios, Node test runner, Vite 7.

## Global Constraints

- Modify frontend code only; do not modify or restart the backend on port 5002.
- Do not call `/api/report/generate`, delete reports, overwrite reports, or set `force_regenerate: true` from the report center or report reader.
- Use the real backend `report_id`, `graph_id`, `simulation_id`, saved Markdown, and saved sections.
- Display report names as `图谱项目名 · 研究报告`; keep the backend report title/subtitle as the research topic.
- Keep compact live progress for active reports and switch to a pure reading view after completion.
- Keep unrelated untracked `tmp/` content untouched and unstaged.

---

### Task 1: Report reader normalization and safe Markdown

**Files:**
- Create: `src/features/reports/reportReaderModel.js`
- Create: `src/features/reports/reportMarkdown.js`
- Create: `tests/reportReaderModel.test.js`
- Create: `tests/reportMarkdown.test.js`

**Interfaces:**
- Produces: `buildProjectReportTitle(projectName) -> string`.
- Produces: `normalizeReportStatus(status) -> 'completed' | 'generating' | 'failed' | 'unknown'`.
- Produces: `unwrapReportSections(response) -> { sections, totalSections, complete }`.
- Produces: `buildReportSections(report, sectionsResponse) -> ReportSection[]` sorted by `section_index` and titled from `report.outline.sections[index - 1].title`.
- Produces: `buildReportProgress(report, sections) -> { completed, total, percent }`.
- Produces: `renderReportMarkdown(markdown) -> string` with escaped raw HTML and controlled Markdown tags.

- [x] **Step 1: Write failing report model tests**

```js
test('names a report from its graph project', () => {
  assert.equal(buildProjectReportTitle('哈哈哈'), '哈哈哈 · 研究报告')
  assert.equal(buildProjectReportTitle(''), '未关联图谱 · 研究报告')
})

test('orders saved sections and restores titles from the outline', () => {
  const sections = buildReportSections({
    outline: { sections: [{ title: '摘要' }, { title: '机理' }] }
  }, {
    success: true,
    data: {
      total_sections: 2,
      is_complete: true,
      sections: [
        { section_index: 2, content: '第二章' },
        { section_index: 1, content: '第一章' }
      ]
    }
  })
  assert.deepEqual(sections.map(item => item.title), ['摘要', '机理'])
})
```

- [x] **Step 2: Write failing safe Markdown tests**

```js
test('renders report Markdown without executing raw backend HTML', () => {
  const html = renderReportMarkdown('# 标题\n\n**结论** <script>alert(1)</script>')
  assert.match(html, /<h1[^>]*>标题<\/h1>/)
  assert.match(html, /<strong>结论<\/strong>/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})
```

- [x] **Step 3: Run focused tests and record RED**

Run: `node --test tests/reportReaderModel.test.js tests/reportMarkdown.test.js`

Expected: failure because both report reader modules do not exist.

- [x] **Step 4: Implement the pure model and renderer**

```js
export function buildProjectReportTitle(projectName) {
  const name = String(projectName ?? '').trim() || '未关联图谱'
  return `${name} · 研究报告`
}

export function normalizeReportStatus(value) {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'completed') return 'completed'
  if (['generating', 'processing', 'running', 'pending'].includes(status)) return 'generating'
  if (['failed', 'error'].includes(status)) return 'failed'
  return 'unknown'
}
```

`renderReportMarkdown` must escape `& < > " '` before applying controlled heading, emphasis, list, quote, code, table, and newline transforms. It must never pass raw backend HTML through `v-html` unchanged.

- [x] **Step 5: Run focused tests and record GREEN**

Run: `node --test tests/reportReaderModel.test.js tests/reportMarkdown.test.js`

Expected: all focused tests pass.

- [x] **Step 6: Commit the model boundary**

```powershell
git add -- src/features/reports/reportReaderModel.js src/features/reports/reportMarkdown.js tests/reportReaderModel.test.js tests/reportMarkdown.test.js
git commit -m "feat: add report reader model"
```

### Task 2: Single-flight report reader controller

**Files:**
- Create: `src/features/reports/reportReaderController.js`
- Create: `tests/reportReaderController.test.js`

**Interfaces:**
- Consumes: injected `getReport(reportId)`, `getSections(reportId)`, `getAgentLog(reportId, fromLine)`, and optional `getStatus({ taskId })` functions.
- Produces: `createReportReaderController(dependencies)`.
- Produces controller methods: `open({ reportId, taskId })`, `refresh()`, `stop()`, and `snapshot()`.
- Publishes state: `{ reportId, taskId, loading, report, sectionsResponse, agentLogs, status, error }`.

- [x] **Step 1: Write lifecycle and stale-response tests**

```js
test('completed reports load once and do not start polling', async () => {
  const controller = createReportReaderController({
    getReport: async () => ({ success: true, data: { report_id: 'r1', status: 'completed' } }),
    getSections: async () => ({ success: true, data: { sections: [], total_sections: 0, is_complete: true } }),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => { throw new Error('must not poll') },
    schedule: () => { throw new Error('must not schedule') },
    cancel: () => {}
  })
  await controller.open({ reportId: 'r1', taskId: '' })
  assert.equal(controller.snapshot().status, 'completed')
})

test('a late old report response cannot replace the active report', async () => {
  let resolveOld
  const oldReport = new Promise(resolve => { resolveOld = resolve })
  const controller = createReportReaderController({
    getReport: reportId => reportId === 'r1'
      ? oldReport
      : Promise.resolve({ success: true, data: { report_id: 'r2', status: 'completed' } }),
    getSections: async () => ({ success: true, data: { sections: [], total_sections: 0, is_complete: true } }),
    getAgentLog: async () => ({ success: true, data: { logs: [], from_line: 0 } }),
    getStatus: async () => ({ success: true, data: { status: 'completed' } }),
    schedule: () => 1,
    cancel: () => {}
  })
  const first = controller.open({ reportId: 'r1', taskId: '' })
  await controller.open({ reportId: 'r2', taskId: '' })
  resolveOld({ success: true, data: { report_id: 'r1', status: 'completed' } })
  await first
  assert.equal(controller.snapshot().report.report_id, 'r2')
})
```

Add explicit tests that capture the scheduled callback and verify: an active report schedules exactly one timer; two concurrent `refresh()` calls share one request; a backend task status of `failed` cancels the timer and publishes the error; `stop()` prevents a deferred response from publishing; opening a different report cancels the previous timer and resets the section/log cursor.

- [x] **Step 2: Run controller tests and record RED**

Run: `node --test tests/reportReaderController.test.js`

Expected: failure because `reportReaderController.js` does not exist.

- [x] **Step 3: Implement generation-guarded polling**

```js
export function createReportReaderController({
  getReport,
  getSections,
  getAgentLog,
  getStatus,
  onChange = () => {},
  schedule = setInterval,
  cancel = clearInterval,
  intervalMs = 2000
}) {
  let generation = 0
  let timer = null
  let inFlight = null
  let state = initialState()

  async function refresh() {
    if (!state.reportId || inFlight) return inFlight
    const activeGeneration = generation
    const activeReportId = state.reportId
    const request = loadCurrent(activeReportId, state.taskId)
    inFlight = request
    try {
      const next = await request
      if (generation === activeGeneration && state.reportId === activeReportId) publish(next)
    } finally {
      if (inFlight === request) inFlight = null
    }
  }

  return { open, refresh, stop, snapshot }
}
```

The controller must stop scheduling when normalized status becomes `completed` or `failed`. A failed status lookup may update the visible error but must never start report generation.

- [x] **Step 4: Run controller tests and record GREEN**

Run: `node --test tests/reportReaderController.test.js tests/reportStatusPoller.test.js`

Expected: all controller and existing polling tests pass.

- [x] **Step 5: Commit the controller**

```powershell
git add -- src/features/reports/reportReaderController.js tests/reportReaderController.test.js
git commit -m "feat: load report reader state"
```

### Task 3: Focused report document component

**Files:**
- Create: `src/components/ReportReader.vue`
- Create: `tests/reportReaderView.test.js`

**Interfaces:**
- Props: `reportId: string`, `taskId?: string`, `projectName?: string`.
- Emits: none; the component owns only read and poll lifecycle.
- Consumes: Task 1 model/renderer, Task 2 controller, and existing read/status API wrappers.

- [x] **Step 1: Write failing rendered-shell and source-boundary tests**

```js
test('renders a focused report reader shell', async () => {
  const html = await renderSfc('/src/components/ReportReader.vue', {
    reportId: 'report-1',
    projectName: '哈哈哈'
  })
  assert.match(html, /哈哈哈 · 研究报告/)
  assert.match(html, /正在读取报告/)
})

test('reader uses only report read and status APIs', async () => {
  assert.doesNotMatch(source, /generateReport|force_regenerate|GraphPanel|WorkflowProgressBar/)
  assert.match(source, /getReport/)
  assert.match(source, /getReportSections/)
})
```

- [x] **Step 2: Run the component test and record RED**

Run: `node --test tests/reportReaderView.test.js`

Expected: failure because `ReportReader.vue` does not exist.

- [x] **Step 3: Implement the focused reader UI**

```vue
<article class="report-reader" :aria-busy="state.loading">
  <header class="report-reader__cover">
    <span>KG RESEARCH REPORT</span>
    <h1>{{ displayTitle }}</h1>
    <h2 v-if="state.report?.title">{{ state.report.title }}</h2>
    <p v-if="state.report?.subtitle">{{ state.report.subtitle }}</p>
  </header>
  <section v-if="state.status === 'generating'" class="report-reader__progress" role="status">
    <strong>报告生成中</strong>
    <span>{{ progress.completed }}/{{ progress.total }} 章</span>
    <progress :value="progress.percent" max="100"></progress>
  </section>
  <section v-for="section in sections" :key="section.index" class="report-reader__section">
    <h2>{{ section.title }}</h2>
    <div class="report-reader__markdown" v-html="renderReportMarkdown(section.content)"></div>
  </section>
</article>
```

If backend `markdown_content` is non-empty and status is completed, render it as the canonical complete document instead of duplicating saved sections.

- [x] **Step 4: Run component/model/controller tests and record GREEN**

Run: `node --test tests/reportReaderView.test.js tests/reportReaderModel.test.js tests/reportMarkdown.test.js tests/reportReaderController.test.js`

Expected: all focused tests pass.

- [x] **Step 5: Commit the reader component**

```powershell
git add -- src/components/ReportReader.vue tests/reportReaderView.test.js
git commit -m "feat: show focused report document"
```

### Task 4: Replace the old report workflow route and align report names

**Files:**
- Modify: `src/views/ReportView.vue`
- Modify: `src/views/ReportCenterView.vue`
- Modify: `src/features/reports/reportCenterModel.js`
- Delete: `src/components/Step4Report.vue`
- Modify: `tests/reportNavigation.test.js`
- Modify: `tests/reportCenterModel.test.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/workflowPageContinuity.test.js`

**Interfaces:**
- `ReportView` supplies `reportId`, `taskId`, and resolved logical graph project name to `ReportReader`.
- `ReportCenterItem` gains `displayTitle` from `buildProjectReportTitle(projectName)`.
- Existing report route name/path remain `Report` and `/report/:reportId`.

- [x] **Step 1: Write failing route and naming contracts**

```js
assert.match(reportView, /<ReportReader/)
assert.doesNotMatch(reportView, /GraphPanel|WorkflowProgressBar|Step4Report|view-switcher|Step 4\/5/)
assert.equal(items[0].displayTitle, '哈哈哈 · 研究报告')
assert.match(reportCenterView, /item\.displayTitle/)
```

Update the old report task-ID test to require `ReportView -> ReportReader -> reportReaderController -> getReportStatus({ taskId })`. Update cached-route module overrides to replace `ReportReader.vue`, not deleted `Step4Report.vue`.

- [x] **Step 2: Run route regressions and record RED**

Run: `node --test tests/reportNavigation.test.js tests/reportCenterModel.test.js tests/ascLabExperience.test.js tests/workflowPageContinuity.test.js`

Expected: failures because the route still imports the old graph/workflow components and cards still use the backend title as the main heading.

- [x] **Step 3: Replace `ReportView` with the focused route shell**

```vue
<main class="report-view">
  <header class="report-view__toolbar">
    <button type="button" @click="router.push('/reports')">返回报告列表</button>
  </header>
  <ReportReader
    :report-id="reportId"
    :task-id="taskId"
    :project-name="projectName"
  />
</main>
```

Resolve the project name by `graph_id`, then `simulation_id`, then the existing `report -> simulation -> project` read-only chain. Do not load graph visualization data.

- [x] **Step 4: Align report-center card titles and remove the old component**

Use `item.displayTitle` as the card `<h2>` and show `item.title` below it as the report topic. Remove `Step4Report.vue` only after all imports/tests have moved to `ReportReader.vue`.

- [x] **Step 5: Run report and route regressions**

Run: `node --test tests/reportNavigation.test.js tests/reportCenterModel.test.js tests/reportReaderView.test.js tests/ascLabExperience.test.js tests/workflowPageContinuity.test.js tests/singleReportFlow.test.js`

Expected: all focused route tests pass; the single-report flow still proves `force_regenerate: false`.

- [x] **Step 6: Commit the route replacement**

```powershell
git add -- src/views/ReportView.vue src/views/ReportCenterView.vue src/features/reports/reportCenterModel.js src/components/ReportReader.vue tests/reportNavigation.test.js tests/reportCenterModel.test.js tests/ascLabExperience.test.js tests/workflowPageContinuity.test.js
git add -u -- src/components/Step4Report.vue
git commit -m "refactor: isolate report reading from workflow"
```

### Task 5: Verification and real read-only smoke test

**Files:**
- Modify: `docs/superpowers/plans/2026-08-11-clean-report-reader.md` with exact verification results only.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified report reader and repository boundary evidence.

- [x] **Step 1: Run all report-focused tests**

Run: `node --test tests/reportApi.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/reportReaderModel.test.js tests/reportMarkdown.test.js tests/reportReaderController.test.js tests/reportReaderView.test.js tests/singleReportFlow.test.js tests/workflowPageContinuity.test.js`

Expected: zero failures.

- [x] **Step 2: Run the full frontend suite**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [x] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite exits with code 0.

- [x] **Step 4: Perform a real GET-only smoke check**

Read one real report through the existing port-3000 proxy and verify that its graph project display name, backend title, saved Markdown, and completed/generating state render. Network audit must show no `/api/report/generate`, report delete, graph build, or simulation create request.

- [x] **Step 5: Check repository boundaries**

Run: `git diff --check 4a1971b..HEAD`, `git status --short`, and `git diff --name-only 4a1971b..HEAD`.

Expected: no whitespace errors, no backend files, and unrelated `tmp/` remains untracked and unstaged.

- [x] **Step 6: Record and commit verification evidence**

Append exact test/build/smoke results to this plan, stage only this plan file, and commit with `docs: record clean report reader verification`.

## Verification Record — 2026-08-11

- Report-focused suite: `38/38` passed, `0` failed.
- Full frontend suite: `324/324` passed, `0` failed in `18.585s`.
- Production build: Vite `7.2.7`, `758` modules transformed, completed in `2.79s` with exit code `0`.
- Real port-3000 proxy smoke: GET-only reads loaded `report_be1f77825163`, status `completed`, `2370` saved Markdown characters, and `3/3` saved sections from port 5002.
- Real association chain: `report_be1f77825163 -> sim_4861fc4cec88 -> proj_3a65ef421cc6`; the project name resolved as `第三个测试 · Professional Research`.
- Browser smoke: the real `/report/report_be1f77825163` route rendered `第三个测试 · 研究报告`, the backend research topic, report ID, completed state, and saved Markdown. The old `Step 4/5`, graph visualization, analysis dashboard, and workflow console were absent.
- Write-boundary audit: the report reader, route, and center contain `0` references to report generation, report deletion, graph build, simulation creation, or `force_regenerate` capabilities.
- Repository boundary: `git diff --check 4a1971b..HEAD` returned no errors; changes are frontend source, tests, and docs only. Unrelated `tmp/` remains untracked and unstaged.
