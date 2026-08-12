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
