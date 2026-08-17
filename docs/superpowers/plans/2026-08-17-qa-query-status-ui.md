# QA Query Status UI Implementation Plan

**Goal:** Restyle the existing single-turn query status page to match the approved ASC LAB reference without changing any query behavior.

**Architecture:** Keep `AscQaView.vue` as the page compositor and `QaQueryProgress.vue` as the timer/progress presenter. Change only semantic layout wrappers and scoped CSS; continue consuming the existing `qaState`, `buildQaQueryProgress`, router handlers, and graph-task indicator unchanged.

**Tech Stack:** Vue 3, scoped CSS, Node test runner, Vite.

## Global Constraints

- Do not change API requests, routes, timers, progress calculations, step order, or backend code.
- Do not add mock data, dependencies, or hard-coded progress/state values.
- Preserve the current sidebar, top bar, graph selector, return action, and graph-evolution indicator behavior.
- Preserve responsive single-column collapse without horizontal overflow.

### Task 1: Restyle the query status surface

**Files:**
- Modify: `tests/qaRouteQueryLifecycle.test.js`
- Modify: `src/views/AscQaView.vue`
- Modify: `src/features/qa/QaQueryProgress.vue`

**Interfaces:**
- Consumes: `qaState.question`, `qaModeLabel`, `returnToQaHome`, and `buildQaQueryProgress(elapsedMs)`.
- Produces: compact return action, question-summary card, status header, progress bar, and nine status cards using the existing live values.

- [ ] Add a real mounted-page regression asserting compact summary/status structure, all nine steps, and unchanged return behavior.
- [ ] Run the focused test and confirm it fails because the approved semantic structure is absent.
- [ ] Update only the existing template wrappers and scoped styles in `AscQaView.vue` and `QaQueryProgress.vue`.
- [ ] Re-run focused query lifecycle and progress-model tests.
- [ ] Run `npm run build` and visually compare the rendered page with the approved screenshot.

