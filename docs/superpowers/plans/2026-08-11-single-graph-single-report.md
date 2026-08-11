# Single Graph Single Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the frontend from regenerating a completed report and always reopen the existing report for the current simulation.

**Architecture:** Add a small pure report-generation model for payload and existing-report decisions. Keep the API boundary non-overridable, then wire Step3 to check and reuse the existing report before exposing the generation action.

**Tech Stack:** Vue 3, Vue Router, Axios, Node test runner.

## Global Constraints

- Modify frontend files only.
- One completed report per simulation; completed reports cannot be regenerated.
- Failed generation may be retried.
- Do not add a second QA implementation in this task.

---

### Task 1: Single-report request contract

**Files:**
- Create: `src/features/reports/singleReportModel.js`
- Modify: `src/api/report.js`
- Test: `tests/singleReportFlow.test.js`

**Interfaces:**
- Produces: `buildSingleReportGenerationPayload(simulationId)` and `completedReportFromStatus(response)`.
- Consumes: existing Axios `service` instance.

- [x] Write failing tests proving `force_regenerate` is always false and only a completed report is reusable.
- [x] Run `node --test tests/singleReportFlow.test.js` and record the expected module-not-found failure.
- [x] Implement the pure model and the report-status API wrapper.
- [x] Run the focused test and verify it passes.

### Task 2: Step3 UI and action guard

**Files:**
- Modify: `src/components/Step3Simulation.vue`
- Test: `tests/singleReportFlow.test.js`

**Interfaces:**
- Consumes: `checkReportForSimulation(simulationId)` and the pure model from Task 1.
- Produces: existing-report button state and no-POST navigation to `Report`.

- [x] Add a failing source-contract test for initial status check, existing-report navigation, and removal of `force_regenerate: true`.
- [x] Run the focused test and verify the expected failure.
- [x] Implement the smallest Step3 changes.
- [x] Run focused tests, all tests, `npm run build`, and `git diff --check`.
