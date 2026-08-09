# Graph-Scoped QA Runtime Smoke Verification

**Date:** 2026-08-09

## Scope and Isolation

- The existing user-owned listener on port 3000 was not stopped, changed, or used as the controlled UI server.
- A temporary Vite server for this worktree was started at `http://127.0.0.1:3100` with `--port 3100 --strictPort`. This port was used only for this verification; `vite.config.js` remains unchanged with its configured `3000` server port and `5002` API proxy target.
- Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe` was driven headlessly through a temporary, ignored `.superpowers/runtime-smoke-temp` Playwright Core installation.
- The temporary browser route intercepted only `POST /api/graphrag/cod-query`. It captured the outgoing request before returning a deterministic successful JSON response. This prevents LLM cost/long-running work and makes this a UI/payload smoke test, not an end-to-end answer-quality test.

## Real Backend Connectivity

Before interception, the browser loaded the real project list through the controlled frontend origin:

```text
GET http://127.0.0.1:3100/api/graph/project/list?limit=50
```

The response had `success: true`; the UI exposed at least two selectable projects with `graph_id` values. The prior direct controlled-origin check also returned `success=True`, an array, and 22 records. Thus the project-list call reached the existing 5002 backend through the frontend proxy.

## Browser Flow and Captured Requests

1. Loaded the QA page, then navigated with a real selectable project in `/?projectId=<project P1>`.
2. Confirmed the graph selector's selected value was P1.
3. Submitted the first question, then switched the selector to a second real selectable graph project P2.
4. Submitted the second question.
5. Confirmed the final browser path was `/`, with no navigation to a Step2 or simulation route.

The following is the captured payload evidence. Identifiers are represented by the first 12 hexadecimal characters of SHA-256 so the record establishes equality/difference without storing raw backend identifiers.

| Request | `project_id` fingerprint | `graph_id` fingerprint | `question` | `reasoning_mode` | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | `1eca3b7c77ab` | `907ea01d1771` | `Runtime smoke question one: confirm selected graph payload.` | `auto` | Matched the URL-selected P1 and its graph. |
| 2 | `b157f176d323` | `51044ea7210a` | `Runtime smoke question two: confirm graph switch payload.` | `auto` | Matched selected P2 and its graph. |

The browser assertions all passed:

- Real project-list response loaded.
- URL project was selected by default.
- Each `cod-query` payload contained the currently selected project's exact `project_id` and `graph_id`.
- The two payloads used different project and graph identifiers and different question values.
- The flow did not open Step2 or simulation.

## Reproduction Command

```powershell
node .superpowers\runtime-smoke-temp\graph-scoped-qa-smoke.mjs
```

The script is intentionally ignored and uses only temporary local verification assets. Its result recorded all six assertions as `true`; its intercepted response is explicitly labeled UI/payload-only.

## Protected Backend Boundary Evidence

The requested D:\WEB root is not a Git repository, so `git status` and `git rev-parse` cannot establish a commit comparison there. As equivalent read-only evidence, the backend source/config tree at:

```text
D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main\backend
```

was enumerated with source/config extensions, excluding `logs`, `uploads`, `cache`, `.pytest_cache`, `venv`, and `.venv`. This broader timestamp scan included two documentation-only Markdown files: of 124 files, zero had a `LastWriteTime` at or after the branch starting point `2026-08-08T22:48:55+08:00` (`7201da4`). The newest included source/config file was timestamped `2026-08-06 14:06:49 +08:00`. This supports that the implementation did not modify backend source/configuration; it deliberately makes no claim about runtime logs, uploads, caches, virtual environments, or data.

## Fix Round 2: Real CoD Query

Using the same temporary worktree Vite instance at port 3100, Chrome loaded the real project list, chose a project whose backend status was `graph_completed`, and selected it through the URL project parameter. It then issued one **unintercepted** browser `POST /api/graphrag/cod-query` through the 3100-to-5002 proxy. The temporary route used for the earlier UI-only smoke was not installed for this request.

The JSON request contained exactly these four keys:

```text
graph_id, project_id, question, reasoning_mode
```

The request did not contain `simulation_requirement`. To avoid persisting raw backend identifiers, the selected project and graph are represented by SHA-256 prefixes `1eca3b7c77ab` and `907ea01d1771`, respectively. The short question was `Brief runtime smoke: state the graph scope is accepted.`

The real backend request completed with HTTP 200 and `success: true`. Its adapted result had both a non-empty answer and a non-empty `qa_run_id`. The response summary did not contain `simulation_requirement`, and the browser remained at `/` rather than navigating to Step2 or simulation. No raw answer, raw identifiers, or backend response body is retained in this document.

## Fix Round 2: Independent Backend Mirror Comparison

Because the D:\WEB tree has no Git metadata, a Git pre/post snapshot remains unavailable. As a stronger but non-Git equivalent boundary check, the following two backend trees were independently enumerated and SHA-256 compared:

```text
D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main\backend
D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\backend
```

The comparison used the 122 source/config relative paths (excluding runtime, logs, uploads, caches, virtual environments, and documentation-only Markdown files):

- Both trees contained 122 paths.
- Their complete relative-path sets were identical: zero paths existed only in either tree.
- 118 files had equal SHA-256 values.
- The four differing files were `run.py`, `app/services/graph_builder.py`, `tests/test_graph_builder_edge_target.py`, and `tests/test_run.py`.
- Each differing D:\WEB file had a `LastWriteTime` on 2026-08-06, earlier than `2026-08-08T22:48:55+08:00` (`7201da4`).

Together with the worktree's committed diff (only frontend cleanup and verification documentation), this supports that this task did not delete or rename D:\WEB backend source/config paths. It is not represented as a Git pre/post snapshot and does not cover excluded runtime/data paths.

## Limits

- The two-request selector-switch smoke intentionally intercepted responses after capture. The separate Fix Round 2 request was not intercepted and verifies one real backend answer/`qa_run_id`; it is still a narrow runtime smoke, not broad answer-quality coverage.
- No raw backend identifiers, credentials, or response data are stored in this committed record.
