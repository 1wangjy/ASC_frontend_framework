# QA Capability Migration and Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing QA home accept only graph projects with completed reports, reuse the verified citation/domain-term/evidence behavior already present in the frontend, and retire the old deep-interaction page without changing the QA page's established layout.

**Architecture:** A pure eligibility model joins backend graph projects and completed reports. A request-safe context controller owns the qualified project list and last selection, while `AscQaView` keeps its current visual structure and opens a temporary selector from the existing project control. The current CoD QA adapter remains the only answer transport; report qualification is revalidated before a question is sent. The legacy interaction route is redirected only after all required behavior is covered by the QA home.

**Tech Stack:** Vue 3 Composition API, Vue Router 4, Axios, Node test runner, Vite 7.

## Global Constraints

- Complete the report-center migration plan before deleting any legacy interaction code.
- Modify frontend code only; do not modify or restart the backend on port 5002.
- Keep the current QA page's overall interface, spacing, composer, controls, history region, conversation layout, and evidence panel unchanged.
- Keep the existing model selector in place for future models. Do not add model choices that the backend does not support.
- Do not add the legacy LLM toggle; the current QA page has no such control.
- Do not claim that static example questions are saved history. A real history list still requires backend APIs.
- Do not add fake report, project, evidence, evaluation, model, or history data.
- Only a backend report normalized to `completed` qualifies a project for QA.
- A completed graph without a completed report must not appear in the QA project selector and must not be accepted at send time.
- Keep the previous valid project selected when possible. Never silently fall back to an unrelated project.
- Keep unrelated untracked `tmp/` content untouched and unstaged.

---

### Task 1: Completed-report QA eligibility model

**Files:**
- Create: `src/features/qa/qaProjectEligibilityModel.js`
- Create: `tests/qaProjectEligibilityModel.test.js`

**Interfaces:**
- Consumes: logical graph projects from `buildLogicalGraphProjects(monitor.state.items)` and raw reports from `listReports()`.
- Produces: `buildQualifiedQaProjects(projects, reports) -> QualifiedQaProject[]`.
- Produces: `resolveQualifiedQaSelection(records, request) -> QualifiedQaProject | null`.
- `QualifiedQaProject`: `{ projectId, graphId, simulationId, reportId, projectName, reportStatus, project }`.
- Selection request: `{ routeProjectId, routeReportId, storedProjectId }`.

- [ ] **Step 1: Write failing qualification tests**

```js
test('includes only graph projects with a completed backend report', () => {
  const records = buildQualifiedQaProjects([
    { projectId: 'p1', graphId: 'g1', name: '已完成项目', project_id: 'p1', graph_id: 'g1' },
    { projectId: 'p2', graphId: 'g2', name: '未完成项目', project_id: 'p2', graph_id: 'g2' }
  ], [
    { report_id: 'r1', graph_id: 'g1', status: 'completed' },
    { report_id: 'r2', graph_id: 'g2', status: 'generating' }
  ])

  assert.deepEqual(records.map(record => record.projectId), ['p1'])
  assert.equal(records[0].reportId, 'r1')
})

test('uses the explicit report route before the saved project selection', () => {
  const selected = resolveQualifiedQaSelection(records, {
    routeProjectId: 'p2', routeReportId: 'r2', storedProjectId: 'p1'
  })
  assert.equal(selected.projectId, 'p2')
})
```

Add cases for: only the shared normalized `completed` status qualifying a project; generating/failed/unknown statuses excluded; graph-ID association before simulation-ID association; report-only rows excluded; missing `graph_id` excluded; mismatched route project/report rejected; stale stored ID returning `null`; duplicate reports resolving deterministically without duplicating a logical project; input order not changing selection.

- [ ] **Step 2: Run the focused test and record RED**

Run: `node --test tests/qaProjectEligibilityModel.test.js`

Expected: failure because `qaProjectEligibilityModel.js` does not exist.

- [ ] **Step 3: Implement the pure eligibility model**

```js
export function buildQualifiedQaProjects(projects = [], reports = []) {
  // Normalize IDs, keep completed reports only, join by graph_id first and
  // simulation_id second, and emit one deterministic record per project.
}

export function resolveQualifiedQaSelection(records = [], request = {}) {
  // Accept a route selection only when projectId/reportId identify the same
  // qualified record. Otherwise try the saved project ID; never choose latest.
}
```

Reuse `normalizeReportStatus` from `src/features/reports/reportReaderModel.js`. Do not infer report completion from graph status, local progress, a non-empty report ID, or route parameters.

- [ ] **Step 4: Run focused model tests and record GREEN**

Run: `node --test tests/qaProjectEligibilityModel.test.js tests/reportReaderModel.test.js tests/reportProjectLifecycleModel.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the eligibility boundary**

```powershell
git add -- src/features/qa/qaProjectEligibilityModel.js tests/qaProjectEligibilityModel.test.js
git commit -m "feat: qualify reported graph projects for QA"
```

### Task 2: Race-safe qualified project context

**Files:**
- Create: `src/features/qa/qaProjectContextController.js`
- Create: `tests/qaProjectContextController.test.js`
- Modify: `src/features/projects/projectContextModel.js`
- Modify: `tests/projectContextModel.test.js`

**Interfaces:**
- `createQaProjectContextController({ refreshProjects, getProjects, listReports, storage, onChange })`.
- Methods: `refresh(selectionRequest?)`, `select(projectId)`, `clear()`, `stop()`.
- State: `{ loading, records, selected, error, requestVersion }`.
- Storage key remains `nexus_active_project_id`; the selected report is derived from the qualified record rather than persisted independently.

- [ ] **Step 1: Write failing controller behavior tests**

```js
test('keeps the previous qualified project after a background refresh', async () => {
  const controller = createQaProjectContextController(dependencies)
  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  await controller.refresh()
  assert.equal(controller.snapshot().selected.projectId, 'p1')
})
```

Also prove: no automatic latest-project selection; route project/report mismatch remains unselected; stale project or report responses cannot overwrite a newer refresh; one failed endpoint produces a visible error and no stale qualification; throwing `localStorage` does not block backend data; `stop()` suppresses late mutations; selecting an unqualified ID returns `false` and does not write storage.

- [ ] **Step 2: Run the controller test and record RED**

Run: `node --test tests/qaProjectContextController.test.js tests/projectContextModel.test.js`

Expected: failure because the controller does not exist.

- [ ] **Step 3: Implement one joined refresh boundary**

Use `Promise.all([refreshProjects(), listReports()])` within one request-version generation, then read `getProjects()` from the global monitor and pass those records through `buildLogicalGraphProjects` exactly once. Publish records only after both current operations succeed. Every success, error, and loading-finalizer mutation must verify that its request version is still current. `refreshProjects` is the existing monitor's `refresh`; this controller must not start, stop, or duplicate the monitor.

Storage access must go through the existing safe storage helpers; no direct unguarded `window.localStorage` access is allowed in this controller.

- [ ] **Step 4: Run context regressions**

Run: `node --test tests/qaProjectContextController.test.js tests/projectContextModel.test.js tests/apiRuntime.test.js tests/graphScopedQaFlow.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the context controller**

```powershell
git add -- src/features/qa/qaProjectContextController.js src/features/projects/projectContextModel.js tests/qaProjectContextController.test.js tests/projectContextModel.test.js
git commit -m "feat: load qualified QA project context"
```

### Task 3: Project selection through the existing QA control

**Files:**
- Create: `src/features/qa/QaProjectSelector.vue`
- Create: `tests/qaProjectSelector.test.js`
- Modify: `src/views/AscQaView.vue`
- Modify: `tests/graphScopedQaFlow.test.js`
- Modify: `tests/qaRouteQueryLifecycle.test.js`

**Interfaces:**
- `QaProjectSelector` props: `{ open, projects, selectedProjectId, loading, error }`.
- Emits: `select(projectId)`, `close`, `refresh`.
- The existing top-bar project control opens this temporary selector instead of navigating to the graph-evolution page.

- [ ] **Step 1: Write failing selector and source-contract tests**

```js
test('renders only the qualified projects supplied by the parent', async () => {
  const html = await renderSfc('/src/features/qa/QaProjectSelector.vue', {
    open: true,
    projects: [{ projectId: 'p1', projectName: '项目一', reportId: 'r1' }],
    selectedProjectId: '', loading: false, error: ''
  })
  assert.match(html, /项目一/)
  assert.doesNotMatch(html, /模拟数据|示例项目/)
})
```

Require `AscQaView` to retain the existing `.qa-topbar`, `.qa-layout`, composer, history region, and evidence panel. Require the selector to be a dialog/overlay removed from normal layout flow and keyboard closable. Require no route to `Process` from the existing “更换图谱” control.

- [ ] **Step 2: Run selector tests and record RED**

Run: `node --test tests/qaProjectSelector.test.js tests/graphScopedQaFlow.test.js tests/qaRouteQueryLifecycle.test.js`

Expected: component-not-found and old navigation-contract failures.

- [ ] **Step 3: Wire the controller without redesigning the QA page**

Replace the inline unqualified `listProjects` ownership with `createQaProjectContextController`. Keep the present page skeleton and button position. Supply the controller with the global monitor refresh and its logical project getter so Base and Professional backend rows cannot reappear as duplicate selectable projects. The existing control opens `QaProjectSelector`; selecting a record updates the active project/report, closes the dialog, and updates the route with both IDs without remounting the conversation.

If no qualified project exists, keep the composer disabled and show a concise empty-state message inside the selector. Do not insert a new persistent sidebar, panel, banner, model toggle, or report card into the QA page.

- [ ] **Step 4: Preserve route and conversation state**

Handle `{ projectId, reportId, conversation, new }` tokens exactly once. Changing only the selected project clears the incompatible conversation after explicit confirmation logic already present in the page; returning from another sidebar page must not reload the same qualified context or lose an in-flight answer.

- [ ] **Step 5: Run QA view regressions**

Run: `node --test tests/qaProjectSelector.test.js tests/graphScopedQaFlow.test.js tests/qaRouteQueryLifecycle.test.js tests/workflowPageContinuity.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit project selection**

```powershell
git add -- src/features/qa/QaProjectSelector.vue src/views/AscQaView.vue tests/qaProjectSelector.test.js tests/graphScopedQaFlow.test.js tests/qaRouteQueryLifecycle.test.js
git commit -m "feat: select reported projects for QA"
```

### Task 4: Revalidate report qualification before every QA request

**Files:**
- Modify: `src/features/qa/qaApiAdapter.js`
- Modify: `tests/qaApiAdapter.test.js`
- Modify: `src/views/AscQaView.vue`
- Modify: `tests/graphScopedQaFlow.test.js`

**Interfaces:**
- Existing `requestCodAnswer(dependencies, context)` gains `getReport` in `dependencies` and a required `reportId` in the local `context`.
- The backend CoD payload remains the currently supported shape; do not add `report_id`, `model`, or history fields until the backend contract exists.
- New local error code: `INVALID_QA_ELIGIBILITY`.

- [ ] **Step 1: Add failing send-time eligibility tests**

```js
test('does not send CoD when the selected report is no longer completed', async () => {
  let codCalls = 0
  await assert.rejects(() => requestCodAnswer({
    getProject: async () => ({ success: true, data: { project_id: 'p1', graph_id: 'g1' } }),
    getReport: async () => ({ success: true, data: { report_id: 'r1', status: 'generating' } }),
    codGraphRagQuery: async () => { codCalls += 1 }
  }, {
    reportId: 'r1',
    question: '问题',
    project: { project_id: 'p1', graph_id: 'g1' }
  }), error => error.code === 'INVALID_QA_ELIGIBILITY')
  assert.equal(codCalls, 0)
})
```

Also prove: completed report proceeds; report ID mismatch blocks; project/graph mismatch blocks; report GET failure blocks; CoD payload still contains only existing supported keys; response-scope validation remains mandatory after POST.

- [ ] **Step 2: Run adapter tests and record RED**

Run: `node --test tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js`

Expected: report qualification tests fail because the adapter currently validates only project/graph scope.

- [ ] **Step 3: Add fail-closed report preflight**

Validate the authoritative report status and identifier after the project preflight and before `codGraphRagQuery`. If the backend report response exposes graph/project IDs, validate them too. Missing optional association fields are tolerated; conflicting non-empty fields are not.

On `INVALID_QA_ELIGIBILITY`, `AscQaView` keeps the user's question as the draft, clears the invalid selection, refreshes the qualified list in manual-selection mode, and never automatically resends.

- [ ] **Step 4: Run request-contract regressions**

Run: `node --test tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js tests/requestContracts.test.js`

Expected: all tests pass and no unsupported request field is introduced.

- [ ] **Step 5: Commit send-time qualification**

```powershell
git add -- src/features/qa/qaApiAdapter.js src/views/AscQaView.vue tests/qaApiAdapter.test.js tests/graphScopedQaFlow.test.js
git commit -m "fix: require completed reports before QA"
```

### Task 5: Preserve references, green domain terms, evidence, and evaluation

**Files:**
- Modify: `src/features/qa/qaAnswerRenderingModel.js`
- Modify: `src/features/qa/QaAnswerText.js`
- Modify: `src/features/qa/qaApiAdapter.js`
- Modify: `src/features/qa/ConversationPanel.vue`
- Modify: `src/features/qa/EvidencePanel.vue`
- Modify: `tests/qaAnswerRendering.test.js`
- Modify: `tests/qaApiAdapter.test.js`
- Create: `tests/qaEvidenceInteraction.test.js`

**Interfaces:**
- Backend markers `<c>R1</c>` and `[R1]` both render as clickable `[R1]` when reference `R1` exists.
- Domain terms supplied by `buildAscDomainTerms` render through the current green-term style.
- Clicking a citation selects and reveals the corresponding existing evidence item.

- [ ] **Step 1: Add behavior regressions for the legacy parity contract**

```js
test('keeps backend citation markers in the parsed answer', () => {
  const answer = parseAnswer('Al2O3 影响反应层 <c>R1</c>。', [{ ref_id: 'R1' }])
  assert.equal(answer.citations[0].refId, 'R1')
  assert.equal(answer.plainText.includes('[R1]'), true)
})
```

Add cases for repeated references, unknown references staying plain text, citation markers adjacent to Chinese punctuation, HTML escaping, overlapping domain terms, and a citation click selecting the evidence card exactly once.

- [ ] **Step 2: Run rendering tests before changing production code**

Run: `node --test tests/qaAnswerRendering.test.js tests/qaApiAdapter.test.js tests/qaEvidenceInteraction.test.js`

Expected: record the actual result. Existing behavior that already passes must not be rewritten merely to copy the old `Step5Interaction` implementation.

- [ ] **Step 3: Apply only verified gap fixes**

Keep `result.final_answer` intact when calling `parseAnswer`. Marker-free text may still be used only for empty-answer detection. Reuse `QaAnswerText`, `buildAscDomainTerms`, and `EvidencePanel`; do not create a second answer renderer or a second evidence drawer.

Do not transfer visual markup from the legacy Step 5 page. Do not fabricate citation-to-document mappings when the backend returns only graph snippets.

- [ ] **Step 4: Run rendering and conversation regressions**

Run: `node --test tests/qaAnswerRendering.test.js tests/qaApiAdapter.test.js tests/qaEvidenceInteraction.test.js tests/graphScopedQaFlow.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit only if a real gap required production changes**

```powershell
git add -- src/features/qa/qaAnswerRenderingModel.js src/features/qa/QaAnswerText.js src/features/qa/qaApiAdapter.js src/features/qa/ConversationPanel.vue src/features/qa/EvidencePanel.vue tests/qaAnswerRendering.test.js tests/qaApiAdapter.test.js tests/qaEvidenceInteraction.test.js
git commit -m "fix: preserve QA evidence references"
```

If all production behavior already passes, commit only new regression tests with message `test: lock QA evidence rendering`.

### Task 6: Lock unsupported QA capabilities at the request boundary

**Files:**
- Modify: `src/features/qa/qaApiAdapter.js`
- Modify: `tests/requestContracts.test.js`
- Modify: `tests/graphScopedQaFlow.test.js`

**Interfaces:**
- `buildCodQueryPayload` remains the single source of truth for currently supported CoD request fields.
- Confirmed payload fields remain `question`, `project_id`, `graph_id`, `reasoning_mode`, plus existing conditional `mode`.
- Unsupported model, history, report-context, and LLM-toggle fields are excluded until backend contracts exist.

- [ ] **Step 1: Write request-boundary regression tests**

Require the existing model selector to remain in source, require no new LLM toggle, require no history-save/list calls, and require CoD request payloads not to include unsupported `model`, `report_id`, `conversation_id`, or `llm_enabled` fields.

- [ ] **Step 2: Run the request-boundary tests before changes**

Run: `node --test tests/requestContracts.test.js tests/graphScopedQaFlow.test.js tests/qaApiAdapter.test.js`

Expected: record the current result. Existing supported payload behavior should remain green; new source-boundary assertions fail only if unsupported controls or fields are already present.

- [ ] **Step 3: Apply only the minimal request-boundary correction**

The existing model selector remains visually unchanged and keeps its current single option. It does not alter the backend request until the backend publishes a model parameter contract. The existing history/example area remains visually unchanged and gains no fake persistence. Do not add an unused runtime capability registry merely to describe unavailable features.

- [ ] **Step 4: Run request-contract regressions**

Run: `node --test tests/requestContracts.test.js tests/graphScopedQaFlow.test.js tests/qaApiAdapter.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the backend boundary tests and any required adapter fix**

```powershell
git add -- src/features/qa/qaApiAdapter.js tests/requestContracts.test.js tests/graphScopedQaFlow.test.js
git commit -m "test: lock current QA backend contract"
```

### Task 7: Redirect the legacy interaction route and remove dead Step 5 code

**Files:**
- Modify: `src/config/ascRoutes.js`
- Modify: `src/features/navigation/WorkflowRouteOutlet.js`
- Modify: `src/api/report.js`
- Modify: `tests/reportApi.test.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/workflowRouteCache.test.js`
- Create: `tests/legacyInteractionRemoval.test.js`
- Delete: `src/views/InteractionView.vue`
- Delete: `src/components/Step5Interaction.vue`

**Interfaces:**
- Legacy `/interaction/:reportId` redirects to `{ name: 'AscQa', query: { reportId } }`.
- `AscQaView` resolves the associated qualified project from `reportId`; an unknown or incomplete report leaves the selector open and does not send a question.

- [ ] **Step 1: Write failing migration-completeness tests**

```js
test('redirects old interaction links to the qualified QA home', () => {
  const target = redirectLegacyInteraction({ params: { reportId: 'r1' } })
  assert.deepEqual(target, { name: 'AscQa', query: { reportId: 'r1' } })
})
```

Require that current QA tests cover: project selection, report qualification, references, domain terms, evidence/evaluation, and existing composer controls. Require no imports/references to `InteractionView` or `Step5Interaction` before deletion is accepted. Require the legacy-only `chatWithReport` frontend wrapper to have no remaining caller; do not redirect it into CoD because the backend has not defined a report-enhanced QA contract.

- [ ] **Step 2: Run removal tests and record RED**

Run: `node --test tests/legacyInteractionRemoval.test.js tests/ascLabExperience.test.js tests/workflowRouteCache.test.js`

Expected: failures because the legacy route and components still exist.

- [ ] **Step 3: Add the compatibility redirect**

Implement the redirect as a pure exported helper in route configuration so it is directly testable. Preserve only `reportId`; do not trust an arbitrary route project ID. Remove `InteractionView` from the KeepAlive include list and cached route-scope model.

- [ ] **Step 4: Delete legacy components after import proof is clean**

Before deletion run:

```powershell
rg -n "InteractionView|Step5Interaction|chatWithReport|name:\s*['\"]Interaction['\"]" src tests
```

Expected before deletion: only the route, cache, old component, report API, and removal-test locations planned above. After wiring the redirect and tests, delete the two components with `apply_patch`, remove the now-unused `chatWithReport` export and `requestWithRetry` import from `src/api/report.js`, then rerun the search. Expected after deletion: only intentional legacy URL compatibility text in the route test/helper.

- [ ] **Step 5: Run route and QA regressions**

Run: `node --test tests/legacyInteractionRemoval.test.js tests/ascLabExperience.test.js tests/workflowRouteCache.test.js tests/workflowPageContinuity.test.js tests/reportApi.test.js tests/qaProjectEligibilityModel.test.js tests/graphScopedQaFlow.test.js tests/qaAnswerRendering.test.js tests/qaEvidenceInteraction.test.js`

Expected: all tests pass and the old URL lands on the current QA home.

- [ ] **Step 6: Commit the final legacy cleanup**

```powershell
git add -A -- src/config/ascRoutes.js src/features/navigation/WorkflowRouteOutlet.js src/api/report.js src/views/InteractionView.vue src/components/Step5Interaction.vue tests/reportApi.test.js tests/ascLabExperience.test.js tests/workflowRouteCache.test.js tests/legacyInteractionRemoval.test.js
git commit -m "refactor: retire legacy deep interaction page"
```

### Task 8: End-to-end verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-qa-capability-migration-and-legacy-cleanup.md` with exact results only.

**Interfaces:**
- Produces one current QA home whose selectable project list contains only completed-report projects.
- Preserves the current QA visual layout and its existing supported controls.
- Leaves backend-dependent model selection and history persistence explicitly pending.

- [ ] **Step 1: Run the QA-focused suite**

Run: `node --test tests/qaProjectEligibilityModel.test.js tests/qaProjectContextController.test.js tests/qaProjectSelector.test.js tests/qaApiAdapter.test.js tests/qaAnswerRendering.test.js tests/qaEvidenceInteraction.test.js tests/qaRouteQueryLifecycle.test.js tests/requestContracts.test.js tests/graphScopedQaFlow.test.js tests/legacyInteractionRemoval.test.js`

Expected: zero failures.

- [ ] **Step 2: Run the full frontend suite**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 4: Perform a controlled real-browser smoke test**

Using the existing frontend on port 3000 and backend on port 5002, verify:

1. A project with no report or a generating/failed report is absent from the selector.
2. A project with a completed report appears exactly once.
3. Entering from a completed report selects the matching project.
4. Returning from another sidebar page preserves the selected project, draft, and in-flight answer.
5. `<c>R1</c>` renders as a clickable `[R1]`; the click selects existing evidence; domain terms remain green.
6. The model selector still displays its current single model and no LLM toggle appears.
7. The legacy interaction URL redirects to the QA home.

Use real GETs for project/report qualification. Send at most one deliberate QA POST with a harmless question and record its exact payload keys. Do not generate reports, graphs, simulations, or delete data during this smoke test.

- [ ] **Step 5: Compare the QA layout against the pre-migration page**

Capture desktop and mobile screenshots before and after. Verify the persistent DOM regions, composer positions, history region, and evidence drawer retain their existing geometry. The only new visual may be the temporary project selector while it is open.

- [ ] **Step 6: Check repository and backend boundaries**

Run:

```powershell
git diff --check 192e1c6..HEAD
git diff --name-only 192e1c6..HEAD
git status --short
```

Expected: no backend paths, no whitespace errors, no generated browser assets, and unrelated `tmp/` remains untracked and unstaged.

- [ ] **Step 7: Record evidence and commit the verification note**

Append exact test counts, build output, browser URLs, selected IDs, network request counts, screenshot paths, and unresolved backend contracts to this plan. Stage only the plan and commit:

```powershell
git add -- docs/superpowers/plans/2026-08-12-qa-capability-migration-and-legacy-cleanup.md
git commit -m "docs: verify QA capability migration"
```

## Deferred Backend Contracts

- Multiple reports per graph project, report numbering, and a stable version/list contract.
- Model selection beyond the currently wired DeepSeek option and its request parameter schema.
- Saved QA history, conversation listing, conversation restoration, and deletion.
- Any report-to-project association fields not currently returned by report list/detail APIs.

Until those contracts exist, the frontend must neither display the capability as working nor send guessed request fields.
