# ASC LAB Three-Page Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the ASC LAB QA homepage, literature library, and knowledge-graph flow to match the approved 2026-08-03 design specification.

**Architecture:** Keep the existing Vue 3/Vite shell and split behavior into pure JavaScript models that can be exercised with Node's test runner. Vue components remain presentation-focused; the knowledge-graph launch function uses a local explorer fallback until the backend returns a validated redirect URL.

**Tech Stack:** Vue 3, Vue Router 4, Vite 7, Node test runner, SVG, CSS

## Global Constraints

- Modify only `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`.
- Treat `docs/superpowers/specs/2026-08-03-asc-lab-three-page-refinement-design.md` as authoritative.
- Do not modify the backend or `D:\ASC-platform-master` reference project.
- Do not delete legacy workflow files.
- Do not add runtime dependencies.
- Keep all model providers domestic and display every option as `LLM · Version`.
- Use test-first red-green-refactor for every new behavior.
- Preserve the existing staged ASC LAB files and commit only explicitly listed paths.
- Verify desktop and approximately 390px-wide mobile layouts before handoff.

---

### Task 1: QA settings and question-guide behavior

**Files:**
- Modify: `tests/ascLabExperience.test.js`
- Modify: `src/features/qa/qaDemoModel.js`
- Create: `src/features/qa/questionGuideModel.js`

**Interfaces:**
- Produces: `domesticModelOptions`, `frameworkOptions`, `reasoningOptions`
- Produces: `updateQaSettings(state, patch)` with the NEXUS/ontology invariant
- Produces: `questionCategories`, `createQuestionGuideState(random)`, `refreshQuestionGuide(state, categoryId, random)`

- [ ] **Step 1: Write failing QA setting tests**

Add literal behavior tests:

```js
test('offers domestic LLM and version pairs with DeepSeek V4 Flash as default', () => {
  const state = qa.createQaState()
  assert.equal(state.settings.model, 'DeepSeek · V4 Flash')
  assert.deepEqual(qa.domesticModelOptions, [
    'DeepSeek · V4 Flash',
    'DeepSeek · V4 Pro',
    '通义千问 · Qwen 3.7 Plus',
    '通义千问 · Qwen 3.7 Max',
    'ASC Local · V1.0'
  ])
})

test('NEXUS forces ontology on and locks it until Hybrid RAG is restored', () => {
  const nexus = qa.updateQaSettings(qa.createQaState(), { framework: 'NEXUS', ontologyEnabled: false })
  assert.equal(nexus.settings.ontologyEnabled, true)
  assert.equal(nexus.settings.ontologyLocked, true)

  const hybrid = qa.updateQaSettings(nexus, { framework: 'Hybrid RAG' })
  assert.equal(hybrid.settings.ontologyEnabled, true)
  assert.equal(hybrid.settings.ontologyLocked, false)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the domestic options and ontology lock do not exist.

- [ ] **Step 3: Implement the minimal settings invariant**

Export the three option arrays. Change defaults to:

```js
{
  model: 'DeepSeek · V4 Flash',
  framework: 'Hybrid RAG',
  reasoning: 'Auto',
  ontologyEnabled: true,
  ontologyLocked: false
}
```

Remove `knowledgeBase`. In `updateQaSettings`, calculate the next framework first; when it is `NEXUS`, force both `ontologyEnabled: true` and `ontologyLocked: true`; otherwise set `ontologyLocked: false`.

- [ ] **Step 4: Write failing question-guide tests**

```js
test('initializes one question from each of the four approved categories', () => {
  const state = guides.createQuestionGuideState(() => 0)
  assert.deepEqual(state.map(item => item.id), [
    'materials', 'processing', 'characterization', 'service'
  ])
  assert.equal(state[0].question, 'ASC 各组分分别起什么作用？')
})

test('refreshing one guide never changes the other three guides', () => {
  const initial = guides.createQuestionGuideState(() => 0)
  const refreshed = guides.refreshQuestionGuide(initial, 'processing', () => 0.99)
  assert.equal(refreshed[0], initial[0])
  assert.notEqual(refreshed[1].question, initial[1].question)
  assert.equal(refreshed[2], initial[2])
  assert.equal(refreshed[3], initial[3])
})
```

- [ ] **Step 5: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because `questionGuideModel.js` is absent.

- [ ] **Step 6: Implement the four category pools**

Each category contains an `id`, title, icon, backend category names, and at least three concise questions. Selection uses `Math.floor(random() * pool.length)`. Refresh selects a different question when the pool has more than one entry and returns the original object references for all untouched categories.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all QA and guide model tests pass.

- [ ] **Step 8: Commit the behavior layer**

```powershell
git add tests/ascLabExperience.test.js src/features/qa/qaDemoModel.js src/features/qa/questionGuideModel.js
git commit -m "feat: refine ASC QA controls and question guides"
```

### Task 2: QA homepage presentation

**Files:**
- Modify: `src/features/qa/QuestionComposer.vue`
- Modify: `src/features/qa/TaskShortcuts.vue`
- Modify: `src/views/AscQaView.vue`
- Modify: `src/components/navigation/AscSidebar.vue`

**Interfaces:**
- Consumes: Task 1 option arrays and guide functions
- Produces: simplified composer and four independent prompt cards

- [ ] **Step 1: Update the composer from the tested model contract**

Remove the file input, attachment notice, knowledge-base selector, attachment props, and attachment events. Render model, framework, reasoning, ontology, and send controls only. Use the exported option arrays. Disable the ontology button when `settings.ontologyLocked` is true and expose `aria-disabled` plus title `NEXUS 框架默认启用本体增强`.

- [ ] **Step 2: Connect the four guide cards**

Make `TaskShortcuts.vue` receive a `guides` prop and emit:

```js
defineEmits(['select', 'refresh'])
```

Clicking the card emits its current question. The refresh button uses `@click.stop` and emits the category id. Keep four equal columns above 1050px, two columns from 560px to 1050px, and one column below 560px. Desktop height is 76px with a 40px icon box and 12px gaps.

- [ ] **Step 3: Simplify the QA view**

Initialize guide state once per view mount. Remove attachment state and handlers. Remove top-right ontology status. Connect card selection to `draft = question` and refresh to `refreshQuestionGuide`. Keep answer and evidence behavior unchanged.

- [ ] **Step 4: Remove the sidebar demo status**

Delete the bottom knowledge-base status block and its scoped styles. Recent conversations remain.

- [ ] **Step 5: Verify component compilation and model regression**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests pass and Vite emits the production bundle.

- [ ] **Step 6: Commit the QA presentation**

```powershell
git add src/features/qa/QuestionComposer.vue src/features/qa/TaskShortcuts.vue src/views/AscQaView.vue src/components/navigation/AscSidebar.vue
git commit -m "feat: simplify the ASC QA homepage"
```

### Task 3: Literature filtering and pagination behavior

**Files:**
- Modify: `tests/ascLabExperience.test.js`
- Modify: `src/features/library/libraryModel.js`
- Modify: `src/features/library/libraryData.js`

**Interfaces:**
- Produces: `getYearPartitions(documents, visibleCount)`
- Produces: `filterDocuments(documents, filters)` with `yearPartition`
- Produces: `paginateDocuments(documents, page, pageSize)`
- Produces: normalized filters `{ query, type, yearPartition }`

- [ ] **Step 1: Write failing search and year-partition tests**

```js
test('finds a document by abstract or keyword and intersects it with year', () => {
  const result = library.filterDocuments(libraryData.documents, {
    query: 'residual strength',
    type: '',
    yearPartition: '2024'
  })
  assert.deepEqual(result.map(item => item.id), ['DOC-2024-001'])
})

test('builds four exact years and an older partition', () => {
  assert.deepEqual(library.getYearPartitions(libraryData.documents, 4), {
    years: [2024, 2023, 2022, 2021],
    olderBefore: 2021
  })
  const older = library.filterDocuments(libraryData.documents, {
    query: '', type: '', yearPartition: 'older:2021'
  })
  assert.deepEqual(older.map(item => item.id), ['DOC-2018-004'])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because abstracts are not searchable and year partitions are absent.

- [ ] **Step 3: Implement simplified filters**

Change `createLibraryFilters()` to `{ query: '', type: '', yearPartition: '' }`. Search title, DOI, journal, authors, abstract, keywords, and tags. Implement exact-year and `older:<cutoff>` matching. Remove expert, parsing, and language filters from the filter contract.

- [ ] **Step 4: Write failing pagination tests**

```js
test('paginates with allowed page sizes and corrects an invalid page', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ id: `D${index + 1}` }))
  const result = library.paginateDocuments(rows, 9, 20)
  assert.equal(result.page, 3)
  assert.equal(result.pageCount, 3)
  assert.equal(result.items.length, 5)
  assert.deepEqual(result.pageSizes, [20, 50, 100])
})
```

- [ ] **Step 5: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because pagination is absent.

- [ ] **Step 6: Implement pagination**

Normalize page size to 20, 50, or 100; calculate at least one page for an empty result; clamp requested pages into `1..pageCount`; slice only the corrected page.

- [ ] **Step 7: Add summary-ready keywords where needed**

Keep all five existing records and ensure each has a non-empty `abstract` and `keywords` array. Do not invent new statistics or backend identifiers.

- [ ] **Step 8: Run the focused test and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all library behavior tests pass.

- [ ] **Step 9: Commit the library behavior**

```powershell
git add tests/ascLabExperience.test.js src/features/library/libraryModel.js src/features/library/libraryData.js
git commit -m "feat: add quick literature filtering and pagination"
```

### Task 4: Literature management presentation

**Files:**
- Modify: `src/features/library/LibraryToolbar.vue`
- Modify: `src/features/library/DocumentTable.vue`
- Modify: `src/features/library/DocumentDetails.vue`
- Modify: `src/views/DocumentLibraryView.vue`

**Interfaces:**
- Consumes: Task 3 filters, year partitions, and pagination result
- Produces: year-first search flow, active filters, paginated table, summary-and-keywords details

- [ ] **Step 1: Rebuild the quick-search toolbar**

Render one search input with placeholder `搜索标题、DOI、作者、摘要或关键词…`, a compact year button group, one type selector, and clear action. Below the controls render removable active conditions and `共 N 条结果`. The toolbar emits small filter patches and never mutates its prop.

- [ ] **Step 2: Make the table pagination real**

Receive `page`, `pageCount`, `pageSize`, and `total`. Emit `change-page` and `change-page-size`. Render first, previous, visible page numbers, next, and the 20/50/100 selector. Keep the table header sticky inside `.table-scroll`.

- [ ] **Step 3: Reduce document details to requested content**

Keep the header and close button. Render the title, `摘要`, full abstract, `关键词`, and keyword chips. Remove the cover, metadata definition list, pipeline, chunk preview, and action buttons.

- [ ] **Step 4: Connect filtering and pagination in the page view**

Compute partitions, filtered rows, and paginated rows. Reset page to 1 whenever any filter changes. Pass `pagination.items` to the table. Selecting a row opens details; if the selected row disappears after filtering, select the first visible row or close details when none remain. Keep import controls and modal.

- [ ] **Step 5: Verify compilation and regression**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests pass and Vite build exits 0.

- [ ] **Step 6: Commit the library presentation**

```powershell
git add src/features/library/LibraryToolbar.vue src/features/library/DocumentTable.vue src/features/library/DocumentDetails.vue src/views/DocumentLibraryView.vue
git commit -m "feat: streamline the literature library"
```

### Task 5: Knowledge-graph launch and node-focus models

**Files:**
- Modify: `tests/ascLabExperience.test.js`
- Create: `src/features/knowledge/knowledgeGraphLauncher.js`
- Create: `src/features/knowledge/graphExplorerData.js`
- Create: `src/features/knowledge/graphExplorerModel.js`

**Interfaces:**
- Produces: `requestGraphLaunch({ endpoint, fetchImpl, fallbackUrl, currentOrigin })`
- Produces: `graphNodes`, `graphEdges`
- Produces: `searchGraphNodes(nodes, query)`
- Produces: `createGraphExplorerState()`, `focusGraphNode(state, nodes, edges, nodeId, viewport)`

- [ ] **Step 1: Write failing launch tests**

```js
test('uses the local graph explorer when no launch API is configured', async () => {
  const result = await launcher.requestGraphLaunch({ endpoint: '' })
  assert.equal(result.redirectUrl, '/knowledge/explorer')
})

test('rejects an unsafe graph redirect returned by the launch API', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch({
      endpoint: '/api/graph/launch',
      fetchImpl: async () => ({ ok: true, json: async () => ({ redirectUrl: 'javascript:alert(1)' }) })
    }),
    /无效的图谱跳转地址/
  )
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the launcher module is absent.

- [ ] **Step 3: Implement the launcher boundary**

Use POST for configured endpoints. Check `response.ok`, parse `{ redirectUrl, graphSessionId? }`, accept relative paths plus `http:` and `https:` URLs, and reject all other schemes. Return `/knowledge/explorer` without calling fetch when `endpoint` is empty.

- [ ] **Step 4: Write failing graph search and focus tests**

```js
test('searches graph nodes by label alias and stable node id', () => {
  assert.equal(graph.searchGraphNodes(data.graphNodes, '碳化硅')[0].nodeId, 'material:sic')
  assert.equal(graph.searchGraphNodes(data.graphNodes, 'reaction:sic-oxidation')[0].label, 'SiC 氧化')
})

test('focuses a node at viewport center and highlights direct neighbors', () => {
  const focused = graph.focusGraphNode(
    graph.createGraphExplorerState(), data.graphNodes, data.graphEdges,
    'material:sic', { width: 760, height: 520, scale: 1.2 }
  )
  assert.equal(focused.focusedNodeId, 'material:sic')
  assert.deepEqual(focused.viewport, { x: 80, y: 44, scale: 1.2 })
  assert.ok(focused.highlightedNodeIds.includes('material:alumina'))
})
```

- [ ] **Step 5: Run the test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because graph data and focus behavior are absent.

- [ ] **Step 6: Implement graph data and focus behavior**

Provide a compact refractory graph containing SiC, Al₂O₃, carbon phase, SiC oxidation, thermal shock, slag corrosion, strength, and formulation nodes. Each node has `nodeId`, `label`, `type`, `aliases`, `x`, `y`, `relationshipCount`, and `evidenceCount`. Search is case-insensitive. Focus calculates translation so the selected node maps to the viewport center at scale 1.2 and derives directly connected node and edge ids.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run: `node --test tests/ascLabExperience.test.js`

Expected: all launch, search, and focus tests pass.

- [ ] **Step 8: Commit the graph behavior**

```powershell
git add tests/ascLabExperience.test.js src/features/knowledge/knowledgeGraphLauncher.js src/features/knowledge/graphExplorerData.js src/features/knowledge/graphExplorerModel.js
git commit -m "feat: add knowledge graph launch and node focus models"
```

### Task 6: Knowledge-graph entry and explorer presentation

**Files:**
- Modify: `src/config/ascRoutes.js`
- Modify: `src/router/index.js`
- Modify: `src/views/KnowledgeView.vue`
- Create: `src/views/KnowledgeExplorerView.vue`
- Create: `src/features/knowledge/GraphNodeSearch.vue`
- Create: `src/features/knowledge/GraphCanvas.vue`

**Interfaces:**
- Consumes: Task 5 launcher, graph data, search, and focus state
- Produces: `/knowledge` launch entry and `/knowledge/explorer` interactive demo

- [ ] **Step 1: Add a failing route contract test**

Extend the route assertion so `KnowledgeExplorer` at `/knowledge/explorer` is included after `Knowledge` and before data platform.

- [ ] **Step 2: Run the route test and verify RED**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because the explorer route does not exist.

- [ ] **Step 3: Register the explorer route**

Add a lazy-loaded `KnowledgeExplorerView.vue` route. Keep primary navigation unchanged so only one “知识图谱” sidebar entry exists.

- [ ] **Step 4: Build the single-action knowledge entry**

Replace `ModuleOverview` with one centered entry card. On click call `requestGraphLaunch` using `import.meta.env.VITE_GRAPH_LAUNCH_API`; show loading, error, and retry states. Use `router.push` for internal paths and `window.location.assign` for absolute URLs.

- [ ] **Step 5: Build accessible node search**

`GraphNodeSearch.vue` owns input text, filtered results, active index, ArrowUp/ArrowDown/Enter/Escape handling, and emits the selected stable `nodeId`. Show label, type, and node id for every result; show the approved no-result message when needed.

- [ ] **Step 6: Build the focusable SVG graph canvas**

Render edges and nodes from seed data in code-native SVG. Apply the tested translate/scale transform to the graph group. Focused node receives a blue outer ring; connected nodes and edges remain strong while unrelated elements fade. Include reset-view and full-screen controls, the transient focus notice, and a right details panel.

- [ ] **Step 7: Connect the explorer view**

Compose the search and canvas, focus `material:sic` when selected, restore the initial viewport on reset, and preserve the selected node detail through fullscreen changes. On mobile, keep search full width and display details as a lower panel.

- [ ] **Step 8: Verify compilation and regression**

Run: `node --test tests/ascLabExperience.test.js`

Run: `npm run build`

Expected: tests pass and the app builds.

- [ ] **Step 9: Commit the graph presentation**

```powershell
git add src/config/ascRoutes.js src/router/index.js src/views/KnowledgeView.vue src/views/KnowledgeExplorerView.vue src/features/knowledge/GraphNodeSearch.vue src/features/knowledge/GraphCanvas.vue
git commit -m "feat: add graph API entry and searchable explorer"
```

### Task 7: Full verification and fidelity repair

**Files:**
- Modify as needed: files from Tasks 1-6
- Create: `docs/superpowers/verification/2026-08-03-three-page-refinement-fidelity.md`
- Create: `docs/superpowers/verification/2026-08-03-qa-desktop.png`
- Create: `docs/superpowers/verification/2026-08-03-library-desktop.png`
- Create: `docs/superpowers/verification/2026-08-03-graph-entry-desktop.png`
- Create: `docs/superpowers/verification/2026-08-03-graph-explorer-desktop.png`
- Create: `docs/superpowers/verification/2026-08-03-mobile.png`

**Interfaces:**
- Consumes: completed pages and approved design specification
- Produces: verified build, interaction path, screenshots, and fidelity ledger

- [ ] **Step 1: Run all tests**

Run: `node --test tests/*.test.js`

Expected: zero failed tests and no warnings from the application code.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Vite exits with code 0.

- [ ] **Step 3: Start the app and verify the desktop core path**

Open `/`, refresh one card, click the card to fill the composer, switch NEXUS/Hybrid RAG, then visit `/documents`, combine year and keyword, open details, visit `/knowledge`, launch the graph, search `SiC`, select `material:sic`, reset view, and toggle fullscreen.

- [ ] **Step 4: Verify responsive layouts**

Check a desktop viewport matching the accepted layout and a viewport near 390×844. Confirm there is no clipped primary content, whole-page horizontal overflow, accidental control wrapping, or unusable search result panel.

- [ ] **Step 5: Capture accepted concept and implementation evidence**

Use the built-in browser when available; otherwise use Playwright Chromium and record the fallback reason. Capture the four desktop states and one mobile state. Render the accepted PDF or browser companion concept to PNG where needed.

- [ ] **Step 6: Inspect images and write the fidelity ledger**

Use `view_image` on both accepted concepts and latest implementation screenshots in the same QA pass. Record at least five concrete comparisons: copy, shell anatomy, composer controls, four-card density, literature search anatomy, details content, graph entry, graph search/focus, typography, palette, and mobile behavior.

- [ ] **Step 7: Repair every material mismatch and repeat tests/build/screenshots**

Do not hand off with malformed Chinese, stale upload/knowledge controls, inactive refresh buttons, fake pagination, graph focus drift, unsafe redirect handling, clipped content, or unapproved visible copy.

- [ ] **Step 8: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-03-* src tests
git commit -m "test: verify ASC LAB three-page refinement"
```
