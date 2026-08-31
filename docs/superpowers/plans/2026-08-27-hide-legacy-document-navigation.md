# Hide Legacy Document Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the legacy `/documents` entry from the sidebar while preserving the legacy route and the current 3001 literature-to-5001 graph build bridge.

**Architecture:** `AscSidebar.vue` renders `primaryNavigation`, so the behavior change belongs in `appNavigation.js`. The `/documents` route, legacy page files, PDF library adapter, workflow selection model, and graph bridge remain untouched in this phase.

**Tech Stack:** Vue 3, Vue Router, Node.js test runner, Vite.

## Global Constraints

- Do not remove the `/documents` route in this phase.
- Do not delete legacy page files in this phase.
- Do not modify 3001, 5001, MongoDB, GridFS, or `/api/pdf-library/*`.
- Preserve `src/platform/services/graphDocumentBridge.js` and all of its imports.

---

### Task 1: Hide the legacy sidebar destination

**Files:**
- Modify: `src/features/navigation/appNavigation.js`
- Test: `tests/sidebarDocumentNavigationRemoval.test.js`

**Interfaces:**
- Consumes: `primaryNavigation` and `ascRouteDefinitions`.
- Produces: a sidebar navigation list without `/documents`, while the `Documents` route and graph bridge remain available.

- [ ] **Step 1: Write the failing focused test**

Assert that `primaryNavigation` excludes `/documents`, `ascRouteDefinitions` still includes the `Documents` route, and `prepareDocumentsForGraph` remains importable.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sidebarDocumentNavigationRemoval.test.js`

Expected: FAIL because `primaryNavigation` still contains `/documents`.

- [ ] **Step 3: Remove only the navigation item**

Delete `{ label: '文献管理', path: '/documents', icon: 'document' }` from `primaryNavigation` without changing any route or bridge file.

- [ ] **Step 4: Verify the focused behavior and build**

Run: `node --test tests/sidebarDocumentNavigationRemoval.test.js tests/platformGraphDocumentBridge.test.js`

Run: `npm run build`

Expected: all focused tests pass and Vite exits with code 0.

