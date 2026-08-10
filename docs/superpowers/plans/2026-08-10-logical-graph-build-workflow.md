# Logical Graph Build Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Base Research and Professional Research as one user-visible knowledge-graph project, remove misleading graph percentages, and allow QA only after the Professional graph completes.

**Architecture:** Keep the backend's required Base and Professional project records and both stage-specific `/api/graph/build` calls. Add a pure frontend model that links normalized monitor items through `base_project_id`, produces one logical project, and defines final completion exclusively from the Professional record. Both the project list and the workflow header consume this shared logical meaning.

**Tech Stack:** Vue 3 Composition API, Vue Router, existing Axios API adapters, Node.js `node:test`, existing SFC SSR test helper, Vite.

## Global Constraints

- Modify only `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`; do not modify the 5002 backend or the `D:\WEB` reference frontend.
- Preserve exactly one Base and one Professional `POST /api/graph/build` for the two-stage backend workflow; do not add another build POST.
- Base `graph_completed` is an intermediate state and must not enable QA.
- Only a Professional `graph_completed` record with non-empty `project_id` and `graph_id` is final.
- Do not show graph-build percentages in the project list or workflow header.
- Execute directly on the current `main` branch, matching the user's previously chosen integration workflow.

---

### Task 1: Define the logical project model

**Files:**
- Create: `src/features/projects/logicalGraphProjectModel.js`
- Modify: `src/features/tasks/graphTaskMonitorModel.js`
- Modify: `tests/graphTaskMonitorModel.test.js`
- Modify: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- Consumes: normalized monitor items containing `projectId`, `graphId`, `baseProjectId`, `stage`, `status`, `name`, `updatedAt`, and `active`.
- Produces: `isProfessionalGraphProject(project) -> boolean`, `isFinalGraphProject(project) -> boolean`, and `buildLogicalGraphProjects(items) -> LogicalGraphProject[]`.
- `LogicalGraphProject` exposes `rootProjectId`, operational `projectId`/`graphId`, `memberProjectIds`, `resources`, `name`, `status`, `stage`, `active`, `canOpenQa`, and `updatedAt`.

- [ ] **Step 1: Write failing monitor-normalization tests**

Add assertions proving the normalized item preserves the backend relationship and stage:

```js
const [item] = normalizeGraphTaskItems([{
  project_id: 'pro-1',
  base_project_id: 'base-1',
  graph_build_stage: 'professional',
  status: 'graph_building'
}])

assert.equal(item.baseProjectId, 'base-1')
assert.equal(item.stage, 'professional')
```

- [ ] **Step 2: Write failing logical-project behavior tests**

Import the new model in `tests/graphProjectWorkspace.test.js` and cover:

```js
const logical = buildLogicalGraphProjects([
  { projectId: 'base-1', graphId: 'base-g', name: 'project_1', stage: 'base', status: 'graph_completed', updatedAt: 1 },
  { projectId: 'pro-1', graphId: '', name: 'Professional Research Graph Project', baseProjectId: 'base-1', stage: 'professional', status: 'graph_building', active: true, updatedAt: 2 }
])

assert.equal(logical.length, 1)
assert.equal(logical[0].name, 'project_1')
assert.equal(logical[0].projectId, 'pro-1')
assert.equal(logical[0].canOpenQa, false)
assert.deepEqual(logical[0].memberProjectIds, ['pro-1', 'base-1'])
```

Also assert Base-only completion cannot open QA, Professional completion can, and an unlinked Professional record remains visible rather than being silently merged.

Update the existing monitor test so a completed Base record has `canOpenQa=false`, while a completed Professional record with both identifiers has `canOpenQa=true`. This also protects the global task indicator because it consumes normalized monitor items directly.

- [ ] **Step 3: Run RED tests**

Run:

```powershell
node --test tests/graphTaskMonitorModel.test.js tests/graphProjectWorkspace.test.js
```

Expected: FAIL because `baseProjectId` and `logicalGraphProjectModel.js` do not exist.

- [ ] **Step 4: Implement the minimal pure model**

Extend monitor normalization:

```js
baseProjectId: String(project.base_project_id || '').trim(),
```

Create classification helpers that accept both normalized items and raw backend records:

```js
export function isProfessionalGraphProject(project = {}) {
  const stage = String(project.stage || project.graph_build_stage || project.build_stage || '').trim().toLowerCase()
  return stage === 'professional' || Boolean(String(project.baseProjectId || project.base_project_id || '').trim())
}

export function isFinalGraphProject(project = {}) {
  return isProfessionalGraphProject(project)
    && project.status === 'graph_completed'
    && Boolean(String(project.projectId || project.project_id || '').trim())
    && Boolean(String(project.graphId || project.graph_id || '').trim())
}
```

Implement `buildLogicalGraphProjects` with a `Map` keyed by `projectId`. Attach Professional children only when their `baseProjectId` resolves to an existing Base item; choose the newest Professional child as the operational item; preserve the root name; and calculate `canOpenQa` only with `isFinalGraphProject`.

Use `isFinalGraphProject` for `normalizeGraphTaskItems(...).canOpenQa` as well, so Base completion never exposes QA through the global indicator.

- [ ] **Step 5: Run GREEN tests**

Run:

```powershell
node --test tests/graphTaskMonitorModel.test.js tests/graphProjectWorkspace.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit the model**

```powershell
git add src/features/projects/logicalGraphProjectModel.js src/features/tasks/graphTaskMonitorModel.js tests/graphTaskMonitorModel.test.js tests/graphProjectWorkspace.test.js
git commit -m "feat: group graph build stages logically"
```

---

### Task 2: Render and operate on one logical project card

**Files:**
- Modify: `src/views/GraphProjectWorkspaceView.vue`
- Modify: `src/features/projects/GraphProjectList.vue`
- Modify: `src/features/projects/graphProjectWorkspaceModel.js`
- Modify: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- Consumes: `buildLogicalGraphProjects(monitor.state.items)` from Task 1.
- Produces: a list without percentages, route selection through the operational Professional record, and `deleteLogicalGraphProjectResources(dependencies, logicalProject)`.

- [ ] **Step 1: Write failing card-render tests**

Render `GraphProjectList.vue` with a Base logical project and a completed Professional logical project. Assert that:

```js
assert.doesNotMatch(html, /\d+%/)
assert.doesNotMatch(html, /graph-project-card__progress/)
assert.equal((html.match(/去问答/g) || []).length, 1)
```

Assert the Base-only card copy is `基础阶段完成，等待 Professional Research`, while final Professional copy is `知识图谱构建完成`.

- [ ] **Step 2: Write failing workspace integration tests**

Read `GraphProjectWorkspaceView.vue` and assert it computes logical items before rendering. Add a pure deletion test:

```js
await deleteLogicalGraphProjectResources(dependencies, {
  resources: [
    { projectId: 'pro-1', graphId: 'pro-g' },
    { projectId: 'base-1', graphId: 'base-g' }
  ]
})

assert.deepEqual(calls, [
  ['graph', 'pro-g'], ['project', 'pro-1'],
  ['graph', 'base-g'], ['project', 'base-1']
])
```

- [ ] **Step 3: Run RED tests**

Run:

```powershell
node --test tests/graphProjectWorkspace.test.js
```

Expected: FAIL because percentages still render and logical deletion is absent.

- [ ] **Step 4: Implement logical list integration**

In `GraphProjectWorkspaceView.vue`:

```js
const logicalProjects = computed(() => buildLogicalGraphProjects(monitor.state.items))
```

Pass `logicalProjects` to `GraphProjectList`. Keep routing through `item.projectId`, which represents the currently operational backend record. Treat a route as selected when it belongs to `item.memberProjectIds`.

In `GraphProjectList.vue`, remove the percentage block and its CSS. Replace generic `graph_completed: 已完成` copy with stage-aware user copy derived from `item.status` and `item.stage`.

Implement `deleteLogicalGraphProjectResources` by calling the existing single-resource deletion helper for each supplied resource in child-first order. On partial failure, propagate the real error and refresh the monitor.

- [ ] **Step 5: Run GREEN tests**

Run:

```powershell
node --test tests/graphProjectWorkspace.test.js tests/graphTaskMonitorModel.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit the logical workspace UI**

```powershell
git add src/views/GraphProjectWorkspaceView.vue src/features/projects/GraphProjectList.vue src/features/projects/graphProjectWorkspaceModel.js tests/graphProjectWorkspace.test.js
git commit -m "feat: show one logical graph project"
```

---

### Task 3: Remove weighted percentages and gate completion on Professional

**Files:**
- Modify: `src/components/WorkflowProgressBar.vue`
- Modify: `src/components/Step1GraphBuild.vue`
- Modify: `src/views/MainView.vue`
- Modify: `tests/graphProjectWorkspace.test.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/globalGraphTaskIndicator.test.js`

**Interfaces:**
- Consumes: `isFinalGraphProject(project)` from Task 1.
- Produces: a discrete five-step header and Professional-only QA/completion gating.

- [ ] **Step 1: Write failing workflow-header tests**

Render the progress component and assert:

```js
const html = await renderSfc('/src/components/WorkflowProgressBar.vue', { currentStep: 1 })
assert.doesNotMatch(html, /当前步骤\s*\d+%/)
assert.doesNotMatch(html, /workflow-track|workflow-fill/)
assert.match(html, /步骤 1\/5/)
```

Add source behavior assertions that `MainView.vue` no longer defines `stepProgress` or passes it into `WorkflowProgressBar`.

- [ ] **Step 2: Write failing completion-gate tests**

Test the real pure helper with raw backend records:

```js
assert.equal(isFinalGraphProject({
  project_id: 'base-1', graph_id: 'base-g', graph_build_stage: 'base', status: 'graph_completed'
}), false)

assert.equal(isFinalGraphProject({
  project_id: 'pro-1', graph_id: 'pro-g', base_project_id: 'base-1', graph_build_stage: 'professional', status: 'graph_completed'
}), true)
```

Update the existing MainView source contract to require `canOpenCompletedGraphQa` to call `isFinalGraphProject(projectData.value)`.

Add a Step1 source/SSR assertion that its local QA action also depends on `isFinalGraphProject(projectData)` rather than only the presence of `project_id` and `graph_id`. Retain the global-indicator test proving it renders QA only when the normalized item has `canOpenQa=true`.

- [ ] **Step 3: Run RED tests**

Run:

```powershell
node --test tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js
```

Expected: FAIL because weighted progress and Base completion gating still exist.

- [ ] **Step 4: Implement discrete workflow state**

Remove `stepProgress` from `WorkflowProgressBar` and delete the continuous track. Keep only the five state markers. In `MainView.vue`:

```js
const canOpenCompletedGraphQa = computed(() => isFinalGraphProject(projectData.value))
```

Delete the 30/58/68/95 weighted `stepProgress` computation. Keep `currentStep=1` throughout Base and Professional processing. Add a `watch(projectData, ...)` synchronization that advances from Step 1 to Step 2 only when `isFinalGraphProject(project)` becomes true; this covers live completion and opening an already-completed Professional route. Base completion stays on Step 1.

In `Step1GraphBuild.vue`, import the same helper, define `canOpenFinalGraphQa`, and render its QA button only when that computed value is true.

Align `stepNames` with the visible component labels: `图谱构建`, `环境搭建`, `开始模拟`, `报告生成`, `深度互动`.

- [ ] **Step 5: Run GREEN tests**

Run:

```powershell
node --test tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit the completion semantics**

```powershell
git add src/components/WorkflowProgressBar.vue src/components/Step1GraphBuild.vue src/views/MainView.vue tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js
git commit -m "fix: complete graphs after professional stage"
```

---

### Task 4: Preserve the logical name through Professional requests

**Files:**
- Modify: `src/features/research/researchQuestionWorkflow.js`
- Modify: `src/views/MainView.vue`
- Modify: `tests/researchQuestionWorkflow.test.js`
- Modify: `tests/researchWorkflowIntegration.test.js`

**Interfaces:**
- Consumes: `projectName` supplied by MainView from the Base/root project.
- Produces: `runProfessionalResearchRequests({ projectName, ... })` that sends one normalized name in both prepare JSON and generate FormData.

- [ ] **Step 1: Write failing request-contract tests**

Capture both Professional payloads:

```js
await runProfessionalResearchRequests({
  question: 'Why does oxidation accelerate?',
  projectName: 'project_1',
  files: [new Blob(['research'])],
  baseMetadataPath: 'base_latest.json',
  baseProjectId: 'base-1',
  prepareOntologyProject: async payload => { preparePayload = payload; return { success: true, data: { project_id: 'pro-1' } } },
  generateOntology: async formData => { generationForm = formData; return { success: true, data: { project_id: 'pro-1' } } }
})

assert.equal(preparePayload.project_name, 'project_1 · Professional Research')
assert.equal(generationForm.get('project_name'), 'project_1 · Professional Research')
```

Add a source integration assertion that MainView passes the Base/root project name and does not hard-code `Unnamed Project`.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
node --test tests/researchQuestionWorkflow.test.js tests/researchWorkflowIntegration.test.js
```

Expected: FAIL because the Professional FormData does not contain `project_name`.

- [ ] **Step 3: Implement consistent Professional naming**

Normalize the supplied Base name once:

```js
const rootName = String(projectName || '').trim() || 'Graph Project'
const professionalProjectName = `${rootName} · Professional Research`
```

Use `professionalProjectName` in the prepare payload and append it to each retry-created FormData. In MainView, pass the Base/root name from `baseProjectData.value?.name || projectData.value?.name`.

- [ ] **Step 4: Run GREEN and build-POST regression tests**

Run:

```powershell
node --test tests/researchQuestionWorkflow.test.js tests/researchWorkflowIntegration.test.js tests/graphProjectWorkspace.test.js
```

Expected: all tests pass, with the existing flow still invoking only its intended Base and Professional build calls.

- [ ] **Step 5: Commit the naming fix**

```powershell
git add src/features/research/researchQuestionWorkflow.js src/views/MainView.vue tests/researchQuestionWorkflow.test.js tests/researchWorkflowIntegration.test.js
git commit -m "fix: preserve professional graph project names"
```

---

### Task 5: Final regression and frontend-only audit

**Files:**
- Modify only if a verification failure is caused by Tasks 1-4.

**Interfaces:**
- Consumes: all Task 1-4 deliverables.
- Produces: verified frontend build with no backend or `D:\WEB` changes.

- [ ] **Step 1: Run focused workflow tests**

```powershell
node --test tests/graphTaskMonitorModel.test.js tests/graphProjectWorkspace.test.js tests/researchQuestionWorkflow.test.js tests/researchWorkflowIntegration.test.js tests/ascLabExperience.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run the complete test suite**

```powershell
node --test tests/*.test.js
```

Expected: zero failures.

- [ ] **Step 3: Build the production frontend**

```powershell
npm run build
```

Expected: Vite exits with code 0.

- [ ] **Step 4: Audit scope and formatting**

```powershell
git diff --check
git status --short
git diff --name-only HEAD~4..HEAD
```

Expected: no whitespace errors; changes are limited to the frontend files listed in this plan; no backend or `D:\WEB` path was modified.

- [ ] **Step 5: Confirm the branch is ready for handoff**

Run:

```powershell
git status --short
git log -5 --oneline
```

Expected: the working tree is clean and the focused Task 1-4 commits are present. If a verification failure required a correction, return to the task that owns that behavior, repeat its RED/GREEN verification, and amend it with a separate focused commit before repeating this final audit.
