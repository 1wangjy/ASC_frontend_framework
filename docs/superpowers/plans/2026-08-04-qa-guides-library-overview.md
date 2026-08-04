# Compact QA Guides and Library Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce each QA category to one refreshable classic question and move the library’s four statistics into a hidden title-level overview popover.

**Architecture:** Keep question sampling in `questionGuideModel` and change only its visible group size. Preserve the library metric calculation, but render it through a focused `LibraryOverviewPopover` component instead of large cards in the document workspace.

**Tech Stack:** Vue 3 Composition API, scoped CSS, Node.js test runner, Vite, Playwright browser verification.

## Global Constraints

- Keep all four QA categories and their independent refresh buttons.
- Render exactly one current question per category.
- Refreshing a category must replace its question without changing other categories.
- Remove the four large document statistic cards from the default page flow.
- Keep all four metrics available behind a “馆藏概览” button beside the page title.
- The overview closes by trigger click, outside click, or Escape and restores focus on keyboard close.
- Desktop, tablet, and mobile layouts must not overflow horizontally.

---

### Task 1: Single-question guide state and compact cards

**Files:**
- Modify: `src/features/qa/questionGuideModel.js`
- Modify: `src/features/qa/TaskShortcuts.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- `createQuestionGuideState(random)` continues returning four category objects, each with `questions: [string]`.
- `refreshQuestionGuide(state, categoryId, random)` changes only the matching category and never repeats its current question.

- [ ] **Step 1: Change the guide tests before production code**

Update the existing three-question assertions to require one literal question per category and add a long-question rendering contract:

```js
test('exposes one classic question for every approved category', () => {
  const state = guides.createQuestionGuideState?.(() => 0)
  assert.equal(state.length, 4)
  state.forEach(category => assert.equal(category.questions.length, 1))
})

test('refreshes one question without changing other categories', () => {
  const state = guides.createQuestionGuideState?.(() => 0)
  const refreshed = guides.refreshQuestionGuide?.(state, 'materials', () => 0)
  assert.notEqual(refreshed[0].questions[0], state[0].questions[0])
  assert.deepEqual(refreshed.slice(1), state.slice(1))
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="one classic question|refreshes one question" tests/ascLabExperience.test.js`.

Expected: FAIL because the model still creates groups of three.

- [ ] **Step 3: Implement the single-question model**

Change `questionGroup(questions, startIndex, count = 3)` to use `count = 1`. Keep the existing non-repeat fallback so a refresh advances to the next question when random selection returns the current one.

- [ ] **Step 4: Compact card CSS**

Reduce `.shortcut` to a target minimum height of 120–130px. Keep the four-column desktop grid and make the single question button reserve two text lines with `-webkit-line-clamp: 2`. Add `:title="question"` to expose the full text.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused tests, then commit:

```powershell
git add src/features/qa/questionGuideModel.js src/features/qa/TaskShortcuts.vue tests/ascLabExperience.test.js
git commit -m "feat: show one classic question per category"
```

---

### Task 2: Accessible library overview popover

**Files:**
- Create: `src/features/library/LibraryOverviewPopover.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes `metrics: Array<{ label: string, value: string|number, note: string }>`.
- Owns open state, outside-pointer close, Escape close, and focus restoration.

- [ ] **Step 1: Write the failing component contract test**

```js
test('library overview provides four hidden metrics and complete close controls', async () => {
  const source = await readFile(
    new URL('../src/features/library/LibraryOverviewPopover.vue', import.meta.url),
    'utf8'
  ).catch(() => '')
  assert.match(source, /馆藏概览/)
  assert.match(source, /aria-expanded/)
  assert.match(source, /pointerdown/)
  assert.match(source, /keydown\.esc/)
  assert.match(source, /trigger\.value\?\.focus/)
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="library overview provides" tests/ascLabExperience.test.js`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component state**

Use `ref`, `onMounted`, `onBeforeUnmount`, and `nextTick`:

```js
const open = ref(false)
const root = ref(null)
const trigger = ref(null)

function closeAndRestoreFocus() {
  if (!open.value) return
  open.value = false
  nextTick(() => trigger.value?.focus())
}

function handleOutsidePointerDown(event) {
  if (open.value && !root.value?.contains(event.target)) open.value = false
}
```

Register and remove the document `pointerdown` listener. Render a subtle trigger beside a 2×2 metric grid. The popover is absolutely positioned, capped to `calc(100vw - 24px)`, and layered above the toolbar.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused test and commit:

```powershell
git add src/features/library/LibraryOverviewPopover.vue tests/ascLabExperience.test.js
git commit -m "feat: add compact library overview popover"
```

---

### Task 3: Replace large library statistics with the title-level overview

**Files:**
- Modify: `src/views/DocumentLibraryView.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- `DocumentLibraryView` continues computing `metrics` from `calculateLibraryMetrics`.
- `LibraryOverviewPopover` receives `:metrics="metrics"` beside the `h1`.
- The view no longer renders or styles `.summary-grid`.

- [ ] **Step 1: Write the failing integration contract**

```js
test('document library hides large metrics behind the title overview', async () => {
  const source = await readFile(
    new URL('../src/views/DocumentLibraryView.vue', import.meta.url),
    'utf8'
  )
  assert.match(source, /LibraryOverviewPopover/)
  assert.match(source, /:metrics="metrics"/)
  assert.doesNotMatch(source, /class="summary-grid"/)
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="hides large metrics" tests/ascLabExperience.test.js`.

Expected: FAIL because the view still renders the four large cards.

- [ ] **Step 3: Integrate the popover**

Wrap the title and overview in `.page-title-row`, import `LibraryOverviewPopover`, place `<LibraryOverviewPopover :metrics="metrics" />` beside the heading, remove the `summary-grid` markup, and delete its CSS. Keep the four-item computed metric array unchanged.

- [ ] **Step 4: Verify GREEN and full regression suite**

Run the focused test followed by `node --test tests/*.test.js`.

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add src/views/DocumentLibraryView.vue tests/ascLabExperience.test.js
git commit -m "feat: move library metrics into overview"
```

---

### Task 4: Build and browser acceptance

**Files:**
- Verify only; modify production code only after adding a failing regression test.

- [ ] **Step 1: Run production verification**

Run `node --test tests/*.test.js`, `npm run build`, `git diff --check`, and `git status --short`.

- [ ] **Step 2: Verify the QA homepage**

At desktop, tablet, and mobile widths, confirm four category cards display one question each, refresh changes only one card, long text does not increase card height, and no horizontal overflow exists.

- [ ] **Step 3: Verify the document library**

Confirm the large metric cards are absent by default; the title-level “馆藏概览” opens four metrics; trigger click, outside click, and Escape close it; and mobile width does not overflow.

- [ ] **Step 4: Capture and report**

Save screenshots of both pages and report exact test count, build result, browser checks, commit, and branch state.
