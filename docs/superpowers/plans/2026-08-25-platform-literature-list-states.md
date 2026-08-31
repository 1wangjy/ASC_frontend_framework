# Platform Literature List States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the data-platform literature list distinct loading, empty-library, filtered-empty, and request-error states with a retry action.

**Architecture:** `DataManagerView.vue` owns request state and determines one exclusive list status in priority order. A small `LiteratureListStatus.vue` component renders the selected status and emits `retry` for the error action, while the existing toolbar and PDF import entry remain outside the status branch.

**Tech Stack:** Vue 3 Composition API, Vite SSR test helper, Node test runner

## Global Constraints

- Modify at most two main frontend code files: `DataManagerView.vue` and one small status component.
- Do not modify 3001, 5001, MongoDB, GridFS, `/documents`, existing literature operations, or dependencies.
- Run only the new focused test and one frontend build.

---

### Task 1: Render the four literature list states

**Files:**
- Create: `src/platform/components/LiteratureListStatus.vue`
- Create: `tests/platformLiteratureListStatus.test.js`

**Interfaces:**
- Consumes: prop `status` with values `loading`, `error`, `empty`, or `no-results`
- Produces: the required Chinese status copy and a `retry` event from the error-state button

- [ ] **Step 1: Write the failing rendering tests**

Create tests that render the component with each status and assert:

```js
assert.match(loadingHtml, /文献加载中\.\.\./)
assert.match(errorHtml, /文献加载失败，请稍后重试/)
assert.match(errorHtml, /重新加载/)
assert.match(emptyHtml, /暂无文献，可通过“导入 PDF”添加第一篇文献/)
assert.match(filteredHtml, /未找到符合当前条件的文献/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/platformLiteratureListStatus.test.js`

Expected: FAIL because `LiteratureListStatus.vue` does not exist.

- [ ] **Step 3: Implement the minimal status component**

Create a component with a `status` prop, mutually exclusive message branches, and this error button:

```vue
<button v-if="status === 'error'" type="button" class="btn btn-secondary btn-small" @click="$emit('retry')">
  重新加载
</button>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/platformLiteratureListStatus.test.js`

Expected: all rendering tests PASS.

### Task 2: Connect request state and retry in DataManagerView

**Files:**
- Modify: `src/platform/views/DataManagerView.vue:82-86,297-407`
- Modify: `tests/platformLiteratureListStatus.test.js`

**Interfaces:**
- Consumes: existing `getAllLiterature()` and `filteredLitData`
- Produces: `isLitLoading`, `litLoadError`, computed `litListStatus`, and `loadLitData()` retry behavior

- [ ] **Step 1: Write a failing integration guard**

Read `DataManagerView.vue` and assert that it imports and renders `LiteratureListStatus`, wires `@retry="loadLitData"`, declares loading/error refs, and selects status in the order loading, error, raw empty, filtered empty.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/platformLiteratureListStatus.test.js`

Expected: FAIL because the view has not connected the new component and request state.

- [ ] **Step 3: Implement the minimal view integration**

Use this state selector:

```js
const litListStatus = computed(() => {
  if (isLitLoading.value) return 'loading'
  if (litLoadError.value) return 'error'
  if (litData.value.length === 0) return 'empty'
  if (filteredLitData.value.length === 0) return 'no-results'
  return ''
})
```

Update `loadLitData()` to clear the old error and set loading before the request, assign rows only after success, record `文献加载失败，请稍后重试` on failure, and clear loading in `finally` while mounted.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/platformLiteratureListStatus.test.js`

Expected: all component and integration guards PASS.

- [ ] **Step 5: Build the frontend**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 6: Review the focused diff**

Run: `git diff -- src/platform/views/DataManagerView.vue src/platform/components/LiteratureListStatus.vue tests/platformLiteratureListStatus.test.js`

Expected: only the four list states, retry wiring, and focused verification are added; existing literature actions remain unchanged.

