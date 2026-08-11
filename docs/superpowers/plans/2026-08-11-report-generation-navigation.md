# Report Generation Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a report-generation destination that owns report routes, preserves the active report across sidebar navigation, and keeps graph evolution limited to graph, environment, and simulation routes.

**Architecture:** Keep `ReportView`, `Step4Report`, the report APIs, and the single-report guard unchanged. Add an API-free `ReportCenterView` for the no-`report_id` state, then make route metadata and primary-navigation state remember graph and report destinations independently. Existing route-level `KeepAlive` continues to preserve an in-progress report while another page is visible.

**Tech Stack:** Vue 3, Vue Router 4, Vite 7, Node built-in test runner, existing SSR and memory-router test helpers.

## Global Constraints

- Modify frontend files only; do not edit or restart the backend.
- Do not fabricate a `report_id` or add an unconfirmed report-list contract.
- `/reports` must not issue a report-generation request.
- Preserve the existing one-report rule and non-idempotent POST retry protection.
- Do not migrate `Step5Interaction` into the QA page in this implementation.
- Keep the existing untracked `tmp/` directory out of every commit.

---

### Task 1: Define independent graph and report navigation state

**Files:**
- Modify: `tests/navigationCleanup.test.js`
- Modify: `src/features/navigation/appNavigation.js`

**Interfaces:**
- Consumes: `primaryNavigation` and `createPrimaryNavigationState()`.
- Produces: `{ label: '报告生成', path: '/reports', icon: 'report' }` and independent remembered `graphPath`/`reportPath` values.

- [ ] **Step 1: Write the failing navigation tests**

Require four primary destinations:

```js
assert.deepEqual(primaryNavigation.map(({ label, path }) => [label, path]), [
  ['问答首页', '/'],
  ['文献管理', '/documents'],
  ['图谱演化', '/process'],
  ['报告生成', '/reports']
])
```

Add a behavior test that proves graph and report routes cannot overwrite each other:

```js
const state = createPrimaryNavigationState()
const graph = primaryNavigation.find(item => item.path === '/process')
const reports = primaryNavigation.find(item => item.path === '/reports')

state.observe({ name: 'SimulationRun', fullPath: '/simulation/s1/start', params: {} })
state.observe({ name: 'Report', fullPath: '/report/r1?taskId=t1', params: { reportId: 'r1' } })

assert.equal(state.target(graph), '/simulation/s1/start')
assert.equal(state.target(reports), '/report/r1?taskId=t1')
```

Also assert that observing `{ name: 'Reports', fullPath: '/reports' }` resets only `reportPath`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/navigationCleanup.test.js`

Expected: failures because the fourth item and independent report destination do not exist.

- [ ] **Step 3: Implement the minimal navigation model**

Use these route sets and targets:

```js
const GRAPH_WORKFLOW_ROUTE_NAMES = new Set(['Simulation', 'SimulationRun'])
const REPORT_WORKFLOW_ROUTE_NAMES = new Set(['Report'])

export function createPrimaryNavigationState() {
  let graphPath = '/process'
  let reportPath = '/reports'
  return {
    observe(route = {}) {
      if (route.name === 'Process') {
        const projectId = String(route.params?.projectId || '').trim()
        graphPath = projectId
          ? String(route.fullPath || `/process/${encodeURIComponent(projectId)}`)
          : '/process'
        return
      }
      if (GRAPH_WORKFLOW_ROUTE_NAMES.has(route.name) && route.fullPath) {
        graphPath = String(route.fullPath)
        return
      }
      if (route.name === 'Reports') {
        reportPath = '/reports'
        return
      }
      if (REPORT_WORKFLOW_ROUTE_NAMES.has(route.name) && route.fullPath) {
        reportPath = String(route.fullPath)
      }
    },
    target(item = {}) {
      if (item.path === '/process') return graphPath
      if (item.path === '/reports') return reportPath
      return item.path
    }
  }
}
```

- [ ] **Step 4: Re-run and verify GREEN**

Run: `node --test tests/navigationCleanup.test.js`

Expected: all navigation tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/features/navigation/appNavigation.js tests/navigationCleanup.test.js
git commit -m "feat: separate report navigation state"
```

---

### Task 2: Add the report center and route ownership

**Files:**
- Create: `src/views/ReportCenterView.vue`
- Create: `tests/reportNavigation.test.js`
- Modify: `src/config/ascRoutes.js`
- Modify: `src/features/navigation/WorkflowRouteOutlet.js`
- Modify: `tests/workflowRouteCache.test.js`

**Interfaces:**
- Consumes: `ascRouteDefinitions`, `WORKFLOW_VIEW_NAMES`, and `workflowRouteViewKey()`.
- Produces: singleton route `{ name: 'Reports', path: '/reports' }` and named API-free `ReportCenterView`.

- [ ] **Step 1: Write failing route and empty-state tests**

Create `tests/reportNavigation.test.js`:

```js
test('assigns report detail to the report center', () => {
  const routes = new Map(ascRouteDefinitions.map(route => [route.name, route]))
  assert.equal(routes.get('Reports')?.path, '/reports')
  assert.equal(routes.get('Reports')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Report')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Simulation')?.meta?.navigationPath, '/process')
  assert.equal(routes.get('SimulationRun')?.meta?.navigationPath, '/process')
  assert.notEqual(routes.get('Interaction')?.meta?.navigationPath, '/process')
})

test('renders a passive report center', async () => {
  const html = await renderSfc('/src/views/ReportCenterView.vue')
  assert.match(html, /尚无报告/)
  assert.match(html, /请先完成图谱演化/)
})
```

Extend `workflowRouteCache.test.js` to require `ReportCenterView` in `WORKFLOW_VIEW_NAMES` and `workflowRouteViewKey({ name: 'Reports' }) === 'workflow:Reports'`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/reportNavigation.test.js tests/workflowRouteCache.test.js tests/navigationCleanup.test.js`

Expected: failures because the view, route, metadata, and cache key are missing.

- [ ] **Step 3: Create the API-free empty view**

Create `ReportCenterView.vue`:

```vue
<template>
  <main class="report-center-view">
    <section class="report-center-view__empty">
      <span>REPORT</span>
      <h1>尚无报告</h1>
      <p>请先完成图谱演化，再生成并查看对应的研究报告。</p>
      <router-link to="/process">前往图谱演化</router-link>
    </section>
  </main>
</template>

<script setup>
defineOptions({ name: 'ReportCenterView' })
</script>
```

Use existing ASC design tokens for scoped styles. Do not import `api/report.js`, `Step4Report`, or any request helper.

- [ ] **Step 4: Register the routes and cache key**

In `ascRoutes.js`, insert `Reports` before `Report`, assign both report routes `navigationPath: '/reports'`, and remove `/process` ownership from `Interaction` while leaving its URL/component unchanged.

In `WorkflowRouteOutlet.js`, add `ReportCenterView` to `WORKFLOW_VIEW_NAMES` and `Reports` to `SINGLETON_WORKFLOW_ROUTE_NAMES`.

- [ ] **Step 5: Re-run and verify GREEN**

Run: `node --test tests/reportNavigation.test.js tests/workflowRouteCache.test.js tests/navigationCleanup.test.js`

Expected: all focused route, view, and cache tests pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/views/ReportCenterView.vue src/config/ascRoutes.js src/features/navigation/WorkflowRouteOutlet.js tests/reportNavigation.test.js tests/workflowRouteCache.test.js
git commit -m "feat: add report generation center"
```

---

### Task 3: Verify rendered sidebar routing and report persistence

**Files:**
- Modify: `tests/navigationCleanup.test.js`
- Modify: `tests/workflowRouteCache.test.js`
- Modify only if a failing test proves it necessary: `src/components/navigation/AscSidebar.vue`
- Modify only if a failing test proves it necessary: `src/layouts/AscShell.vue`

**Interfaces:**
- Consumes: report-aware navigation state, report route metadata, and route-level KeepAlive.
- Produces: exact report-route restoration and no graph project panel on report routes.

- [ ] **Step 1: Add a real rendered-sidebar test**

```js
const fixture = await mountSfcWithMemoryRouter(
  '/src/components/navigation/AscSidebar.vue',
  '/report/report-1?taskId=task-1'
)
await fixture.router.push('/documents')
const link = findRenderedLinkByText(fixture.root, '报告生成')
await clickRenderedLink(link)
assert.equal(fixture.router.currentRoute.value.fullPath, '/report/report-1?taskId=task-1')
```

Extend the existing cache integration to navigate `Report -> Documents -> Report` and assert the same report instance is not recreated. Assert the report route has `navigationPath: '/reports'`, so the existing shell condition does not render `GraphProjectWorkspacePanel`.

- [ ] **Step 2: Run and record RED or existing GREEN**

Run: `node --test tests/navigationCleanup.test.js tests/workflowRouteCache.test.js tests/reportNavigation.test.js`

Expected: the rendered behavior passes if Tasks 1-2 fully cover the integration. If it fails, record the concrete mismatch before editing production code.

- [ ] **Step 3: Apply only a proven minimal correction**

The expected shell behavior already follows from:

```js
const isGraphWorkflowRoute = computed(() => route.meta.navigationPath === '/process')
```

Do not move report polling into the shell. If a test fails, correct only the route-meta comparison or sidebar target binding that caused the failure.

- [ ] **Step 4: Run the related suite**

Run: `node --test tests/navigationCleanup.test.js tests/workflowRouteCache.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js`

Expected: zero failures.

- [ ] **Step 5: Commit Task 3 if it creates a diff**

```powershell
git add -- tests/navigationCleanup.test.js tests/workflowRouteCache.test.js src/components/navigation/AscSidebar.vue src/layouts/AscShell.vue
git commit -m "test: verify persistent report navigation"
```

Skip this commit when no additional diff is needed.

---

### Task 4: Full verification and safe handoff

**Files:**
- No planned production changes.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: fresh test, build, browser, and scope evidence.

- [ ] **Step 1: Run focused workflow tests**

Run: `node --test tests/reportNavigation.test.js tests/navigationCleanup.test.js tests/workflowRouteCache.test.js tests/singleReportFlow.test.js tests/graphWorkflowSession.test.js`

Expected: zero failures.

- [ ] **Step 2: Run all tests**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 3: Build production assets**

Run: `npm run build`

Expected: Vite exits 0.

- [ ] **Step 4: Check scope and whitespace**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; `tmp/` stays untracked and unstaged.

- [ ] **Step 5: Perform a read-only browser smoke test**

Verify on port 3000:

1. `/reports` shows the empty state.
2. A known `/report/:reportId` highlights “报告生成” and has no graph project panel.
3. `Report -> Documents -> 报告生成` returns to the exact report URL.
4. Visiting `/reports` and switching navigation issues no report-generation POST.

- [ ] **Step 6: Commit only a necessary final test correction**

```powershell
git add -- tests/reportNavigation.test.js tests/navigationCleanup.test.js tests/workflowRouteCache.test.js
git commit -m "test: cover report module navigation"
```

Skip this step when the worktree has no final diff.
