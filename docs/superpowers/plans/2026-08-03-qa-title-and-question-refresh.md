# QA Title and Question Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the QA hero title, increase classic-question readability, and restore per-card three-question refresh.

**Architecture:** Keep question pools and deterministic group rotation in `questionGuideModel.js`; keep `TaskShortcuts.vue` limited to rendering and events; keep `AscQaView.vue` as the state owner. Styling remains component-scoped and reuses the existing ASC tokens.

**Tech Stack:** Vue 3 Composition API, JavaScript ES modules, Node built-in test runner, Vite.

## Global Constraints

- Each category owns at least six classic questions but displays exactly three.
- Refresh changes only the selected category and must produce a visibly different three-question group.
- Clicking a question fills the composer without sending.
- Desktop remains four equal columns; mobile remains one column without horizontal overflow.
- Do not add external font or icon dependencies.

---

### Task 1: Question group rotation behavior

**Files:**
- Modify: `src/features/qa/questionGuideModel.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- `createQuestionGuideState(random = Math.random): Guide[]`
- `refreshQuestionGuide(state, categoryId, random = Math.random): Guide[]`
- `Guide.questions` is always a three-string array.

- [ ] **Step 1: Write failing tests**

```js
test('refreshes one three-question group without changing the other categories', () => {
  const initial = guides.createQuestionGuideState(() => 0)
  const refreshed = guides.refreshQuestionGuide(initial, 'processing', () => 0)
  assert.notDeepEqual(refreshed[1].questions, initial[1].questions)
  assert.equal(refreshed[0], initial[0])
  assert.equal(refreshed[2], initial[2])
  assert.equal(refreshed[3], initial[3])
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test --test-name-pattern="refreshes one three-question group" tests/ascLabExperience.test.js`

Expected: FAIL because `refreshQuestionGuide` is not exported.

- [ ] **Step 3: Implement six-question pools and circular three-question selection**

Use one sampled start index per category and take three consecutive questions with wraparound. During refresh, if sampling reproduces the current group, advance the start index by one.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all tests pass.

### Task 2: Refresh control and typography polish

**Files:**
- Modify: `src/features/qa/TaskShortcuts.vue`
- Modify: `src/views/AscQaView.vue`

**Interfaces:**
- `TaskShortcuts` emits `refresh` with the category id.
- `AscQaView` updates `questionGuides.value` through `refreshQuestionGuide`.

- [ ] **Step 1: Restore the card-header refresh button**

Add the existing `AscIcon name="refresh"` as a 28 px button aligned to the header's right edge. Its accessible label is `刷新<类别名称>经典问题`.

- [ ] **Step 2: Connect view state**

Make `questionGuides` a `ref`, handle the `refresh` event, and recreate randomized groups when the QA page resets.

- [ ] **Step 3: Apply typography values**

Set the hero title to the approved Chinese serif stack, relaxed tracking, and 700 weight. Set category titles to 13 px and classic questions to 12 px with the deeper text color `#4f687d`; increase card and row minimum heights proportionally.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: Vite exits with code 0.

### Task 3: Visual and final verification

**Files:**
- Add verification screenshot under `docs/superpowers/verification/`.

- [ ] **Step 1: Run all tests**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 2: Verify browser behavior**

At 1600×1000 verify computed title font is serif, each card has three 12 px questions, refresh changes only one card, and all four cards remain one row. At 390×844 verify one column and no horizontal overflow.

- [ ] **Step 3: Compare screenshots and commit**

Use `view_image` on the user's title reference and latest screenshot, then commit the model, component, view, test, and verification evidence.
