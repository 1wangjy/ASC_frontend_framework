# Task 4 Report: Stop Forced Completion Navigation and Add an Explicit QA Action

## Scope

- Added `navigateWhenReady`, defaulting to `true`, to the private graph completion helper.
- With `navigateWhenReady: false`, the helper still completes final project validation, graph loading, and `onReady`, then returns its validated success payload without requiring or calling `navigate`.
- Updated both automatic polling completion paths in `MainView.vue` to use no-navigation mode while retaining their existing safety callbacks and error reporting.
- Added an explicit `去图谱问答` header button. It appears only for a `graph_completed` project with non-empty normalized project and graph identifiers and invokes the existing QA navigation function.
- Added focused helper and MainView contract coverage.

## TDD Evidence

- RED: `node --test tests/graphQaNavigation.test.js` initially failed in the new no-navigation test because `navigate` was still called.
- GREEN: `node --test tests/graphQaNavigation.test.js` passed 12/12 after the minimal helper change.

## Verification

- `node --test tests/graphQaNavigation.test.js tests/ascLabExperience.test.js`: new completion-navigation and MainView contract tests passed. The single failure was the pre-existing report-status assertion in `ascLabExperience.test.js`.
- `npm run build`: passed (Vite production build).
- Full suite: 152 passed, 1 failed. The only failure was the known unchanged report-status assertion: `getReportStatus({ taskId: props.reportTaskId })`.
- `git diff --check`: clean.

## Self-Review

- Final backend `getProject`, identifier validation, missing-task completed-status gate, final `loadGraph`, `onReady`, and error paths remain intact.
- Existing callers without `navigateWhenReady` retain automatic navigation.
- No backend, 3001 frontend, report implementation, routes, or workflow pages were modified.
