# Research Question First Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a research question before graph construction, carry it into the backend project, prevent empty-prompt simulation dead ends, and expose a clear QA entry on every workflow page.

**Architecture:** A small pure workflow model normalizes and validates the research question. The document page captures it before creating `pendingUpload`; `MainView`, `Step1GraphBuild`, and `Step2EnvSetup` add defensive gates at their API boundaries. The persistent shell exposes an unscoped QA-home action, while project pages keep project-scoped QA navigation.

**Tech Stack:** Vue 3 Composition API, Vue Router, Node test runner, Vite 7.

## Global Constraints

- Do not modify any file under `D:\WEB`; the 3001 frontend and 5002 backend are read-only.
- Do not add or change a backend endpoint.
- Do not trigger a real ontology, graph, simulation, CoD, or report POST during verification.
- Normalize research questions with `String(value || '').trim()`.
- Send the same normalized value as both `query_prompt` and `simulation_requirement`.
- Existing projects with an empty backend prompt must remain usable for graph QA but must not enter simulation preparation.
- Production changes follow RED-GREEN TDD and each task receives a review before the next task.

---

### Task 1: Capture the research question before graph construction

**Files:**
- Create: `src/features/research/researchQuestionWorkflow.js`
- Create: `src/features/research/ResearchQuestionDialog.vue`
- Modify: `src/views/DocumentLibraryView.vue`
- Modify: `src/views/MainView.vue`
- Test: `tests/researchQuestionWorkflow.test.js`

**Interfaces:**
- Produces: `normalizeResearchQuestion(value): string`.
- Produces: `createResearchBuildIntent(documents, selectedIds, question): { fileIds, files, queryPrompt, canStart, error }`.
- Consumes: existing `buildPdfLibrarySelection(documents, selectedIds)` and `setPendingUpload(files, queryPrompt, focusEntities, focusEvents, options)`.

- [ ] **Step 1: Write failing domain and source-contract tests**

  Cover whitespace normalization, missing-question rejection, valid selection output, dialog required state, `DocumentLibraryView` passing the non-empty normalized prompt to `setPendingUpload`, and `MainView` returning before `prepareOntologyProject` when pending prompt is empty.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test tests/researchQuestionWorkflow.test.js`

  Expected: FAIL because the workflow model/dialog and API-boundary guard do not exist.

- [ ] **Step 3: Implement the minimal capture flow**

  `createResearchBuildIntent` must use `buildPdfLibrarySelection`, return `canStart: false` with `error: '请先填写研究问题。'` when the normalized question is empty, and return the selected backend PDF IDs plus the normalized prompt otherwise. `DocumentLibraryView` must open `ResearchQuestionDialog` after the user clicks the build button, then set pending upload and navigate only after a valid submit. `MainView.handleNewProject` must derive one normalized prompt once and return with a visible error before the first POST when it is empty.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `node --test tests/researchQuestionWorkflow.test.js`

- [ ] **Step 5: Run related library tests**

  Run: `node --test tests/libraryWorkflowModel.test.js tests/pdfLibraryAdapter.test.js tests/researchQuestionWorkflow.test.js`

- [ ] **Step 6: Commit**

  Commit message: `fix: require research question before graph build`

### Task 2: Gate simulation and add explicit QA recovery

**Files:**
- Create: `src/features/research/simulationPreparationModel.js`
- Modify: `src/components/Step1GraphBuild.vue`
- Modify: `src/components/Step2EnvSetup.vue`
- Modify: `src/views/MainView.vue`
- Modify: `src/views/SimulationView.vue`
- Test: `tests/simulationPromptGate.test.js`

**Interfaces:**
- Produces: `projectResearchQuestion(project): string`.
- Produces: `simulationPreparationState(simulationId, project): 'waiting-project' | 'missing-question' | 'ready'`.
- Consumes: Task 1 `normalizeResearchQuestion`.
- Emits from `Step1GraphBuild`: `open-qa` with current project.
- Emits from `Step2EnvSetup`: `go-qa` when missing-question recovery is selected.

- [ ] **Step 1: Write failing behavior and source-contract tests**

  Cover waiting for project data before prepare, missing-question projects never starting prepare, a non-empty `query_prompt` or `simulation_requirement` becoming ready, Step 1 refusing `createSimulation` for an empty prompt, Step 2 rendering the understandable missing-question message, and both Step 1 and Step 2 exposing project-scoped QA actions.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test tests/simulationPromptGate.test.js`

  Expected: FAIL because the preparation model and gates do not exist.

- [ ] **Step 3: Implement the minimal simulation gates**

  `Step1GraphBuild.handleEnterEnvSetup` must check the project research question before calling `createSimulation`. `Step2EnvSetup` must replace its unconditional `onMounted` start with an immediate watcher that waits for project data, starts exactly once for `ready`, and makes no prepare call for `missing-question`. The missing state must display `当前项目缺少研究问题，无法开始 ASC 分析准备。` and a “去图谱问答” action. `SimulationView` and `MainView` must route these actions through existing `navigateGraphProjectToQa`.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `node --test tests/simulationPromptGate.test.js tests/graphQaNavigation.test.js`

- [ ] **Step 5: Commit**

  Commit message: `fix: prevent empty prompt simulation workflow`

### Task 3: Add a persistent QA-home entry and verify integration

**Files:**
- Modify: `src/features/tasks/GlobalGraphTaskIndicator.vue`
- Modify: `src/layouts/AscShell.vue`
- Modify: `tests/globalGraphTaskIndicator.test.js`
- Test: `tests/researchWorkflowIntegration.test.js`

**Interfaces:**
- `GlobalGraphTaskIndicator` emits `open-qa-home` with no payload.
- `AscShell` handles it with `router.push({ name: 'AscQa' })`.

- [ ] **Step 1: Write failing tests**

  Require a persistent “问答首页” control outside the expandable task list, require shell routing to `AscQa`, and verify the complete source chain from dialog submit to pending upload to both graph request fields plus simulation guards.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js`

- [ ] **Step 3: Implement the persistent QA-home action**

  Render “问答首页” next to the task trigger at desktop and mobile widths. It must not depend on a completed task or selected graph; graph selection remains the responsibility of `AscQaView`.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `node --test tests/globalGraphTaskIndicator.test.js tests/researchWorkflowIntegration.test.js`

- [ ] **Step 5: Run final non-destructive verification**

  Run all frontend tests with `node --test tests/*.test.js`, then `npm run build`, `git diff --check`, and a read-only GET through `http://localhost:3000/api/graph/project/list` with `X-NEXUS-USER: analyst`. Browser smoke must intercept every POST and prove an empty-prompt project displays recovery without calling create/prepare.

- [ ] **Step 6: Commit**

  Commit message: `feat: expose QA entry across research workflow`
