# Graph Task Status Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global graph-task indicator compact, explicitly collapsible, internally scrollable, and free of the redundant QA-home shortcut.

**Architecture:** Keep the existing monitor-owned state and component-local expanded state. Change only presentation and shell event wiring; task-specific navigation remains unchanged.

**Tech Stack:** Vue 3 SFC, Node test runner, Vite.

## Global Constraints

- Do not modify backend code.
- Keep project-specific progress and QA actions.
- Preserve keyboard and mobile behavior.

---

### Task 1: Indicator presentation and shell wiring

**Files:**
- Modify: `tests/globalGraphTaskIndicator.test.js`
- Modify: `src/features/tasks/GlobalGraphTaskIndicator.vue`
- Modify: `src/layouts/AscShell.vue`

**Interfaces:**
- Consumes: existing graph task monitor items and connection state.
- Produces: `refresh`, `view-project`, and `open-qa` component events only.

- [x] **Step 1: Write the failing tests**

Assert that the source and SSR output contain `图谱任务状态`, expose an active-count badge and internal scrolling, and no longer contain `open-qa-home`, `graph-task-indicator__qa-home`, or the shell `openQaHome` handler.

- [x] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/globalGraphTaskIndicator.test.js`

Expected: failures for the old trigger copy and QA-home wiring.

- [x] **Step 3: Implement the minimal component and shell changes**

Render fixed trigger copy plus a conditional count badge, remove the redundant button/event/handler, retain click/close/Escape toggling, and give the popover/list explicit viewport-bounded internal overflow styling.

- [x] **Step 4: Run focused and full verification**

Run:

```powershell
node --test tests/globalGraphTaskIndicator.test.js
node --test tests/*.test.js
npm run build
git diff --check
```

Expected: all tests pass, the build exits zero, and diff-check produces no output.

- [x] **Step 5: Commit**

```powershell
git add tests/globalGraphTaskIndicator.test.js src/features/tasks/GlobalGraphTaskIndicator.vue src/layouts/AscShell.vue docs/superpowers/specs/2026-08-10-graph-task-status-indicator-design.md docs/superpowers/plans/2026-08-10-graph-task-status-indicator.md
git commit -m "fix: simplify graph task status indicator"
```
