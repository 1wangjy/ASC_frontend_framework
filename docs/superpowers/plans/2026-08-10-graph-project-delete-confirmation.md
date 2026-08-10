# Graph Project Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failing browser-native project deletion confirmation with an in-page Vue confirmation layer while preserving the existing backend deletion flow.

**Architecture:** `GraphProjectWorkspaceView.vue` owns the pending project and only calls the existing deletion model after explicit confirmation. A small `GraphProjectDeleteDialog.vue` component renders the warning and emits confirm/cancel events without calling browser-native APIs.

**Tech Stack:** Vue 3 SFC, Node.js built-in test runner, existing `renderSfc` test helper, Vite.

## Global Constraints

- Do not modify backend code, API paths, request payloads, or deletion order.
- Keep `deleteGraphProjectResources`: delete the remote graph first when a graph ID exists, then delete the local project.
- Do not add rename, bulk-delete, or undo behavior.
- A cancelled confirmation must issue no deletion request.

---

### Task 1: In-page project deletion confirmation

**Files:**
- Create: `src/features/projects/GraphProjectDeleteDialog.vue`
- Modify: `src/views/GraphProjectWorkspaceView.vue`
- Modify: `tests/graphProjectWorkspace.test.js`

**Interfaces:**
- Consumes: `projectDeletionMessage(project): string` and the existing `removeProject(item)` deletion behavior.
- Produces: `GraphProjectDeleteDialog` props `{ project: Object, deleting: Boolean }` and events `confirm`, `cancel`.

- [ ] **Step 1: Write the failing tests**

Add component rendering tests which require the selected project name, the active-project warning, confirm/cancel controls, and a source integration assertion that the workspace renders `GraphProjectDeleteDialog` instead of calling `globalThis.confirm`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/graphProjectWorkspace.test.js`

Expected: FAIL because `GraphProjectDeleteDialog.vue` does not exist and the workspace still calls the native confirmation method.

- [ ] **Step 3: Implement the minimal Vue confirmation layer**

Create the dialog component with a fixed overlay, an accessible `role="alertdialog"`, project warning copy, a cancel button, and a destructive confirm button. In the workspace, replace the native confirm call with `pendingDeleteProject`, open it from the list event, close it on cancel, and pass the pending project to the existing asynchronous deletion function only after confirm.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node --test tests/graphProjectWorkspace.test.js
node --test tests/*.test.js
npm run build
git diff --check
```

Expected: all tests pass, Vite production build succeeds, and diff check prints no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/features/projects/GraphProjectDeleteDialog.vue src/views/GraphProjectWorkspaceView.vue tests/graphProjectWorkspace.test.js
git commit -m "fix: confirm graph project deletion in page"
```
