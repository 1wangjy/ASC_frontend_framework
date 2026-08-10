# All Workflow Page Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every workflow page and its active frontend request/polling state across sidebar navigation without issuing duplicate start or stop requests.

**Architecture:** Extend the existing controlled `KeepAlive` outlet to all task-bearing routes. Use stable route keys for singleton pages and task-scoped keys for simulation/report pages, and prevent cached inactive pages from interpreting another route's parameters as their own.

**Tech Stack:** Vue 3, Vue Router 4, Node test runner, Vite.

## Global Constraints

- Modify frontend code only; do not modify the 5002 backend or `D:\WEB` reference tree.
- Stage transitions remain manual.
- Sidebar navigation must issue zero start, stop, delete, build, report, or QA POST requests.
- Existing explicit stop/back/delete controls retain their behavior.
- Do not redesign answer rendering in this change.

---

### Task 1: Expand the controlled workflow route cache

**Files:**
- Modify: `src/features/navigation/WorkflowRouteOutlet.js`
- Modify: task-bearing route views only when an explicit component name is missing
- Test: `tests/workflowRouteCache.test.js`

**Interfaces:**
- Produces: `WORKFLOW_VIEW_NAMES` containing every cached workflow view.
- Produces: `workflowRouteViewKey(route)` returning stable singleton keys for QA, Documents, and Process, and ID-scoped keys for Simulation, SimulationRun, Report, and Interaction.

- [ ] **Step 1: Write failing tests**

Assert the complete view-name set and these key contracts:

```js
assert.equal(workflowRouteViewKey({ name: 'Documents' }), 'workflow:Documents')
assert.equal(workflowRouteViewKey({ name: 'SimulationRun', params: { simulationId: 'sim_1' } }), 'workflow:SimulationRun:sim_1')
assert.equal(workflowRouteViewKey({ name: 'Report', params: { reportId: 'report_1' } }), 'workflow:Report:report_1')
```

Mount controlled dummy routes, mutate each page's local state, navigate away, return, and assert the same component instance and state remain.

- [ ] **Step 2: Run RED**

Run: `node --test tests/workflowRouteCache.test.js`

Expected: failures because the additional workflow views are not cached and task-scoped keys are absent.

- [ ] **Step 3: Implement the minimal cache expansion**

Add the explicit view names and route-key mapping. Keep route keys independent from unrelated query parameters so polling configuration does not create duplicate cached instances.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/workflowRouteCache.test.js`

Expected: all tests pass.

### Task 2: Prevent inactive cached routes from resetting active tasks

**Files:**
- Modify: `src/views/SimulationView.vue`
- Modify: `src/views/SimulationRunView.vue` only if required for stable naming or task identity
- Modify: `src/views/ReportView.vue`
- Modify: `src/views/InteractionView.vue`
- Modify: `src/views/DocumentLibraryView.vue` only for stable naming
- Test: `tests/workflowRouteCache.test.js`
- Test: a focused source/lifecycle contract test if mounting a large legacy view is impractical

**Interfaces:**
- Cached views ignore global route parameter changes while `route.name` does not match their own route.
- Deactivation preserves component state and timers; unmount cleanup remains available for cache eviction/application teardown.

- [ ] **Step 1: Write failing lifecycle tests**

Cover Simulation → Documents → SimulationRun/other route transitions and assert the cached Simulation context never receives an empty ID. Cover SimulationRun and Report round trips and assert mount/start counters remain one.

- [ ] **Step 2: Run RED**

Run the focused cache/lifecycle test and record the expected reset or remount failure.

- [ ] **Step 3: Implement route ownership guards**

Give each cached view a stable `defineOptions({ name: ... })`. Guard watchers that consume `route.params` so they only act while their own route is active. Do not add `onDeactivated` task cancellation and do not move explicit stop behavior from user controls.

- [ ] **Step 4: Run GREEN and related regression tests**

Run:

```powershell
node --test tests/workflowRouteCache.test.js tests/simulationPromptGate.test.js tests/reportStatusPoller.test.js tests/graphScopedQaFlow.test.js
```

Expected: all focused tests pass.

### Task 3: Verify sidebar continuity and request safety

**Files:**
- Modify tests only if verification exposes a real missing contract.

**Interfaces:**
- No new runtime interface; this is the release gate.

- [ ] **Step 1: Run the full suite**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 2: Run production build and diff checks**

Run:

```powershell
npm run build
git diff --check
```

Expected: both commands succeed.

- [ ] **Step 3: Run a controlled browser smoke test**

Navigate among QA, Documents, Process, Simulation, SimulationRun, and Report using intercepted deterministic GET data. Assert each page's mutated local state survives a round trip and audit that navigation issued zero start/stop/delete/build/report/QA POST requests.

- [ ] **Step 4: Review and commit**

Review the final diff for backend changes, duplicate timers, unstable route keys, or unbounded cache behavior, then commit the focused frontend change.
