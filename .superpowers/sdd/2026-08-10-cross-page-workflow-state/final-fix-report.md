# Cross-page workflow state final fix report

## Outcome

Final implementation status: **DONE**.

Both load-bearing final-review findings were reproduced against the pre-fix production wiring, fixed in the frontend only, and covered by production-shaped lifecycle tests. No backend file, endpoint, request payload, or `D:\WEB` content changed.

Implementation commit:

- `580cffb6e06c90475e42ea9fb0fa3eefa13d5598` — `fix: preserve cached workflow route state`

The report is stored in a following documentation-only commit so it can cite the immutable implementation commit above.

## Finding 1: Graph workspace child unmounted while inactive

### RED

The new test mounts the real `WorkflowRouteOutlet -> KeepAlive -> GraphProjectWorkspaceView` production chain. Only the heavy `MainView` import is replaced by a lifecycle probe with mounted/unmounted/start counters and mutable local state. The assertions therefore depend on the real `GraphProjectWorkspaceView` `v-if` and `:key` wiring.

Command:

```powershell
node --test tests/graphWorkspaceLifecycle.test.js
```

Pre-fix result: expected failure, exit code 1.

- Tests: 2
- Passed: 0
- Failed: 2
- TAP duration: `4060.6369 ms`
- `p1 -> Documents`: expected zero `MainView` unmounts, actual unmounts were `['p1']`.
- `/process/new -> Documents`: expected zero `MainView` unmounts, actual unmounts were `['new']`.

This demonstrated that the cached outer workspace survived, but its keyed `MainView` child did not.

### Production fix

`src/views/GraphProjectWorkspaceView.vue` now owns a local `selectedProjectId` ref.

- It records `route.params.projectId` only while `route.name === 'Process'`.
- Unrelated routes do not clear or replace the retained project.
- An active, explicit `/process` writes an empty ID and removes the child.
- `/process/new` remains a retained keyed child.
- An active `p1 -> p2` change updates the ID, so Vue replaces the keyed `MainView` instead of leaking p1 state.

No per-project `KeepAlive` cache was added; there is still only one cached graph workspace instance.

### Covered tests and GREEN

Tests:

- `cached GraphProjectWorkspaceView keeps its keyed MainView through unrelated routes and replaces it for p1 to p2`
- `GraphProjectWorkspaceView clears only on active explicit process and retains process new while away`

First GREEN command:

```powershell
node --test tests/graphWorkspaceLifecycle.test.js
```

Result: PASS, exit code 0; 2/2 passed, 0 failed, TAP duration `3582.3298 ms`.

Related Graph/sidebar/cache command:

```powershell
node --test tests/graphWorkspaceLifecycle.test.js tests/workflowRouteCache.test.js tests/navigationCleanup.test.js
```

Result: PASS, exit code 0; 11/11 passed, 0 failed, TAP duration `7945.5845 ms`. This also retained the existing sidebar scoped-route behavior, explicit `/process` stale cleanup, and `/process/new` behavior.

## Finding 2: Cached QA consumed unrelated-route query changes

### Initial RED

The new QA tests mount the real `WorkflowRouteOutlet -> KeepAlive -> AscQaView` chain and the real QA child components. Only the graph API boundary and task-monitor state are controlled; the route watchers, draft, answer state, project selection, and submission wiring are production code. The controlled API never opens a network connection or sends a real POST.

Command:

```powershell
node --test tests/qaRouteQueryLifecycle.test.js
```

Pre-fix result: expected failure, exit code 1.

- Tests: 3
- Passed: 0
- Failed: 3
- TAP duration: `5231.6286 ms`
- Conversation flow: after `QA -> Documents -> same QA URL`, project-list calls were 3 instead of 1; the same test also asserts one QA submission, retained draft, and retained result.
- Project flow: after the same-URL return, project-list calls were 3 instead of 1.
- New-chat flow: `draft after n1` became an empty string while away/returning.

These failures showed that the inactive cached instance consumed the unrelated Documents route's missing query values and consumed the same QA URL again on return.

### Production fix

`src/views/AscQaView.vue` now has one active-route query consumer.

- Query effects return immediately unless `route.name === 'AscQa'`.
- The last consumed `projectId`, `new`, and `conversation` tokens are tracked independently.
- Leaving QA does not mutate those tokens.
- Returning to the identical QA URL does not reset, reload projects, reload a conversation, or resubmit QA.
- A changed `projectId`, `new`, or `conversation` token is consumed once.
- Initial deep-link consumption waits for its project list so a conversation is not submitted before scope selection exists.
- A project ID snapshot is passed into the asynchronous project refresh, preventing a later unrelated global route from changing that refresh's scope.

The obsolete source-regex test that required the defective global `route.query.projectId` watcher was removed. Its behavior is now covered by the mounted production component test.

### Initial GREEN

Covered tests:

- `cached AscQaView consumes a conversation query once and preserves its draft and result on same-URL return`
- `cached AscQaView consumes each changed projectId query once without reloading on same-URL return`
- `cached AscQaView consumes each changed new query once without resetting on same-URL return`

Command:

```powershell
node --test tests/qaRouteQueryLifecycle.test.js
```

Result: PASS, exit code 0; 3/3 passed, 0 failed, TAP duration `4909.079 ms`.

### Reviewer race RED

Read-only review found one directly related concurrency gap: `routeProjectsLoad` initially tracked only route-started project loads. If monitor/manual refresh was already pending, a new conversation token could be marked consumed before the refresh completed; `sendQuestion()` then returned because `projectsLoading` was true, permanently losing that token.

A controlled deferred monitor refresh was added before changing production code.

Command:

```powershell
node --test --test-name-pattern "in-flight monitor project refresh" tests/qaRouteQueryLifecycle.test.js
```

RED result: expected failure, exit code 1.

- Tests: 1
- Passed: 0
- Failed: 1
- TAP duration: `2426.3929 ms`
- Exact failure: `conversation query was lost after the project refresh`.
- Before the deferred refresh was released, QA POST count correctly remained 0; after release, the pre-fix implementation still never sent it.

### Reviewer race production fix and GREEN

Every `loadProjects()` call now registers one shared `currentProjectsLoad` promise, regardless of whether the caller is route consumption, monitor refresh, manual retry, or invalid-scope recovery. `waitForCurrentProjectsLoad()` follows replacement promises until the latest current load settles. The conversation token is marked and submitted only after that stable point and after the active-route snapshot is revalidated.

GREEN command:

```powershell
node --test --test-name-pattern "in-flight monitor project refresh" tests/qaRouteQueryLifecycle.test.js
```

Result: PASS, exit code 0; 1/1 passed, 0 failed, TAP duration `2243.7893 ms`.

Final related focused command:

```powershell
node --test tests/qaRouteQueryLifecycle.test.js tests/graphWorkspaceLifecycle.test.js tests/graphScopedQaFlow.test.js tests/workflowRouteCache.test.js
```

Result: PASS, exit code 0; 17/17 passed, 0 failed, TAP duration `6919.7352 ms`.

The original reviewer re-read the shared-load fix and deferred regression and reported the Important finding resolved, with no remaining Critical or Important findings.

## Full automated verification

Command:

```powershell
node --test tests/*.test.js
```

Fresh final result after the concurrency fix: PASS, exit code 0.

- Tests: 250
- Passed: 250
- Failed: 0
- Cancelled: 0
- Skipped: 0
- Todo: 0
- TAP duration: `14381.4743 ms`

## Production build

Command:

```powershell
npm run build
```

Fresh final result: PASS, exit code 0.

- Vite: `v7.2.7`
- Modules transformed: 747
- Build time: `3.20s`

## Browser smoke and network audit

Command:

```powershell
node .superpowers/sdd/2026-08-10-cross-page-workflow-state/task-3-browser-smoke.mjs
```

Fresh final result: PASS, exit code 0, using the existing frontend service on port 3000 (PID 31716). The service was not stopped or restarted.

Observed state:

- QA draft before/after Documents: `CACHE-SMOKE-QUESTION` / `CACHE-SMOKE-QUESTION`.
- Selected project before/after Documents: `proj_79b87d446bc4` / `proj_79b87d446bc4`.
- Selected cards before/after: 1 / 1.
- Workflow before/after: `Step 2/5` — `环境搭建` / `Step 2/5` — `环境搭建`.
- Graph header QA buttons: 0.
- Completed project-card QA entries: 1.
- Route did not reset to `/process/new`.

Network audit:

- Total requests: 108
- GET: 108
- POST: 0
- QA POST: 0
- Ontology POST: 0
- Graph-build POST: 0
- Simulation-create POST: 0
- Delete POST: 0

No form was submitted and no destructive browser action was taken. An earlier temporary Vite PID 22556 used during verification was identified by its exact workspace command line and stopped; the pre-existing PID 31716 remained untouched.

## Repository checks and commit

Commands run before the implementation commit:

```powershell
git diff --check
git diff --cached --check
```

Both passed with exit code 0 and no whitespace errors.

Implementation commit:

```text
580cffb6e06c90475e42ea9fb0fa3eefa13d5598 fix: preserve cached workflow route state
```

The implementation commit contains exactly these frontend production/test files:

- `src/views/AscQaView.vue`
- `src/views/GraphProjectWorkspaceView.vue`
- `tests/graphScopedQaFlow.test.js`
- `tests/graphWorkspaceLifecycle.test.js`
- `tests/qaRouteQueryLifecycle.test.js`
- `tests/helpers/mountWorkflowRoutes.js`

The worktree was clean immediately after the implementation commit; this report is the only subsequent documentation artifact.

## Self-review

- Scope is limited to the two final-review findings and their production-shaped regression tests.
- Graph retention is local to the single cached workspace; no unbounded per-project component cache exists.
- Real `p1 -> p2` navigation replaces the keyed child, preventing local-state leakage.
- Explicit `/process`, retained `/process/new`, and the sidebar's existing scoped-route/stale-cleanup behavior remain covered.
- QA effects are gated by the named active route and deduplicated per query field, not by an unconnected helper.
- Shared current-load coordination covers route, monitor, manual, and recovery project refreshes without adding an endpoint or payload.
- Test doubles sit only at heavyweight/external boundaries; observable assertions cover real component state, lifecycle, routing, API-call counts, and rendered output.
- No backend or `D:\WEB` file changed, and browser verification issued no POST.
- Read-only review was completed twice: the reported concurrent-load Important was fixed by TDD, and the re-review found no remaining Critical or Important issues.

## Concerns

- The complete suite still emits the two pre-existing isolated `Step1GraphBuild` router-injection warnings; all 250 tests pass.
- The existing graph API attempt-count test reports two test-only POST requests to ephemeral `127.0.0.1` loopback servers. They do not target the running frontend/backend. The real browser audit recorded 0 POST.
- Browser refresh recovery remains intentionally outside scope.
- No new implementation concern remains after re-review.
