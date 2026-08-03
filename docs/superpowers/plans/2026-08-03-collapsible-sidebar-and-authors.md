# Collapsible Sidebar and Author Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show at most two literature authors and add a functional desktop sidebar compact mode without changing mobile navigation.

**Architecture:** Author summarization belongs to `libraryModel.js` and is rendered by `DocumentTable.vue`. Desktop collapse state belongs to `AscShell.vue`, is passed into `AscSidebar.vue`, and controls both sidebar width and the shell body margin through matching state classes.

**Tech Stack:** Vue 3, Vue Router, scoped CSS, JavaScript ES modules, Node test runner, Vite, Playwright visual verification.

## Global Constraints

- Expanded sidebar width remains 208px; collapsed width is 72px.
- Collapsed navigation remains usable through icons, labels, titles, and current-route highlighting.
- Mobile at 760px and below keeps the existing drawer interaction.
- Literature shows at most two author names and no remaining-count label.

---

### Task 1: Author summary contract

**Files:**
- Modify: `src/features/library/libraryModel.js`
- Modify: `src/features/library/DocumentTable.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: `summarizeAuthors(authors, visibleCount = 2) -> string`.
- Consumes: each document's `authors: string[]`.

- [ ] **Step 1: Add failing summary tests**

Assert that three names produce `Wang Y., Li J.`, two names produce the same two-name string, and an empty list produces an empty string.

- [ ] **Step 2: Run the focused test**

Run `node --test tests/ascLabExperience.test.js`. Expected: FAIL because `summarizeAuthors` does not exist.

- [ ] **Step 3: Implement and render the summary**

Add `summarizeAuthors` with a minimum visible count of one. In `DocumentTable.vue`, render only `summarizeAuthors(document.authors)` and do not add a remaining-count element.

- [ ] **Step 4: Run the focused test**

Run `node --test tests/ascLabExperience.test.js`. Expected: PASS.

### Task 2: Desktop compact sidebar

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/layouts/AscShell.vue`
- Modify: `src/components/navigation/AscSidebar.vue`
- Modify: `src/components/ui/AscIcon.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- `AscSidebar` consumes `collapsed: boolean` and emits `toggle-collapse`.
- `AscShell` owns `sidebarCollapsed: boolean` and adds `app-shell--sidebar-collapsed`.

- [ ] **Step 1: Add failing source-contract tests**

Read `AscShell.vue` and `AscSidebar.vue`; require the collapsed prop/event, shell collapsed class, a button labelled `收起侧边栏` or `展开侧边栏`, and the 72px token.

- [ ] **Step 2: Run the focused test**

Run `node --test tests/ascLabExperience.test.js`. Expected: FAIL because compact mode is absent.

- [ ] **Step 3: Implement shell state and sidebar presentation**

Add `--asc-sidebar-collapsed-width: 72px`. Pass the state from `AscShell` to `AscSidebar`, toggle it from the sidebar button, update the body margin, and add 180ms width/margin transitions. At desktop widths hide text and recent conversations while centering navigation icons; at mobile widths disable compact styles and hide the desktop toggle.

- [ ] **Step 4: Run the focused test**

Run `node --test tests/ascLabExperience.test.js`. Expected: PASS.

### Task 3: Visual and production verification

**Files:**
- Create: `docs/superpowers/verification/2026-08-03-sidebar-expanded-documents.png`
- Create: `docs/superpowers/verification/2026-08-03-sidebar-collapsed-documents.png`
- Create: `docs/superpowers/verification/2026-08-03-sidebar-collapsed-qa.png`
- Create: `docs/superpowers/verification/2026-08-03-sidebar-mobile.png`
- Create: `docs/superpowers/verification/2026-08-03-sidebar-fidelity-ledger.md`

**Interfaces:**
- Consumes: the running application at `/documents` and `/`.
- Produces: browser evidence for expanded, collapsed, route navigation, and mobile behavior.

- [ ] **Step 1: Verify browser interactions**

At 1600×1000, click the collapse button, verify sidebar width is 72px, body left edge is 72px, labels are hidden, icons remain visible, and navigating between `/documents` and `/` works. Click again and verify 208px restoration. At 390×844, verify the desktop toggle is hidden and the drawer opens from the mobile menu button.

- [ ] **Step 2: Compare screenshots and write the fidelity ledger**

Compare the supplied sidebar reference with the expanded/collapsed browser renders. Record copy, width, icon alignment, current-route highlighting, animation/container behavior, author presentation, and mobile behavior; fix any material mismatch.

- [ ] **Step 3: Run full verification**

Run every `tests/*.test.js` file and `npm run build`. Expected: zero test failures and Vite exit code 0.

- [ ] **Step 4: Commit**

Stage source, tests, plan, screenshots, and ledger; commit with `feat: add compact sidebar and two-author display`.
