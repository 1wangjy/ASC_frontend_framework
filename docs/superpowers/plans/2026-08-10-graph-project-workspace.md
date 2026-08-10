# Graph Project Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增图谱项目工作台，把项目选择从问答首页迁出，并支持创建时命名和所有状态项目删除。

**Architecture:** `/process/:projectId?` 由新的工作台视图承载，左侧复用全局图谱任务监控数据，右侧按路由项目 ID 挂载现有 `MainView`。项目命名和删除编排放在独立纯模型中；问答页只消费显式路由或已记忆的有效项目，不再拥有下拉选择器。

**Tech Stack:** Vue 3 SFC、Vue Router、Node test runner、Vite、现有 Axios API 层。

## Global Constraints

- 不修改后端代码或 5002 服务。
- 不实现创建后的项目重命名。
- 所有状态项目均允许删除；构建中项目使用更强确认提示。
- 问答请求继续严格携带 `project_id` 和 `graph_id`。
- 不创建第二套项目轮询器，工作台复用 `useGraphTaskMonitor()`。

---

### Task 1: 项目命名和删除领域模型

**Files:**
- Create: `src/features/projects/graphProjectWorkspaceModel.js`
- Create: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- Produces: `suggestNextProjectName(projects) -> string`
- Produces: `normalizeProjectName(value) -> string`
- Produces: `projectDeletionMessage(project) -> string`
- Produces: `deleteGraphProjectResources(dependencies, project) -> Promise<void>`

- [ ] **Step 1: Write the failing tests**

```js
test('suggests the next project_N name from existing project names', () => {
  assert.equal(suggestNextProjectName([
    { project_name: 'project_1' },
    { project_name: 'Other' },
    { project_name: 'project_7' }
  ]), 'project_8')
})

test('deletes the remote graph before the local project', async () => {
  const calls = []
  await deleteGraphProjectResources({
    deleteGraph: async id => { calls.push(['graph', id]); return { success: true } },
    deleteGraphProject: async id => { calls.push(['project', id]); return { success: true } }
  }, { projectId: 'p1', graphId: 'g1' })
  assert.deepEqual(calls, [['graph', 'g1'], ['project', 'p1']])
})
```

Add separate cases for a project without `graphId`, `success: false`, whitespace names, and the stronger active-project warning.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/graphProjectWorkspace.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `graphProjectWorkspaceModel.js`.

- [ ] **Step 3: Write minimal implementation**

Implement exact `project_<positive integer>` matching, trim user names, produce status-aware Chinese confirmation copy, and stop deletion immediately when either API rejects or resolves with `success: false`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test tests/graphProjectWorkspace.test.js tests/requestContracts.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/projects/graphProjectWorkspaceModel.js tests/graphProjectWorkspace.test.js
git commit -m "feat: model graph project management"
```

---

### Task 2: 创建图谱时保存项目名称

**Files:**
- Modify: `src/features/research/ResearchQuestionDialog.vue`
- Modify: `src/features/research/researchQuestionWorkflow.js`
- Modify: `src/store/pendingUpload.js`
- Modify: `src/views/DocumentLibraryView.vue`
- Modify: `src/views/MainView.vue`
- Modify: `tests/researchWorkflowIntegration.test.js`
- Modify: `tests/researchQuestionWorkflow.test.js`

**Interfaces:**
- `ResearchQuestionDialog` consumes `defaultProjectName` and emits `{ projectName, question }`.
- `startResearchBuildFromLibrary(documents, selectedIds, submission)` stores both normalized values.
- `getPendingUpload()` returns `projectName`.
- `runBaseResearchRequests` consumes the pending `projectName` passed by `MainView`.

- [ ] **Step 1: Write the failing tests**

Add behavior tests proving that `{ projectName: '  project_8  ', question: '  Why?  ' }` becomes `project_8` and `Why?`, survives pending storage, and produces a prepare payload whose `project_name` is exactly `project_8`. Add empty-name validation and dialog reset cases.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/researchWorkflowIntegration.test.js tests/researchQuestionWorkflow.test.js`

Expected: FAIL because the current dialog emits only a question string and pending storage has no `projectName`.

- [ ] **Step 3: Write minimal implementation**

Add the labelled project-name input above the research-question textarea, validate both fields, obtain the default from `suggestNextProjectName(graphTaskMonitor.state.items)`, store it through `setPendingUpload`, and pass `pending.projectName` to `runBaseResearchRequests`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test tests/researchWorkflowIntegration.test.js tests/researchQuestionWorkflow.test.js tests/graphProjectWorkspace.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/research/ResearchQuestionDialog.vue src/features/research/researchQuestionWorkflow.js src/store/pendingUpload.js src/views/DocumentLibraryView.vue src/views/MainView.vue tests/researchWorkflowIntegration.test.js tests/researchQuestionWorkflow.test.js
git commit -m "feat: name graph projects at creation"
```

---

### Task 3: 图谱构建工作台和项目删除

**Files:**
- Create: `src/features/projects/GraphProjectList.vue`
- Create: `src/views/GraphProjectWorkspaceView.vue`
- Modify: `src/config/ascRoutes.js`
- Modify: `src/features/navigation/appNavigation.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/globalGraphTaskIndicator.test.js`
- Modify: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- `GraphProjectList` consumes normalized monitor items and emits `select`, `open-qa`, and `delete`.
- `GraphProjectWorkspaceView` owns route navigation and delete orchestration, but consumes the singleton monitor for state and refresh.
- `/process/:projectId?` renders `GraphProjectWorkspaceView`; it mounts `<MainView :key="selectedProjectId">` only when a project ID exists.

- [ ] **Step 1: Write the failing tests**

Add SSR behavior tests for an active and completed project list, an empty workspace, delete controls on active items, and QA controls only on completed items. Add route/navigation tests for the new “图谱构建” entry and optional project route.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js`

Expected: FAIL because the workspace and list components do not exist and navigation has only two entries.

- [ ] **Step 3: Write minimal implementation**

Build the two-column responsive workspace. Selecting an item routes to `{ name: 'Process', params: { projectId } }`; deleting confirms, calls `deleteGraphProjectResources`, refreshes the monitor, clears a deleted active selection, and routes to `/process` when the visible project is removed.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/projects/GraphProjectList.vue src/views/GraphProjectWorkspaceView.vue src/config/ascRoutes.js src/features/navigation/appNavigation.js tests/graphProjectWorkspace.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js
git commit -m "feat: add graph project workspace"
```

---

### Task 4: 问答首页使用显式图谱上下文

**Files:**
- Modify: `src/features/projects/projectContextModel.js`
- Modify: `src/views/AscQaView.vue`
- Modify: `tests/projectContextModel.test.js`
- Modify: `tests/graphScopedQaFlow.test.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- `resolveProjectAfterRefresh(projects, { routeProjectId, storedProjectId, allowFallback })` supports `allowFallback: false`.
- QA passes `allowFallback: false`, renders a current-project context bar, and routes project changes to `Process` instead of editing a select.

- [ ] **Step 1: Write the failing tests**

Add behavior tests proving that strict selection returns `null` when route and stored IDs are absent or invalid, but returns the matching completed graph when valid. Add SSR/source integration checks that the QA picker is absent, the current graph and “更换图谱” actions render, and no-project state disables submission and links to `Process`.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/projectContextModel.test.js tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js`

Expected: FAIL because refresh currently falls back to the newest project and the QA select still renders.

- [ ] **Step 3: Write minimal implementation**

Add strict resolution without changing the default helper behavior for other callers. Remove `qa-project-picker` and `changeActiveProject`, add a compact context bar, keep route/stored refresh guards, and clear invalid selection without sending a question or choosing another project.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --test tests/projectContextModel.test.js tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/features/projects/projectContextModel.js src/views/AscQaView.vue tests/projectContextModel.test.js tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js
git commit -m "feat: bind QA to explicit graph projects"
```

---

### Task 5: 集成验证

**Files:**
- Modify only files needed for regressions discovered by these checks.

**Interfaces:**
- Consumes the completed project naming, workspace, deletion, and QA context flows.
- Produces a clean build and verified Git state.

- [ ] **Step 1: Run focused integration tests**

```powershell
node --test tests/graphProjectWorkspace.test.js tests/researchWorkflowIntegration.test.js tests/researchQuestionWorkflow.test.js tests/projectContextModel.test.js tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js tests/globalGraphTaskIndicator.test.js
```

- [ ] **Step 2: Run the full suite and production build**

```powershell
node --test tests/*.test.js
npm run build
git diff --check
```

Expected: zero test failures, Vite exits zero, and diff-check produces no output.

- [ ] **Step 3: Review requirements and Git scope**

Confirm no backend path changed, no rename API or UI exists, active deletion remains visible, the QA picker is absent, and the working tree contains only intended frontend/tests/docs changes.
