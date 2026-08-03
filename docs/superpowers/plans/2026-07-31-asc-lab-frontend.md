# ASC LAB Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible legacy workflow with a runnable ASC LAB QA and literature-management frontend.

**Architecture:** Keep the existing Vue 3/Vite toolchain and legacy files, but route the application through a new shared shell and feature-focused views. Pure JavaScript model modules own demo state and filtering so behavior can be developed test-first without adding a Vue testing dependency.

**Tech Stack:** Vue 3, Vue Router 4, Vite 7, Node test runner, CSS

## Global Constraints

- Modify only `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`.
- Preserve all pre-existing modified and untracked files unless a listed active entry file must change.
- Do not delete legacy workflow components in this release.
- Do not add runtime dependencies.
- Use local mock data; do not require a backend.
- Match `docs/design/asc-qa-concept.png` and `docs/design/document-library-concept.png`.
- Do not create commits while the worktree contains unrelated user changes.

---

### Task 1: Test-first application behavior models

**Files:**
- Create: `tests/ascLabExperience.test.js`
- Create: `src/features/navigation/appNavigation.js`
- Create: `src/features/qa/qaDemoModel.js`
- Create: `src/features/library/libraryModel.js`
- Create: `src/features/library/libraryData.js`

**Interfaces:**
- Produces: `primaryNavigation`, `recentConversations`
- Produces: `createQaState()`, `submitQuestion(state, question)`, `completeMockAnswer(state)`, `selectCitation(state, citationId)`, `resetConversation(state)`
- Produces: `documents`, `filterDocuments(documents, filters)`, `addDocumentToQa(documents, documentId)`

- [ ] **Step 1: Write the failing behavior tests**

Test literal route labels and paths, empty-question rejection, answering and evidence opening, citation selection, combined literature filtering, and local QA indexing.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the new feature modules do not exist.

- [ ] **Step 3: Implement the minimal pure models and seed data**

Use immutable return values so Vue components can replace state predictably. Include five realistic refractory-material literature records and three evidence references.

- [ ] **Step 4: Run the new test and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all ASC LAB experience tests pass.

### Task 2: Shared shell and route replacement

**Files:**
- Modify: `src/App.vue`
- Modify: `src/router/index.js`
- Modify: `src/main.js`
- Create: `src/layouts/AscShell.vue`
- Create: `src/components/navigation/AscSidebar.vue`
- Create: `src/components/ui/AscIcon.vue`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/views/AscQaView.vue`
- Create: `src/views/DocumentLibraryView.vue`
- Create: `src/views/KnowledgeView.vue`
- Create: `src/views/DataPlatformView.vue`
- Create: `src/views/ModelsView.vue`

**Interfaces:**
- Consumes: `primaryNavigation`, `recentConversations`
- Produces: routes `/`, `/documents`, `/knowledge`, `/data`, `/models`

- [ ] **Step 1: Add a failing route-contract test**

Extend `tests/ascLabExperience.test.js` to assert the five active route definitions and fallback redirect.

- [ ] **Step 2: Run the route test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the new route definition module is absent.

- [ ] **Step 3: Implement the app shell, route definitions, and global design tokens**

Keep `App.vue` as composition glue. The desktop shell uses a fixed sidebar; responsive behavior uses a navigation drawer.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests pass and Vite emits a production bundle.

### Task 3: QA homepage and evidence interaction

**Files:**
- Modify: `src/views/AscQaView.vue`
- Create: `src/features/qa/QuestionComposer.vue`
- Create: `src/features/qa/ConversationPanel.vue`
- Create: `src/features/qa/EvidencePanel.vue`
- Create: `src/features/qa/TaskShortcuts.vue`

**Interfaces:**
- Consumes: QA model functions from Task 1
- Produces: working empty, loading, answered, evidence-selected, evidence-closed, and reset states

- [ ] **Step 1: Add a failing selector-state test**

Extend the QA model test to prove changing knowledge base, model, framework, reasoning, and ontology values persists through answer completion.

- [ ] **Step 2: Run the selector test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because selector updates are not implemented.

- [ ] **Step 3: Implement selector updates and all QA presentation components**

Use a short deterministic timeout only for the visible generation transition. Inline citation buttons call `selectCitation` and open the evidence rail.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests and build pass.

### Task 4: Literature table, filters, detail rail, and import modal

**Files:**
- Modify: `src/views/DocumentLibraryView.vue`
- Create: `src/features/library/LibraryToolbar.vue`
- Create: `src/features/library/DocumentTable.vue`
- Create: `src/features/library/DocumentDetails.vue`
- Create: `src/features/library/DocumentImportModal.vue`

**Interfaces:**
- Consumes: `documents`, `filterDocuments`, `addDocumentToQa`
- Produces: searchable/filterable table, selected detail rail, simulated imports, local QA-index update

- [ ] **Step 1: Add failing tests for reset and no-result behavior**

Extend the library model test with literal filters that produce one result, zero results, and reset to all five records.

- [ ] **Step 2: Run the library test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because filter normalization/reset behavior is missing.

- [ ] **Step 3: Implement the literature page components**

Keep the table anatomy at desktop width and switch to horizontally scrollable rows plus an overlay detail drawer on small screens.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests and build pass.

### Task 5: Supporting route-complete pages

**Files:**
- Modify: `src/views/KnowledgeView.vue`
- Modify: `src/views/DataPlatformView.vue`
- Modify: `src/views/ModelsView.vue`

**Interfaces:**
- Produces: interactive, production-quality overview states with no backend dependency

- [ ] **Step 1: Implement the three overview pages**

Use shared typography, status rows, tabs, and list selection. Do not add fake generated research results.

- [ ] **Step 2: Run the complete test suite**

Run: `node --test tests/*.test.js`

Expected: all existing and new tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Vite build exits with code 0.

### Task 6: Browser and visual verification

**Files:**
- Create temporarily, then remove: `tmp/qa/*.png`
- Create: `docs/superpowers/verification/2026-07-31-asc-lab-fidelity.md`

**Interfaces:**
- Consumes: running Vite app and both authoritative concept images
- Produces: verified desktop/mobile interaction and a written fidelity ledger

- [ ] **Step 1: Start Vite and open the app in the built-in browser**

Run: `npm run dev -- --host 0.0.0.0`

Verify routes `/`, `/documents`, `/knowledge`, `/data`, `/models`.

- [ ] **Step 2: Verify the core interaction path**

Send the seeded QA question, select `[R2]`, close/reopen evidence, navigate to documents, filter for `SiC`, select the first row, and add it to QA.

- [ ] **Step 3: Capture desktop and mobile screenshots**

Capture QA and literature pages at 1600×1000 and a mobile viewport near 390×844.

- [ ] **Step 4: Compare concept and implementation with `view_image`**

Record at least five comparison points: shell anatomy, copy, typography, palette, table density, evidence/detail rail, and responsive behavior.

- [ ] **Step 5: Fix all material mismatches and repeat verification**

No clipped content, malformed Chinese, inert controls, accidental wrapping, or prototype-looking placeholders may remain.

- [ ] **Step 6: Remove temporary screenshots not referenced by the final verification record**

Keep only the accepted concepts and final verification evidence.
