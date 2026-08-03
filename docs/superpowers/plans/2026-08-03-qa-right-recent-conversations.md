# QA Right-Side Recent Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recent conversations out of the left navigation and into a quiet, expandable panel on the right side of the QA homepage.

**Architecture:** Conversation records remain in the navigation feature. A pure helper model handles three-item truncation and ID lookup, a focused Vue component owns the expand/collapse UI, and `AscQaView` owns route navigation and visibility beside the evidence report.

**Tech Stack:** Vue 3 Composition API, Vue Router, scoped CSS, Node.js test runner, Vite.

## Global Constraints

- Desktop panel: no background, border, or shadow.
- Default visible count: exactly 3.
- Show “查看更多历史” only when more than 3 records exist.
- Expanded history uses a maximum height and internal scroll.
- Hide the panel while the evidence evaluation report is open.
- Reuse the existing conversation route query; add no backend dependency.
- Keep keyboard support, `aria-expanded`, and full titles for truncated text.

---

### Task 1: Conversation model and records

**Files:**
- Create: `src/features/navigation/recentConversationModel.js`
- Modify: `src/features/navigation/appNavigation.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces `DEFAULT_VISIBLE_CONVERSATIONS = 3`.
- Produces `getVisibleRecentConversations(conversations, expanded, limit)`.
- Produces `findRecentConversation(conversations, conversationId)`.
- Adds a `question` field to each recent-conversation record.

- [ ] **Step 1: Write failing tests**

```js
const recentConversation = await import(
  '../src/features/navigation/recentConversationModel.js'
).catch(() => ({}))

test('shows three recent conversations by default and all after expansion', () => {
  const records = navigation.recentConversations
  assert.equal(records.length > 3, true)
  assert.deepEqual(
    recentConversation.getVisibleRecentConversations?.(records, false),
    records.slice(0, 3)
  )
  assert.deepEqual(
    recentConversation.getVisibleRecentConversations?.(records, true),
    records
  )
})

test('finds the restorable question for a recent conversation', () => {
  const record = recentConversation.findRecentConversation?.(
    navigation.recentConversations,
    'oxidation'
  )
  assert.match(record.question, /抗氧化剂/)
  assert.equal(recentConversation.findRecentConversation?.([], 'missing'), null)
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="recent conversation|three recent" tests/ascLabExperience.test.js`.

Expected: FAIL because the model and more-than-three records do not exist.

- [ ] **Step 3: Implement the pure model**

```js
export const DEFAULT_VISIBLE_CONVERSATIONS = 3

export function getVisibleRecentConversations(
  conversations = [],
  expanded = false,
  limit = DEFAULT_VISIBLE_CONVERSATIONS
) {
  return expanded ? [...conversations] : conversations.slice(0, limit)
}

export function findRecentConversation(conversations = [], conversationId = '') {
  return conversations.find(item => item.id === conversationId) ?? null
}
```

Extend `recentConversations` to six ASC records. Preserve the existing three IDs and titles, add a `question` to every record, then add phase-design, preparation, and characterization examples.

- [ ] **Step 4: Verify GREEN**

Repeat the focused test command. Expected: both tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/navigation/recentConversationModel.js src/features/navigation/appNavigation.js tests/ascLabExperience.test.js
git commit -m "feat: model expandable recent conversations"
```

---

### Task 2: Quiet expandable panel

**Files:**
- Create: `src/features/qa/RecentConversationsPanel.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes `conversations: Array<{ id, title, question }>`.
- Emits `select` with the chosen conversation.
- Owns desktop expansion and compact-popover state.

- [ ] **Step 1: Write the failing source contract test**

```js
test('recent conversations panel provides quiet expandable history controls', async () => {
  const source = await readFile(
    new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url),
    'utf8'
  )
  assert.match(source, /最近会话/)
  assert.match(source, /查看更多历史/)
  assert.match(source, /收起历史/)
  assert.match(source, /aria-expanded/)
  assert.match(source, /getVisibleRecentConversations/)
  assert.match(source, /text-overflow:\s*ellipsis/)
  assert.match(source, /overflow-y:\s*auto/)
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="quiet expandable history" tests/ascLabExperience.test.js`.

Expected: FAIL because the component file is missing.

- [ ] **Step 3: Implement the component**

Use this state boundary:

```js
const props = defineProps({ conversations: { type: Array, default: () => [] } })
const emit = defineEmits(['select'])
const expanded = ref(false)
const compactOpen = ref(false)
const visibleConversations = computed(() => (
  getVisibleRecentConversations(props.conversations, expanded.value)
))
const hasMore = computed(() => (
  props.conversations.length > DEFAULT_VISIBLE_CONVERSATIONS
))
```

Render each title as a button with `:title="conversation.title"`. Emit `select` when clicked. The expansion button binds `:aria-expanded="expanded"`. Desktop CSS has no panel fill, border, or shadow; the expanded list has `max-height` and `overflow-y: auto`. At narrower breakpoints show one compact entry button and a small popover list.

- [ ] **Step 4: Verify GREEN**

Repeat the focused component test. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/qa/RecentConversationsPanel.vue tests/ascLabExperience.test.js
git commit -m "feat: add quiet recent conversation panel"
```

---

### Task 3: Integrate the panel and remove sidebar history

**Files:**
- Modify: `src/components/navigation/AscSidebar.vue`
- Modify: `src/layouts/AscShell.vue`
- Modify: `src/views/AscQaView.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- `AscQaView` consumes `recentConversations`, `findRecentConversation`, and the panel’s `select` event.
- Removes sidebar event `open-conversation` and the corresponding shell handler.

- [ ] **Step 1: Write the failing integration test**

```js
test('QA owns recent conversations and hides them beside evidence', async () => {
  const [view, sidebar, shell] = await Promise.all([
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/navigation/AscSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')
  ])
  assert.match(view, /RecentConversationsPanel/)
  assert.match(view, /v-if="!qaState\.evidenceOpen"/)
  assert.match(view, /findRecentConversation/)
  assert.doesNotMatch(sidebar, /最近会话|recentConversations|open-conversation/)
  assert.doesNotMatch(shell, /open-conversation|openConversation/)
})
```

- [ ] **Step 2: Verify RED**

Run `node --test --test-name-pattern="QA owns recent conversations" tests/ascLabExperience.test.js`.

Expected: FAIL because the sidebar still owns the list.

- [ ] **Step 3: Remove the left-sidebar implementation**

Delete the recent section and related styles/imports/emits from `AscSidebar.vue`. Delete `@open-conversation` and `openConversation()` from `AscShell.vue`.

- [ ] **Step 4: Integrate into `AscQaView`**

Render the component beside `<main>` only when evidence is closed:

```vue
<RecentConversationsPanel
  v-if="!qaState.evidenceOpen"
  :conversations="recentConversations"
  @select="openConversation"
/>
```

Use the current query route and reload when the same history entry is clicked:

```js
function openConversation(conversation) {
  if (route.query.conversation === conversation.id) {
    loadConversation(conversation)
    return
  }
  router.push({ path: '/', query: { conversation: conversation.id } })
}

function loadConversation(conversation) {
  reset()
  draft.value = conversation.question
  sendQuestion()
}
```

Replace the current nested watcher conditional with `findRecentConversation`. Add a `qa-layout--recent` desktop grid column of 160–180px and collapse it to one column at the panel’s compact breakpoint.

- [ ] **Step 5: Verify GREEN and full regression suite**

Run the focused test, then `node --test tests/*.test.js`.

Expected: the focused test and the full suite PASS with zero failures.

- [ ] **Step 6: Commit**

```powershell
git add src/components/navigation/AscSidebar.vue src/layouts/AscShell.vue src/views/AscQaView.vue tests/ascLabExperience.test.js
git commit -m "feat: move recent conversations into QA"
```

---

### Task 4: Production and visual verification

**Files:**
- Verification only; change production code only after adding a failing regression test.

- [ ] **Step 1: Build**

Run `npm run build`. Expected: Vite exits with code 0.

- [ ] **Step 2: Check patch hygiene**

Run `git diff --check` and `git status --short`. Expected: no whitespace errors or unintended files.

- [ ] **Step 3: Browser acceptance**

At `http://127.0.0.1:4173/`, verify:

1. Left navigation has no recent-conversation block.
2. Right side initially shows three background-free titles.
3. “查看更多历史” expands and “收起历史” collapses the list.
4. Long titles truncate without widening the rail.
5. Clicking an item loads its own saved question.
6. Opening evidence removes the right rail.
7. Narrow and mobile layouts do not overlap the composer.

- [ ] **Step 4: Report evidence**

Capture a desktop screenshot and report the exact test count, build result, responsive result, and branch state.
