# Literature Metadata Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove answer-evaluation concepts from literature records while retaining a clear curated-literature indicator.

**Architecture:** `DocumentTable.vue` owns the table presentation and will expose only bibliographic fields. `libraryData.js` remains the demo data source but will no longer contain literature score, display status, or display update-time fields; internal parsing and QA-index flags remain for aggregate metrics.

**Tech Stack:** Vue 3 single-file components, JavaScript ES modules, Node test runner, Vite.

## Global Constraints

- Literature has no expert score.
- `expertSelected` is a boolean curated-literature property, not a score.
- Expert and LLM evaluation of model answers is outside this change.
- `parsingStatus` and `qaIndexed` remain internal inputs for dynamic summary metrics.

---

### Task 1: Lock the literature metadata contract

**Files:**
- Modify: `tests/ascLabExperience.test.js`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: `libraryData.documents` and the source of `DocumentTable.vue`.
- Produces: A regression contract forbidding `expertScore`, `statusLabel`, and `updatedAt`, and requiring the curated badge binding.

- [ ] **Step 1: Write the failing test**

Add a test that reads `DocumentTable.vue`, rejects the three removed column labels and bindings, requires `document.expertSelected`, and checks that every seed document omits the three deleted properties.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the table and seed data still contain the removed literature properties.

### Task 2: Correct table presentation and seed data

**Files:**
- Modify: `src/features/library/DocumentTable.vue`
- Modify: `src/features/library/libraryData.js`
- Modify: `src/features/library/libraryModel.js`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: `document.expertSelected`, `document.parsingStatus`, and `document.qaIndexed`.
- Produces: A seven-column literature table and score-free demo records.

- [ ] **Step 1: Implement the minimal table change**

Delete the expert-score, processing-status, and update-time headers and cells. Place a conditional `精选` badge beside the document title and remove obsolete score/status styles. Reduce the table minimum width, widen the author/title/DOI columns, raise body and header text to about 12px, raise secondary text and tags to about 10px, and add vertical cell padding.

- [ ] **Step 2: Remove invalid demo fields**

Delete `expertScore`, `statusLabel`, and `updatedAt` from every seed document. Update `addDocumentToQa()` so it changes only `qaIndexed`.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all focused tests PASS.

### Task 3: Verify behavior and presentation

**Files:**
- Create: `docs/superpowers/verification/2026-08-03-library-metadata-correction-desktop.png`
- Create: `docs/superpowers/verification/2026-08-03-library-metadata-correction-mobile.png`

**Interfaces:**
- Consumes: the built Vue application at `/documents`.
- Produces: visual evidence for desktop and compact layouts.

- [ ] **Step 1: Run all automated tests**

Run all `tests/*.test.js` files with Node's test runner. Expected: zero failures.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Capture and inspect both layouts**

Open `/documents` at 1600×1000 and 390×844. Confirm the three columns are absent, curated documents show `精选`, bibliographic columns remain readable, and no horizontal page overflow is introduced.

- [ ] **Step 4: Commit the implementation**

Stage the source, test, plan, and verification images, then commit with `fix: remove scoring fields from literature`.
