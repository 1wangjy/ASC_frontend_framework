# Task 6 Report: Graph-evolution handoff to the report center

## Scope

- Ended graph evolution at Step 3 with a single explicit “前往报告生成” handoff.
- Limited the handoff to a backend simulation whose `runner_status` is exactly `completed`.
- Routed the completed graph project to `Reports` with the real `projectId` and `simulationId` query values.
- Removed report inspection, report generation, report-flow state, direct report navigation, and mount-time report checks from `Step3Simulation`.
- Removed the obsolete `next-step` bridge from `SimulationRunView` while preserving its simulation and graph data loading/refresh behavior.

## TDD evidence

### RED

Exact command:

```powershell
node --test tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js
```

Observed result before production changes: exit 1; 84 tests total, 81 passed and 3 failed. The failures proved that `stopped` was still treated as completed, `Step3Simulation` still owned the single-report generation flow, and `SimulationRunView` retained the old next-step bridge.

### GREEN

Exact command:

```powershell
node --test tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js
```

Observed result after the minimal implementation: 84 tests, 84 passed, 0 failed.

## Implementation notes

- `canOpenReportCenter` requires the local completed phase, backend `runner_status === 'completed'`, a real project ID from `projectData`, and a non-empty simulation ID.
- The handoff calls `router.push({ name: 'Reports', query: { projectId, simulationId } })`; it performs no report read, write, generation, or QA navigation.
- A successful manual stop now remains non-completed and publishes `stopped`. A `stopped`, `failed`, or running simulation cannot enable or execute the handoff.
- Platform-channel completion remains visible as a log signal but no longer promotes the graph evolution to completed before the backend runner reports completion.
- Mounting Step 3 now starts the existing simulation flow directly; it no longer checks report ownership first.
- Existing simulation request parameters, polling intervals, action accumulation, graph-growth snapshots, project loading, graph loading, and refresh behavior were not changed.

## Verification

Specified regression command:

```powershell
node --test tests/singleReportFlow.test.js tests/ascLabExperience.test.js tests/reportNavigation.test.js tests/workflowPageContinuity.test.js tests/graphWorkspaceLifecycle.test.js
```

Result: 88 tests, 88 passed, 0 failed. Cached workflow pages still do not restart simulation, and graph-workspace lifecycle behavior remains intact.

Build command:

```powershell
npm run build
```

Result: exit 0; 763 modules transformed and production assets emitted. Vite printed only the pre-existing mixed dynamic/static `d3` import warning.

Diff checks:

```powershell
git diff --check
git diff --name-only
```

Result: `git diff --check` exited 0. Business changes are limited to the five files named by the Task 6 brief; this report is force-added because `.superpowers` is ignored by repository policy. No backend, port 5002, port 3001, or temporary files were touched.

## Self-review and concerns

- Mutation checks cover the wrong route, missing query ID, removed report API/model dependencies, and accidental acceptance of `stopped` as completed.
- The defensive guard in the click handler repeats the button availability rule, so a programmatic click cannot bypass the completed state.
- `SimulationRunView` still receives the child status event and updates graph presentation; only the obsolete report-step bridge was removed.
- Expected build warning: Vite reports the pre-existing mixed dynamic/static import of `d3`; this task does not touch that code.
- Independent read-only review: APPROVED with no Critical, Important, or Minor findings. The reviewer reran the specified suite at 88/88 and confirmed the status boundary, scoped route, old-flow removal, and unchanged simulation/graph data flow.
- No known blocking concern.

## Commit

Commit subject: `refactor: hand evolved graphs to report center`

This report is included in the same Task 6 commit; its final SHA is recorded in the task handoff.
