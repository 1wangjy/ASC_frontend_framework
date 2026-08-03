# Stable Library Composition Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rolling-year library metrics with stable academic-paper and professional-resource counts.

**Architecture:** Keep `calculateLibraryMetrics(documents)` as the single source of computed card values. Classify `journal` and `conference` as academic papers and calculate professional resources as the complement, then map those values to the four existing summary cards in `DocumentLibraryView.vue`.

**Tech Stack:** Vue 3 Composition API, JavaScript ES modules, Node built-in test runner, Vite 7.

## Global Constraints

- The four card labels are exactly `文献总数`, `专家精选`, `学术论文`, `专业资料`.
- `academicPapers` counts `type === 'journal' || type === 'conference'`.
- `professionalResources` equals `total - academicPapers` so every record belongs to exactly one composition group.
- Do not display rolling-year, parsing, QA-index, or coverage-year metrics.
- Keep the current four-column and responsive two-column card layout.

---

### Task 1: Stable Composition Metric Model and Cards

**Files:**
- Modify: `src/features/library/libraryModel.js`
- Modify: `src/views/DocumentLibraryView.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: document records with `type` and `expertSelected`.
- Produces: `calculateLibraryMetrics(documents)` returning `{ total, expertSelected, academicPapers, professionalResources }`.
- The view consumes the four returned fields without recalculating document types.

- [ ] **Step 1: Replace rolling-year tests with failing composition tests**

Update the current library metric assertions to:

```js
test('calculates stable library composition metrics', () => {
  assert.deepEqual(library.calculateLibraryMetrics?.(libraryData.documents), {
    total: 5,
    expertSelected: 3,
    academicPapers: 4,
    professionalResources: 1
  })
})

test('counts conference papers with journals and keeps all other records complementary', () => {
  const fixtures = [
    { type: 'journal', expertSelected: false },
    { type: 'conference', expertSelected: true },
    { type: 'book', expertSelected: false },
    { type: 'standard', expertSelected: false },
    { type: '', expertSelected: false }
  ]
  assert.deepEqual(library.calculateLibraryMetrics?.(fixtures), {
    total: 5,
    expertSelected: 1,
    academicPapers: 2,
    professionalResources: 3
  })
})

test('library composition metrics have zero-valued empty state', () => {
  assert.deepEqual(library.calculateLibraryMetrics?.([]), {
    total: 0,
    expertSelected: 0,
    academicPapers: 0,
    professionalResources: 0
  })
})
```

Update the view-source test to require `学术论文`, `专业资料`, `期刊论文 + 会议论文`, and `专著、标准、专利等`, while rejecting `近三年文献`, `近年文献`, `覆盖年份`, `完成解析`, and `进入 QA 索引`.

- [ ] **Step 2: Run the focused tests and verify expected failure**

Run: `node --test --test-name-pattern="stable library composition|conference papers|zero-valued empty state|retrieval-oriented metrics" tests/ascLabExperience.test.js`

Expected: FAIL because the model still returns rolling-year fields and the view still displays rolling-year cards.

- [ ] **Step 3: Implement the minimal stable classifier**

Replace the year-based logic in `calculateLibraryMetrics` with:

```js
export function calculateLibraryMetrics(documents = []) {
  const academicPapers = documents.filter(document => (
    document.type === 'journal' || document.type === 'conference'
  )).length

  return {
    total: documents.length,
    expertSelected: documents.filter(document => document.expertSelected).length,
    academicPapers,
    professionalResources: documents.length - academicPapers
  }
}
```

- [ ] **Step 4: Map the new metrics into the existing four cards**

Keep the first two cards. Replace the last two with:

```js
{ label: '学术论文', value: counts.academicPapers, note: '期刊论文 + 会议论文', success: true },
{ label: '专业资料', value: counts.professionalResources, note: '专著、标准、专利等', success: false }
```

Remove the last-card long-value font override because every main value is numeric again.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Run production build and browser verification**

Run: `npm run build`

Expected: Vite exits 0. In `/documents`, verify card labels are `文献总数 / 专家精选 / 学术论文 / 专业资料`, current values are `5 / 3 / 4 / 1`, the detail sidebar may remain open, and the page has no horizontal overflow.

- [ ] **Step 7: Commit**

```bash
git add src/features/library/libraryModel.js src/views/DocumentLibraryView.vue tests/ascLabExperience.test.js
git commit -m "feat: show stable library composition metrics"
```

