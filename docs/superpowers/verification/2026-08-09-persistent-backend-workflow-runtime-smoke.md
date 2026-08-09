# Persistent backend workflow runtime verification

Date: 2026-08-09 (Asia/Shanghai)

## Outcome

The frontend regression suite, production build, real port-3000 proxy, persistent graph-task UI, responsive controls, reconnect flow, and retained advanced routes passed. Verification exposed a real report-status regression: the frontend had fallen back to a GET/report-ID contract even though the running 5002 backend accepts task-status polling as `POST /api/report/generate/status` with `task_id`. The focused TDD corrections are `d2683bb` (`fix: restore report task status polling`), `4edd6a0` (`fix: serialize report status polling`), and Fix Round 1 commit `f3c3e9e` (`fix: restart replaced report status tasks`).

## Regression and build evidence

- Baseline command: `node --test tests/*.test.js`
  - Before correction: 159 tests; 158 passed; 1 failed; 0 skipped/cancelled/todo.
  - Failure: `carries the backend report task id into the report status polling page`.
- RED: `node --test tests/reportApi.test.js`
  - 1 test; 0 passed; 1 failed with the expected `false !== true` result because the API wrapper did not send the request.
- Targeted GREEN: `node --test tests/reportApi.test.js tests/ascLabExperience.test.js tests/requestContracts.test.js`
  - 63 tests; 63 passed; 0 failed/skipped/cancelled/todo.
- Polling-race RED: `node --test tests/reportStatusPoller.test.js`
  - 2 tests; 0 passed; 2 failed as intended: three overlapping requests instead of one, and a stopped poller handled a late completed response.
- Polling-race GREEN: `node --test tests/reportStatusPoller.test.js tests/reportApi.test.js tests/ascLabExperience.test.js tests/requestContracts.test.js`
  - 65 tests; 65 passed; 0 failed/skipped/cancelled/todo.
- Final post-runtime-commit GREEN: `node --test tests/*.test.js`
  - 163 tests; 163 passed; 0 failed/skipped/cancelled/todo.
- Build: `npm run build`
  - Post-runtime-commit Vite 7.2.7 build; 732 modules transformed; exit 0; built in 3.81 seconds.
- Diff check: `git diff --check`
  - Exit 0 with no whitespace errors.
- Advanced API contract focus: `node --test tests/requestContracts.test.js`
  - 6 tests; 6 passed; 0 failed/skipped/cancelled/todo.

## Fix Round 1

- Task-only replacement RED: the source-behavior contract failed because `reportTaskId` could change after completion without resetting `isComplete`, so the status poll closure returned `null` instead of issuing a request for the replacement task.
- Unresolved restart RED: the behavioral poller test observed two underlying calls after `start`, unresolved request, `stop`, and immediate `start`; `stop` had discarded the in-flight identity before the request actually settled.
- GREEN implementation: the combined report/task watcher resets completion/status and starts polling the current `props.reportTaskId` on task-only replacement without clearing report logs or generated sections. Its report-change branch returns before the task-only branch, so simultaneous report/task replacement starts once.
- GREEN poller behavior: an unresolved request retains its single-flight identity across stop/restart. The stale generation cannot invoke result/error handlers; after settlement, exactly one request begins for the current generation.
- Focused GREEN: `node --test tests/reportStatusPoller.test.js tests/ascLabExperience.test.js tests/reportApi.test.js tests/requestContracts.test.js` passed 66/66. A final source/poller focus after strengthening the content-preservation assertion passed 59/59.
- Post-runtime-commit gate for `f3c3e9e`: full tests 163/163; build 732 modules in 3.81 seconds; `git diff --check` exit 0; source/test and production-bundle forbidden scans 0/0; real port-3000 proxy HTTP 200, `success: true`, array payload, 5 rows.

## Report baseline diagnosis

`Step3Simulation.vue` preserves both backend `report_id` and `task_id` and routes the latter as `?taskId=`. `ReportView.vue` still derives that query value and passes it to `Step4Report`. The broken state was downstream: `Step4Report` no longer polled task status, and `getReportStatus` used a GET with `report_id`.

Read-only live probing through port 3000 returned HTTP 405 for GET `/api/report/generate/status` with either a report or task query parameter. Read-only inspection of the backend route showed `POST /api/report/generate/status`, reading JSON `task_id`/`simulation_id`; the retained frontend request-contract builder already modeled that exact POST. The correction restores task-status polling without replacing report-ID agent/console log polling. The status controller is idempotent and single-flight; generation guards suppress late status results after stop, report/task replacement, or unmount. Its interval and the existing agent/console intervals are cleared on completion, failure, and unmount.

## Listener and real proxy evidence

- Port 3000 was already owned by this workspace's Vite process; its command line resolved to this repository's `node_modules/vite/bin/vite.js --host`.
- Port 5002 was already owned by the user-run Python backend. Neither listener was stopped, restarted, or replaced.
- `GET http://localhost:3000/` returned HTTP 200 and served the Vite app shell.
- Real required proxy request: `GET http://localhost:3000/api/graph/project/list?limit=5` with `X-NEXUS-USER: local-asc-analyst` returned HTTP 200, `success: true`, array data, and 5 rows.
- The wider browser read used the same origin/header with `limit=50`: HTTP 200, array data, 28 rows. The UI rendered 5 monitor names that were all matched back to the real response. No raw project IDs are recorded; the checked route/selector project has SHA-256 prefix `cf2575272731`.
- The sampled real backend had no `ontology_generating` or `graph_building` project, so no expensive task was started for verification.

## Browser assertions

Automation used headless installed Chrome against the existing `http://localhost:3000`; the ignored harness and temporary `playwright-core` installation live under the plan-scoped `.superpowers` directory and are not committed.

### Intercepted report replacement race

The Fix Round 1 report-route smoke was fully intercepted and sent no POST to real 5002. With task A's status POST held unresolved, a task-only route-query replacement produced no overlapping request. Releasing A with a stale `completed` result then produced exactly one status POST for task B; the stale completion was ignored and the UI remained `Generating`. Exact focused totals: 1 unresolved request before release, 1 replacement request after settlement, and 2 intercepted report-status POSTs overall.

### Real backend, no interception

- QA loaded and the global graph-task trigger was visible.
- Opening the trigger rendered real backend project names.
- A QA-ready completed row's `查看进度` action navigated to the matching `/process/:projectId`.
- Returning to QA and selecting `去问答` produced a matching `?projectId=` and matching project-selector value.
- `新建问答` precedes `示例问题`; no default `历史问题` label appeared.
- At 1440x1000 and 390x844, the task trigger, task popover/actions, and QA project selector had rendered, in-viewport bounding boxes.

### Intercepted active-state UI only

The running backend had no active task. A deterministic UI-only snapshot therefore intercepted only two project-list GETs and exactly one graph task-status GET. The synthetic project and task identifiers were equal across `/documents` and SPA navigation to `/`; their SHA-256 prefixes were `7f316f3f1359` and `e89015a70645`. The same active project name rendered on both routes. This is intercepted UI state, not evidence of real graph execution.

### Reconnect to real 5002

The harness aborted only project-list GETs (2 requests) until the open monitor displayed `连接已断开，上次状态…`. It then removed the abort behavior and used `重新连接`; the notice became hidden, real project rows rendered, and a real port-3000 proxy project-list response returned HTTP 200. The backend process remained running throughout.

## Request safety and forbidden endpoint checks

- Main browser request audit: 334 requests observed across real, intercepted-active, and reconnect scenarios; 0 POST requests, 0 graph-build POSTs, 0 CoD/query POSTs, and 0 `/api/graph/tasks` requests. The separate Fix Round 1 report smoke intercepted its 2 report-status POSTs before the proxy; neither reached real 5002.
- Source and current production bundle scan for the exact `/api/graph/tasks` string: 0 source/test hits and 0 `dist` hits.
- Navigation, reload, reconnect, and monitoring created no graph, report, simulation, or query task.

## Advanced workflow regression

`ascRoutes` retains Simulation, SimulationRun, Report, and Interaction. The full suite and the 6/6 request-contract focus cover simulation/report contracts, including task-ID report status POST shape, report sections/download, and simulation interview endpoints. Real graph-project list payloads exposed no existing simulation/report identifiers, so no advanced-task GET was fabricated and no simulation/report task was created.

## Scope and limitations

- No backend process restart and no frontend restart were performed.
- No graph build, ontology generation, CoD query, answer-quality run, simulation, or report generation was started.
- `D:\WEB` backend and the separate port-3001 frontend were read-only; no files or services there were changed.
- Only the frontend repository contains task changes: focused report polling/test correction plus this verification document. Ignored browser assets do not appear in Git status.
