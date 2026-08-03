# Library Metrics, Multi-Year Filters, and Question Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make library metrics data-driven, support multi-year literature filtering, and show three clickable classic questions in each QA category card.

**Architecture:** Keep domain behavior in the existing pure model modules and keep Vue components responsible for rendering and emitting patches. The document view derives metrics and filtered rows from the same reactive document collection; the QA view renders the fixed question arrays already owned by the guide model.

**Tech Stack:** Vue 3 Composition API, JavaScript ES modules, Node built-in test runner, Vite.

## Global Constraints

- Multiple selected years use OR; keyword and type filters combine with the selected years using AND.
- “全部” clears all year selections; “更早” remains a selectable partition.
- Each of the four QA categories shows exactly three classic questions.
- Clicking a classic question fills the composer without submitting.
- Desktop keeps four equal-width cards; tablet uses two columns; mobile uses one column.
- Do not add backend dependencies or alter graph behavior.

---

### Task 1: Library metrics and multi-year domain behavior

**Files:**
- Modify: `src/features/library/libraryModel.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: `createLibraryFilters(): { query: string, type: string, yearPartitions: string[] }`
- Produces: `toggleYearPartition(selected: string[], partition: string): string[]`
- Produces: `calculateLibraryMetrics(documents): { total: number, expertSelected: number, parsed: number, qaIndexed: number }`
- Updates: `filterDocuments(documents, filters)` accepts `filters.yearPartitions`.

- [ ] **Step 1: Write failing tests**

Add tests with hand-derived expectations:

```js
test('combines multiple selected years with OR and keyword with AND', () => {
  const result = library.filterDocuments(libraryData.documents, {
    query: 'ASC',
    type: '',
    yearPartitions: ['2024', '2023']
  })
  assert.deepEqual(result.map(item => item.id), ['DOC-2024-001', 'DOC-2023-002'])
})

test('calculates all four library counters from document state', () => {
  assert.deepEqual(library.calculateLibraryMetrics(libraryData.documents), {
    total: 5,
    expertSelected: 3,
    parsed: 4,
    qaIndexed: 3
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: failures because `calculateLibraryMetrics` is missing and multi-year values are not handled.

- [ ] **Step 3: Implement minimal pure functions**

Use immutable array toggling and match any selected partition:

```js
export function toggleYearPartition(selected = [], partition) {
  return selected.includes(partition)
    ? selected.filter(item => item !== partition)
    : [...selected, partition]
}

export function calculateLibraryMetrics(documents = []) {
  return {
    total: documents.length,
    expertSelected: documents.filter(item => item.expertSelected).length,
    parsed: documents.filter(item => item.parsingStatus !== 'parsing').length,
    qaIndexed: documents.filter(item => item.qaIndexed).length
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all tests pass.

### Task 2: Multi-year toolbar and live metrics rendering

**Files:**
- Modify: `src/features/library/LibraryToolbar.vue`
- Modify: `src/views/DocumentLibraryView.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: `filters.yearPartitions`, `toggleYearPartition`, `calculateLibraryMetrics`.
- Emits: `update:filters` patches with a complete immutable `yearPartitions` array.

- [ ] **Step 1: Add a failing reset-state assertion**

```js
assert.deepEqual(library.createLibraryFilters(), {
  query: '',
  type: '',
  yearPartitions: []
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: the reset shape still contains the old single-value field.

- [ ] **Step 3: Update toolbar and view**

Render each selected year as active, toggle it independently, and let “全部” emit an empty array. Replace static metrics with a computed mapping from `calculateLibraryMetrics(documentRows.value)`. Watch a stable joined year key so changing selections returns pagination to page 1.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all tests pass.

### Task 3: Three-question category cards

**Files:**
- Modify: `src/features/qa/questionGuideModel.js`
- Modify: `src/features/qa/TaskShortcuts.vue`
- Modify: `src/views/AscQaView.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- `createQuestionGuideState()` returns each category with `questions: string[3]`.
- `TaskShortcuts` emits `select` with one clicked question string.

- [ ] **Step 1: Replace the single-question expectation with a failing list expectation**

```js
test('exposes three classic questions for every approved category', () => {
  const state = guides.createQuestionGuideState()
  assert.equal(state.length, 4)
  assert.equal(state.every(item => item.questions.length === 3), true)
  assert.equal(state[0].questions[0], 'ASC 各组分分别起什么作用？')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: guides only expose a single `question` field.

- [ ] **Step 3: Implement the list model and presentation**

Copy each category's three-question array into guide state. Remove refresh state and handlers. Render a category header followed by three borderless buttons with small dot markers; each button emits its own text. Use four columns on desktop, two below 1050 px, and one below 560 px.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all tests pass.

### Task 4: Full verification

**Files:**
- Modify if needed: files from Tasks 1–3 only.

- [ ] **Step 1: Run complete automated tests**

Run: `node --test tests/*.test.js`

Expected: zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Visual verification**

Open `/` and `/documents` at 1600×1000 and 390×844. Verify four equal desktop cards, three readable question rows per card, multi-selected years, live metric values, and no mobile horizontal overflow.

- [ ] **Step 4: Commit implementation**

```bash
git add src/features/library/libraryModel.js src/features/library/LibraryToolbar.vue src/views/DocumentLibraryView.vue src/features/qa/questionGuideModel.js src/features/qa/TaskShortcuts.vue src/views/AscQaView.vue tests/ascLabExperience.test.js
git commit -m "feat: add live library filters and question lists"
```
