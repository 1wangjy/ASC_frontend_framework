# Task 5 Report: Shared report-detail actions

## Scope

- Added a compact shared `ReportActions` component without changing the existing report-detail document layout.
- Made `ReportReader` publish `{ report, status }` after every controller publication.
- Connected completed report details to the shared Blob download helper and scoped QA navigation.
- Reused the existing logical graph-project match plus read-only report-to-simulation-to-project fallback to resolve the QA `projectId`.
- Kept generation capability out of the report detail page.

## TDD evidence

### RED

Exact command:

```powershell
node --test tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js
```

Observed result before production changes: exit 1; 14 tests total, 8 passed and 6 failed. Four failures reported the missing `ReportActions.vue`; the remaining failures proved that `ReportReader` did not emit `report-state` and `ReportView` did not wire the shared actions.

### GREEN

Exact focused command:

```powershell
node --test tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js
```

Observed result after the minimal implementation and correction of SSR-whitespace-sensitive text assertions: 14 tests, 14 passed, 0 failed.

Exact Task 5 regression command:

```powershell
node --test tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js tests/workflowPageContinuity.test.js
```

Final result: 16 tests, 16 passed, 0 failed. The cached report-instance regression confirms that retained detail components still ignore unrelated report routes.

## Implementation notes

- `ReportActions` exposes download only for completed reports with a report ID, exposes QA only when the completed report also resolves a project ID, shows a generating-progress message, and exposes neither action after failure.
- `ReportReader` emits directly inside its controller `onChange`, immediately after accepting the published snapshot, so initial, loading, partial, completion, failure, and retry publications share one contract.
- `ReportView` derives `projectId` from the logical graph-project match first and the existing read-only fallback project second. QA navigation uses `AscQa` with both `projectId` and `reportId` query parameters.
- Detail downloads call `saveReportDownload` with the backend `downloadReport` Blob API and the resolved project name. A local in-flight promise prevents duplicate detail-page download requests, and failures remain visible on the page.
- `ReportView` imports the report API as a namespace so the existing cached-view test can continue replacing only the read capability it exercises.

## Verification

Relevant report regression command:

```powershell
node --test tests/reportActions.test.js tests/reportReaderView.test.js tests/reportNavigation.test.js tests/workflowPageContinuity.test.js tests/reportDownload.test.js tests/reportReaderController.test.js tests/reportCenterController.test.js tests/singleReportModel.test.js tests/reportProjectLifecycleModel.test.js
```

Result: 55 tests, 55 passed, 0 failed.

Build command:

```powershell
npm run build
```

Result: exit 0; 763 modules transformed and production assets emitted. Vite printed the pre-existing mixed dynamic/static `d3` import warning.

Diff checks:

```powershell
git diff --check
git diff --name-only
```

Result: `git diff --check` exited 0. Business changes are limited to the six files named by the Task 5 brief; this report is force-added because `.superpowers` is ignored by repository policy.

## Self-review and concerns

- Mutation checks cover each action-availability branch: completed with project, completed without project, generating, and failed.
- The view contract checks the real boundary values for Blob download and scoped QA navigation, and explicitly rejects report-generation symbols.
- Existing `ReportReader` width, cover, document, typography, loading, progress, failure, and responsive presentation are unchanged; the new action strip uses the same 920px width, borders, radius, and palette.
- The detail page intentionally keeps its existing duplicate read for project association; this task reuses that established fallback chain instead of coupling association lookup to reader rendering state.
- Expected build warning: Vite reports the pre-existing mixed dynamic/static import of `d3`; this task does not touch that code.
- Independent read-only review: APPROVED with no Critical, Important, or Minor findings. The reviewer reran the specified suite at 16/16 and confirmed publication, availability, fallback, scoped navigation, no-generation, layout, and retained-route contracts.
- No known blocking concern.

## Commit

Commit subject: `feat: add report preview and actions`

This report is included in the same Task 5 commit; its final SHA is recorded in the task handoff.
