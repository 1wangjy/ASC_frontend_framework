# Report Center List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/reports` into a read-only center that lists backend-saved reports, associates them with graph projects, and opens the existing report detail route.

**Architecture:** Add one GET-only API wrapper and one pure report-center model. `ReportCenterView` owns request/UI state, consumes the already-running global graph monitor for project labels, and delegates report normalization, sorting, deduplication, and project association to the pure model.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios, Node test runner, Vite 7.

## Global Constraints

- Do not modify backend code.
- Do not issue report generation, deletion, or overwrite requests from `/reports`.
- Keep `force_regenerate: false` and the existing single-report flow unchanged.
- Use only real backend `report_id` values.
- Keep unrelated untracked `tmp/` content untouched and unstaged.

---

### Task 1: Report list API and normalization model

**Files:**
- Modify: `src/api/report.js`
- Create: `src/features/reports/reportCenterModel.js`
- Modify: `tests/reportApi.test.js`
- Create: `tests/reportCenterModel.test.js`

**Interfaces:**
- Produces: `listReports(params = {}) -> Promise<ApiResponse>` using `GET /api/report/list`.
- Produces: `unwrapReports(response) -> Report[]`.
- Produces: `buildReportCenterItems(reports, projects) -> ReportCenterItem[]`.
- Produces: `formatReportDate(value) -> string`.

- [ ] **Step 1: Write failing API and model tests**

```js
test('lists saved reports through the read-only backend endpoint', async () => {
  await listReports({ limit: 50 })
  assert.equal(requestConfig.method, 'get')
  assert.equal(requestConfig.url, '/api/report/list')
  assert.deepEqual(requestConfig.params, { limit: 50 })
})

test('deduplicates reports by simulation, sorts newest first, and links projects', () => {
  const items = buildReportCenterItems(reports, projects)
  assert.deepEqual(items.map(item => item.reportId), ['report-new', 'report-other'])
  assert.equal(items[0].projectName, '哈哈哈')
})
```

- [ ] **Step 2: Run tests and record RED**

Run: `node --test tests/reportApi.test.js tests/reportCenterModel.test.js`

Expected: failure because `listReports` and `reportCenterModel.js` do not exist.

- [ ] **Step 3: Implement the GET wrapper and pure model**

```js
export const listReports = (params = {}) => {
  return service.get('/api/report/list', { params })
}
```

The model must reject records without `report_id`, normalize status copy, use `simulation_id` as the primary deduplication key, sort by `completed_at`/`created_at`, and associate by `graph_id` before `simulation_id`.

- [ ] **Step 4: Run focused tests and record GREEN**

Run: `node --test tests/reportApi.test.js tests/reportCenterModel.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the model boundary**

```powershell
git add -- src/api/report.js src/features/reports/reportCenterModel.js tests/reportApi.test.js tests/reportCenterModel.test.js
git commit -m "feat: add saved report list model"
```

### Task 2: Real report center page

**Files:**
- Modify: `src/views/ReportCenterView.vue`
- Modify: `tests/reportNavigation.test.js`

**Interfaces:**
- Consumes: `listReports({ limit: 50 })`.
- Consumes: `buildReportCenterItems(rawReports, monitor.state.items)`.
- Produces: report cards linking to `{ name: 'Report', params: { reportId } }`.

- [ ] **Step 1: Replace passive-page assertions with failing report-center contracts**

```js
assert.match(source, /listReports/)
assert.match(source, /buildReportCenterItems/)
assert.match(source, /name:\s*['"]Report['"]/)
assert.doesNotMatch(source, /generateReport|force_regenerate|\/api\/report\/generate/)
```

Add SSR assertions for the loading shell and stable page heading.

- [ ] **Step 2: Run the view tests and record RED**

Run: `node --test tests/reportNavigation.test.js`

Expected: failures because the view is still a passive empty state.

- [ ] **Step 3: Implement loading, success, empty, and error states**

```js
const reports = ref([])
const loading = ref(true)
const error = ref('')
const items = computed(() => buildReportCenterItems(reports.value, monitor.state.items))

async function loadReports() {
  loading.value = true
  error.value = ''
  try {
    reports.value = unwrapReports(await listReports({ limit: 50 }))
  } catch (requestError) {
    error.value = requestError?.message || '报告列表加载失败。'
  } finally {
    loading.value = false
  }
}
```

Render a header with refresh action, distinct loading/error/empty states, and responsive report cards. Cards show title, project name, status, dates, and link to the real detail route.

- [ ] **Step 4: Run report-center regression tests**

Run: `node --test tests/reportNavigation.test.js tests/reportApi.test.js tests/reportCenterModel.test.js tests/singleReportFlow.test.js`

Expected: all tests pass and generation tests still prove `force_regenerate: false`.

- [ ] **Step 5: Commit the page**

```powershell
git add -- src/views/ReportCenterView.vue tests/reportNavigation.test.js
git commit -m "feat: show saved reports in report center"
```

### Task 3: End-to-end verification

**Files:**
- Verify only; production changes are allowed only if a new test first reproduces a discovered defect.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified build and regression evidence.

- [ ] **Step 1: Run all report-focused tests**

Run: `node --test tests/reportApi.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js tests/workflowRouteCache.test.js`

Expected: all tests pass.

- [ ] **Step 2: Run the full frontend suite**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 4: Check the final diff and repository boundary**

```powershell
git diff --check 6a4cd12..HEAD
git status --short
git diff --name-only 6a4cd12..HEAD
```

Expected: no whitespace errors; only planned frontend/test/plan files are changed; `tmp/` remains untracked and unstaged; no backend file appears.

- [ ] **Step 5: Record final verification**

Append the exact focused/full/build results to `docs/superpowers/plans/2026-08-11-report-center-list.md`, then commit only that documentation update with `docs: record report center verification`.
