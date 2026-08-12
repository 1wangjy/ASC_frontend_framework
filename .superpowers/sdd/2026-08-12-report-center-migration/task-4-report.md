# Task 4 Report: Report-center lifecycle UI and controller wiring

## Scope

- Added a race-safe report-center controller with injected list, ownership-check, generation, download, navigation, project, browser, and change side effects.
- Integrated lifecycle project/report records into the retained `ReportCenterView` shell and card presentation.
- Added separate Generate, Preview, Download, and QA actions; the full card is no longer a router link.
- Kept the global graph monitor read-only from this module: the view reads `monitor.state.items`; neither the controller nor view starts or stops it.

## TDD evidence

### Controller RED

Exact command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result: exit 1 with `ERR_MODULE_NOT_FOUND` for `src/features/reports/reportCenterController.js`, proving the behavior suite ran before the controller existed.

### Controller GREEN

Exact command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result after the initial implementation: 7 tests, 7 passed, 0 failed.

During diff self-review, one additional race/error-path behavior was identified: a successful generation POST must still refresh the list once if navigation fails.

Additional RED command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result: 8 tests, 7 passed, 1 failed; `a completed POST still refreshes once when report navigation fails` reported `0 !== 1` list calls.

Additional GREEN command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result: 8 tests, 8 passed, 0 failed.

### View contracts RED

Exact command:

```powershell
node --test tests/reportCenterModel.test.js tests/reportNavigation.test.js
```

Observed result: exit 1. `reportCenterModel.test.js` failed because `buildReportCenterRecordItems` was not exported; `reportNavigation.test.js` failed because `ReportCenterView` did not contain `createReportCenterController` or the independent action wiring.

### View contracts GREEN

Exact command:

```powershell
node --test tests/reportCenterModel.test.js tests/reportNavigation.test.js
```

Observed result: 10 tests, 10 passed, 0 failed.

## Implementation notes

- `refresh()` uses a monotonically increasing request ID so an older response cannot replace newer reports or records.
- `generate(record)` shares one in-flight promise per project/simulation. Each new user action creates a fresh `createSingleReportFlow`, so every generation attempt performs a fresh ownership check before any POST.
- The controller records whether the POST occurred and refreshes the list exactly once afterward, including when navigation rejects.
- `stop()` advances a lifecycle version and refresh sequence. Late list/check/generation/download work cannot publish, mutate public state, or navigate after stop.
- Downloads use `saveReportDownload`; only that helper receives `browser`, and busy state is keyed by report ID.
- `openQa(record)` routes to `AscQa` with both `projectId` and `reportId` query values.

## Verification

Task regression command:

```powershell
node --test tests/reportCenterController.test.js tests/reportProjectLifecycleModel.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js
```

Final result: 47 tests, 47 passed, 0 failed.

Build command:

```powershell
npm run build
```

Final result: exit 0; 761 modules transformed and production assets emitted. Vite printed only the pre-existing mixed dynamic/static `d3` import warning noted below.

Diff checks:

```powershell
git diff --check
git diff --name-only
```

Final result: `git diff --check` exited 0. Business changes are limited to the six files named by the brief; this required report is additionally force-added because `.superpowers` is ignored by repository policy.

## Self-review and concerns

- Checked generation mutations: stale list response, missing fresh check, double POST, duplicate post-generation refresh, navigation failure after POST, and late updates after stop all have direct behavior coverage.
- Checked view contracts: independent action controls, no full-card router link, no `force_regenerate: true`, no monitor lifecycle calls, and both QA scope IDs.
- Existing header, grid sizing, typography, card borders, radius, shadows, and responsive spacing are retained; only action/footer and lifecycle status additions were made.
- Expected build warning: Vite reports the pre-existing mixed dynamic/static import of `d3`; this task does not touch that code.
- Independent read-only review: APPROVED with no blocking findings; the reviewer also ran the specified suite at 47/47.
- No known blocking concern at report draft time.

## Commit

Commit subject: `feat: manage reports from the report center`

This report is included in that same content-addressed commit; its final SHA is recorded in the task handoff.

## Fix Round 1

Fix base: `0021185dd526f3fa43af389dabeafa529a933264`.

### Review findings addressed

- Added `syncProjects()` so graph-monitor project changes recompute lifecycle records from current projects plus the controller's cached reports without another report-list request. `ReportCenterView` deep-watches `monitor.state.items` and calls this method; it still never starts or stops the global monitor.
- Added a post-response `shouldSave` guard to `saveReportDownload`. The controller passes its lifecycle guard, so a download resolved after `stop()` performs no object-URL, anchor, click, or revoke side effect.
- Serialized report downloads behind one active controller promise. A second report download is rejected before its network call, while every download button is disabled whenever `downloadingReportId` is non-empty.
- `refresh()` now clears stale `actionError` when the new refresh begins.

### RED evidence

Exact command:

```powershell
node --test tests/reportCenterController.test.js tests/reportDownload.test.js tests/reportNavigation.test.js
```

Observed result before production changes: 28 tests total; 22 passed, 5 failed, and 1 was cancelled. The failures proved the missing `syncProjects` API, retained action error, late browser side effects after stop, ignored helper guard, and absent view watch/global disable contracts. The concurrent-download test was cancelled because the old per-report map incorrectly started a second request and left it pending.

### GREEN evidence

Exact focused command:

```powershell
node --test tests/reportCenterController.test.js tests/reportDownload.test.js tests/reportNavigation.test.js
```

Observed result: 28 tests, 28 passed, 0 failed, 0 cancelled.

Exact full Task 4 plus download command:

```powershell
node --test tests/reportCenterController.test.js tests/reportProjectLifecycleModel.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js tests/reportDownload.test.js
```

Observed result: 62 tests, 62 passed, 0 failed.

Build:

```powershell
npm run build
```

Observed result: exit 0 with 761 modules transformed. The same pre-existing mixed dynamic/static `d3` import warning remains.

### Fix-round self-review and concerns

- `shouldSave` defaults to true, preserving all existing callers. It runs only after validating the response as a non-empty known-realm Blob, and before reading browser download APIs or creating an object URL; existing error and revoke tests remain green.
- `syncProjects()` only derives and publishes records. It does not list reports or mutate monitor lifecycle.
- The chosen public-state-compatible download policy is rejection, not queueing or cross-record promise sharing. This prevents a second network call and keeps `downloadingReportId` unambiguous.
- After `stop()`, the controller intentionally suppresses all public state mutation, so its frozen busy ID is not cleared. The view is unmounted at the same lifecycle point, while the download guard prevents browser side effects.
- No known blocking concern before independent review.

Fix-round commit subject: `fix: synchronize report center lifecycle actions`.

## Fix Round 2

Fix base: `e148cc7259cb768cb8f83c89364695f78faf855d`.

### Finding and root cause

When report generation reached its POST, the controller marked `requested = true`. Both a POST rejection and a later `openReport`/navigation rejection were caught and published as `actionError`, but the shared `finally` then called public `refresh()`. Fix Round 1 made public refresh clear stale action errors, so the internal post-generation refresh erased the newly published generation failure before `generate()` settled.

### RED evidence

Exact command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result before the production fix: 13 tests total; 11 passed and 2 failed. The POST-failure and navigation-failure tests both expected their final error message but observed an empty `actionError`. Both also exercised the real controller and required one list refresh.

### Minimal fix and GREEN evidence

`refresh({ clearActionError = true } = {})` keeps the public/default refresh behavior from Fix Round 1. The generation `finally` is the sole caller passing `{ clearActionError: false }`, preserving the current action failure while still refreshing once after any attempted POST.

Focused command:

```powershell
node --test tests/reportCenterController.test.js
```

Observed result: 13 tests, 13 passed, 0 failed.

Full Task 4 plus download command:

```powershell
node --test tests/reportCenterController.test.js tests/reportProjectLifecycleModel.test.js tests/reportCenterModel.test.js tests/reportNavigation.test.js tests/singleReportFlow.test.js tests/reportDownload.test.js
```

Observed result: 63 tests, 63 passed, 0 failed.

Build and diff:

```powershell
npm run build
git diff --check
git diff --name-only e148cc7259cb768cb8f83c89364695f78faf855d
```

Observed result: build exit 0 with 761 modules transformed and only the pre-existing `d3` warning; diff check exit 0; business changes are limited to `reportCenterController.js` and its behavior test.

### Self-review and concerns

- Public/user refresh still clears action errors by default, covered by the existing successful-refresh behavior test.
- POST failure and navigation failure both retain their final action error and both trigger exactly one list refresh.
- If that internal list refresh also fails, the controller retains the generation `actionError` and separately sets list `error`; both are real failures and this round intentionally does not add UI precedence policy.
- No other behavior or file is changed in this round.
- Independent read-only review: APPROVED with no Critical, Important, or Minor findings; the reviewer confirmed public/internal refresh semantics and the one-refresh boundary.

Fix-round commit subject: `fix: preserve report generation errors`.
