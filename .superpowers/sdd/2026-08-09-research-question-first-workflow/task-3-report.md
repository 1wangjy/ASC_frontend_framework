# Task 3 report: persistent QA-home entry and research-workflow verification

## Scope and implementation

- Added the persistent, unscoped `问答首页` action next to the global graph-task trigger. It emits `open-qa-home` without a payload and is outside the expandable task popover.
- Routed the shell event with `router.push({ name: 'AscQa' })`.
- Kept the monitor refresh, task popover accessibility, project progress, and project-scoped QA actions unchanged.
- Updated the pre-existing library source-contract test to assert the actual `startResearchBuildFromLibrary` boundary. The store call and PDF-library IDs remain verified in `researchQuestionWorkflow` instead of requiring a view-level implementation detail.

## RED -> GREEN evidence

RED command:

```powershell
node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js
```

Result before production edits: 8 passed, 3 failed exactly because the rendered component lacked `问答首页`, lacked `open-qa-home`, and `AscShell` lacked the named `AscQa` route handler. The research-question chain tests already passed.

GREEN command (after the minimal component and shell changes):

```powershell
node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js
```

Result: 11 passed, 0 failed. The integration test exercises dialog normalization, the real pending-upload store, and both graph request fields; it also verifies the source chain through library, MainView, Step 1, and Step 2. Its final assertion recursively scans frontend source for the prohibited `setPendingUpload([], '', ...)` form.

The initial full-suite run exposed one unrelated stale assertion in `ascLabExperience.test.js`: it expected `DocumentLibraryView` to call `setPendingUpload` directly, although the current workflow deliberately uses `startResearchBuildFromLibrary`. The corrected test retained the behavior contract and passed in isolation (56/56) before the final full-suite run.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js` | 11 passed, 0 failed |
| `node --test tests/ascLabExperience.test.js` | 56 passed, 0 failed |
| `node --test tests/*.test.js` | 206 passed, 0 failed |
| `npm run build` | Vite build succeeded; 738 modules transformed |
| `git diff --check` | Succeeded with no whitespace errors |

## Browser smoke and POST audit

Used a temporary headless Edge profile against the existing frontend on port 3000. Chrome DevTools Protocol `Fetch.enable` intercepted every request at the request stage; every request whose method was `POST` would have been terminated through `Fetch.failRequest` before network delivery.

- Real, safe GET: `GET /api/graph/project/list` through port 3000 returned HTTP 200 with `success: true` and an array (31 projects at verification time).
- On `/documents`, `问答首页` was visible and reachable; clicking it routed to `/`.
- At 1440x1000 and 390x844, the rendered QA-home element had a non-zero in-viewport bounding rectangle.
- Loading empty-question project `proj_7b99b6ce3bc9` rendered `当前项目缺少研究问题`.
- Browser POST audit: 0 POST requests observed; 0 `/api/simulation/create`; 0 `/api/simulation/prepare`; therefore 0 POST requests reached port 5002. The interception policy remained enabled throughout the smoke test.

The temporary Edge profile was removed after the smoke test. No backend code, API, port 3001, graph construction, simulation, CoD query, or report endpoint was changed or invoked.

## Commit and self-review

- Feature commit: `1c5baac` — `feat: expose QA entry across research workflow`
- Self-review: the action is unscoped, outside the popover, still reachable in the mobile layout, and routes only to named `AscQa`; the prior scoped `open-qa` path still calls `navigateGraphProjectToQa`.

## Concerns

No blocking concerns. The live smoke intentionally did not generate a POST request, so the zero-request result is backed by request-stage interception plus the observed zero count; this preserves the explicit no-backend-work constraint.

## Fix Round 1: Escape focus preservation

Commit: `fa57469` — `fix: preserve QA-home escape focus`

- RED: after replacing the former `@keydown.esc.stop="closePopover"` assertion with the closed-state-safe handler contract, `node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js` produced 10 passed and 1 expected failure. The failure showed the old unconditional `.stop` listener was still present.
- GREEN: the indicator now uses `@keydown.esc="handleEscape"`. `handleEscape(event)` returns without stopping propagation or changing focus when the popover is closed; when expanded, it stops propagation and calls the existing `closePopover`, which restores focus to the task trigger.
- Verification: targeted tests 11/11; full suite 206/206; `npm run build` succeeded with 738 transformed modules; `git diff --check` succeeded.
- No browser or backend request was made in this fix round, so no POST could reach the backend.

The existing source/SSR test harness cannot dispatch and observe a Vue DOM event without adding a new browser or component-mounting dependency. The updated structural contract directly guards both branches, while the existing test continues to cover the expanded-path focus restoration through `closePopover` and `nextTick`.

## Final Fix Wave: graph prompt guard and ontology retry ownership

### RED -> GREEN

- RED: `node --test tests/graphBuildPromptGate.test.js tests/graphApiAttemptCount.test.js tests/researchQuestionWorkflow.test.js tests/simulationPromptGate.test.js` initially produced 47 passed and 1 expected failure. The failure showed that Step 1 and `MainView.startBuildGraph` had not yet wired the required empty-question graph-build guard.
- GREEN: the same focused command produced 48 passed and 0 failed. Step 1 now disables Base `开始构建` for blank normalized questions and renders `当前项目缺少研究问题，不能开始图谱构建。` with a nearby `问答首页` route. `MainView.startBuildGraph` has the same guard before error clearing or state mutation and presents the error in an alert banner; its model-level request test proves zero `buildGraph` calls for blank input.

### Retry and HTTP evidence

- `generateOntology` now performs one `service(...)` call only. Base and Professional invoke the exported workflow-layer `runOntologyGenerationWithRetry`, which retries only `Network Error`/`ERR_NETWORK`/`ECONNABORTED`/timeout failures, caps total attempts at 3, and never retries resolved `success:false` responses or non-network failures.
- Both entry points use the same MainView 3000 ms retry wait. `lastError` was removed because it was write-only.
- `tests/graphApiAttemptCount.test.js` used fresh in-process `127.0.0.1` HTTP servers (not port 5002). Its server-side counters recorded exactly one POST for HTTP 401 and exactly one POST for an HTTP 200 `{ success: false }` response.

### Verification

| Command | Result |
| --- | --- |
| Focused four-file test command above | 48 passed, 0 failed |
| `node --test tests/*.test.js` | 217 passed, 0 failed |
| `npm run build` | Vite build succeeded; 738 modules transformed |
| `git diff --check` | Succeeded with no whitespace errors |

No browser smoke, backend edit, or real backend POST was performed in this wave. Simulation transport retry remains unchanged legacy behavior.
