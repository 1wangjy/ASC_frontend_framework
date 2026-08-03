# ASC Answer Evaluation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static answer-score area with an ASC-styled review workspace that preserves R1–R3 evidence, supports manual `准确 / 不准确` review, answer excerpt capture, and an independent LLM evaluation workflow.

**Architecture:** Keep conversation-level evaluation state in `qaDemoModel.js` so closing the right drawer or switching tabs does not erase work. Split the right drawer into a shell plus focused manual and LLM panels, and let `AscQaView.vue` own asynchronous service calls. Use the existing QA feedback and LLM Judge endpoints through a small adapter, with deterministic demo behavior as the default until `VITE_QA_EVALUATION_API=true` is configured.

**Tech Stack:** Vue 3 Composition API, Vite 7, Axios shared client, Node built-in test runner, scoped CSS.

## Global Constraints

- Manual verdict copy is exactly `准确` and `不准确`; do not use `正确 / 不正确`.
- Manual evaluation is binary; do not show expert scores, levels, metric bars, or document scores.
- Preserve the R1–R3 source list and inline citation navigation.
- Only `不准确` expands excerpt, issue tags, and explanation controls.
- Selected answer text is optional and replaceable.
- Manual and LLM tab drafts survive tab switching and closing/reopening the evidence panel.
- LLM results must expose idle, loading, success, and error states and must not present demo values as real backend output.
- Do not change knowledge-graph, literature-management, data-platform, or model-page behavior.

---

## File Structure

- Create `src/features/qa/answerEvaluationModel.js`: immutable defaults, issue labels, pure state transitions, excerpt normalization, request-payload builders, and demo LLM result.
- Create `src/features/qa/answerEvaluationService.js`: selects demo or API mode and adapts the existing QA feedback / LLM Judge endpoints.
- Create `src/features/qa/ManualEvaluationPanel.vue`: binary verdict UI, conditional diagnosis fields, save states, and accessible controls.
- Create `src/features/qa/LlmEvaluationPanel.vue`: run/retry/save UI and structured result cards.
- Modify `src/features/qa/EvidencePanel.vue`: retain references and become the tabbed evaluation shell.
- Modify `src/features/qa/ConversationPanel.vue`: emit a normalized excerpt when text inside the model answer is selected.
- Modify `src/features/qa/qaDemoModel.js`: include evaluation state in each conversation and expose an immutable updater.
- Modify `src/views/AscQaView.vue`: connect excerpt events, evaluation patches, async save/run handlers, and responsive layout width.
- Modify `tests/ascLabExperience.test.js`: cover state transitions, payloads, source-level interaction contracts, and regression requirements.

---

### Task 1: Evaluation State Model

**Files:**
- Create: `src/features/qa/answerEvaluationModel.js`
- Modify: `src/features/qa/qaDemoModel.js`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: `manualIssueOptions`, `createAnswerEvaluationState()`, `normalizeAnswerExcerpt(value, maxLength)`, `patchAnswerEvaluation(state, patch)`, `setManualVerdict(state, verdict)`, `toggleManualIssue(state, issueId)`, `createDemoLlmResult()`.
- Produces from `qaDemoModel.js`: `updateAnswerEvaluation(state, patchOrUpdater)` returning a new QA state.
- Consumed by: both evaluation panels, service payload builders, and `AscQaView.vue`.

- [ ] **Step 1: Write failing state-transition tests**

Add imports and tests that specify the exact state contract:

```js
const evaluation = await import('../src/features/qa/answerEvaluationModel.js').catch(() => ({}))

test('creates an unanswered binary manual evaluation with an idle LLM review', () => {
  assert.deepEqual(evaluation.createAnswerEvaluationState?.(), {
    mode: 'manual',
    manual: {
      verdict: null,
      selectedExcerpt: '',
      issueTypes: [],
      comment: '',
      saveStatus: 'idle',
      errorMessage: ''
    },
    llm: {
      runStatus: 'idle',
      result: null,
      errorMessage: '',
      saveStatus: 'idle',
      saveErrorMessage: ''
    }
  })
})

test('manual evaluation accepts only accurate or inaccurate verdicts', () => {
  const initial = evaluation.createAnswerEvaluationState()
  assert.equal(evaluation.setManualVerdict(initial, 'accurate').manual.verdict, 'accurate')
  assert.equal(evaluation.setManualVerdict(initial, 'inaccurate').manual.verdict, 'inaccurate')
  assert.equal(evaluation.setManualVerdict(initial, 'correct'), initial)
})

test('switching an inaccurate review to accurate clears diagnosis fields', () => {
  const inaccurate = evaluation.patchAnswerEvaluation(
    evaluation.setManualVerdict(evaluation.createAnswerEvaluationState(), 'inaccurate'),
    { manual: { selectedExcerpt: '问题片段', issueTypes: ['reasoning'], comment: '推理跳步' } }
  )
  assert.deepEqual(evaluation.setManualVerdict(inaccurate, 'accurate').manual, {
    verdict: 'accurate',
    selectedExcerpt: '',
    issueTypes: [],
    comment: '',
    saveStatus: 'idle',
    errorMessage: ''
  })
})

test('normalizes and limits an optional selected answer excerpt', () => {
  assert.equal(evaluation.normalizeAnswerExcerpt('  热震\n  稳定性  '), '热震 稳定性')
  assert.equal(evaluation.normalizeAnswerExcerpt('123456', 4), '1234')
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test --test-name-pattern="binary manual evaluation|accurate or inaccurate|clears diagnosis|selected answer excerpt" tests/ascLabExperience.test.js`

Expected: FAIL because `answerEvaluationModel.js` and its exports do not exist.

- [ ] **Step 3: Implement immutable evaluation transitions**

Create `answerEvaluationModel.js` with frozen issue metadata and pure functions. Use these exact IDs so UI, payloads, and tests agree:

```js
export const manualIssueOptions = Object.freeze([
  { id: 'retrieval', label: '检索失败' },
  { id: 'knowledge', label: '知识缺失' },
  { id: 'reasoning', label: '推理错误' },
  { id: 'evidence', label: '证据不足' },
  { id: 'unsupported', label: '无依据断言' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'domain', label: '领域不匹配' }
])

export function createAnswerEvaluationState() {
  return {
    mode: 'manual',
    manual: {
      verdict: null,
      selectedExcerpt: '',
      issueTypes: [],
      comment: '',
      saveStatus: 'idle',
      errorMessage: ''
    },
    llm: {
      runStatus: 'idle',
      result: null,
      errorMessage: '',
      saveStatus: 'idle',
      saveErrorMessage: ''
    }
  }
}
```

Implement nested immutable merging in `patchAnswerEvaluation`, validation in `setManualVerdict`, clearing of diagnosis fields when switching to `accurate`, and de-duplicating toggle behavior in `toggleManualIssue`. `normalizeAnswerExcerpt` must collapse whitespace, trim, and slice to `maxLength` (default `500`).

- [ ] **Step 4: Attach evaluation state to the QA conversation**

In `qaDemoModel.js`, import `createAnswerEvaluationState` and `patchAnswerEvaluation`. Add `evaluation: createAnswerEvaluationState()` to `createQaState()` and reset it in `submitQuestion()`. Export:

```js
export function updateAnswerEvaluation(state, patchOrUpdater) {
  if (!state?.evaluation) return state
  const nextEvaluation = typeof patchOrUpdater === 'function'
    ? patchOrUpdater(state.evaluation)
    : patchAnswerEvaluation(state.evaluation, patchOrUpdater)
  return nextEvaluation === state.evaluation ? state : { ...state, evaluation: nextEvaluation }
}
```

- [ ] **Step 5: Run all Node tests**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS, including all pre-existing QA, library, routing, and graph tests.

- [ ] **Step 6: Commit the state model**

```bash
git add src/features/qa/answerEvaluationModel.js src/features/qa/qaDemoModel.js tests/ascLabExperience.test.js
git commit -m "feat: model binary answer evaluation state"
```

---

### Task 2: Evaluation Service Adapter

**Files:**
- Create: `src/features/qa/answerEvaluationService.js`
- Modify: `src/features/qa/answerEvaluationModel.js`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: existing `submitQAFeedback(data)` and `judgeQAWithLLM(data)` from `src/api/graph.js`.
- Produces: `buildManualEvaluationPayload(context, manual)`, `buildLlmEvaluationPayload(context)`, `createAnswerEvaluationService(options)`, `getAnswerEvaluationErrorMessage(error)`.
- Service methods: `saveManual(context, manual)`, `runLlm(context)`, `saveLlm(context, result)`; each returns a Promise.

- [ ] **Step 1: Write failing payload and service-mode tests**

```js
const evaluationService = await import('../src/features/qa/answerEvaluationService.js').catch(() => ({}))

test('builds binary manual feedback without a document score', () => {
  const payload = evaluationService.buildManualEvaluationPayload?.(
    { question: '热震稳定性如何？', answerText: '回答正文', citationIds: ['R1'] },
    { verdict: 'inaccurate', selectedExcerpt: '问题片段', issueTypes: ['evidence'], comment: '证据不足' }
  )
  assert.deepEqual(payload, {
    question: '热震稳定性如何？',
    final_answer: '回答正文',
    citation_ids: ['R1'],
    verdict: 'inaccurate',
    selected_excerpt: '问题片段',
    error_types: ['evidence'],
    comments: '证据不足'
  })
  assert.equal(Object.hasOwn(payload, 'score'), false)
  assert.equal(Object.hasOwn(payload, 'scores'), false)
})

test('demo evaluation service returns an explicitly marked LLM result', async () => {
  const service = evaluationService.createAnswerEvaluationService?.({ mode: 'demo', delay: 0 })
  const result = await service.runLlm({ question: 'Q', answerText: 'A', citationIds: ['R1'] })
  assert.equal(result.isDemo, true)
  assert.match(result.summary, /演示/)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test --test-name-pattern="binary manual feedback|demo evaluation service" tests/ascLabExperience.test.js`

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement payload builders and deterministic demo service**

Implement context normalization and a `wait(delay)` helper. Demo `runLlm` returns `createDemoLlmResult()` with `isDemo: true`, model `ASC Evaluation Demo`, version `V1.0`, three named dimensions, two risks, and two suggestions. Demo save methods return `{ success: true, mode: 'demo' }` after the configured delay.

- [ ] **Step 4: Implement API mode using current endpoints**

For API mode:

```js
saveManual(context, manual) {
  return submitQAFeedback(buildManualEvaluationPayload(context, manual))
},
runLlm(context) {
  return judgeQAWithLLM(buildLlmEvaluationPayload(context))
},
saveLlm(context, result) {
  return submitQAFeedback({
    ...buildLlmEvaluationPayload(context),
    evaluation_source: 'llm',
    llm_evaluation: result
  })
}
```

Select API mode only when `options.mode === 'api'`; `AscQaView.vue` will pass `import.meta.env.VITE_QA_EVALUATION_API === 'true' ? 'api' : 'demo'`. Convert timeout, network, and backend errors into short Chinese retry messages with `getAnswerEvaluationErrorMessage`.

- [ ] **Step 5: Run all tests and commit**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS.

```bash
git add src/features/qa/answerEvaluationModel.js src/features/qa/answerEvaluationService.js tests/ascLabExperience.test.js
git commit -m "feat: add answer evaluation service adapter"
```

---

### Task 3: Manual Evaluation Panel

**Files:**
- Create: `src/features/qa/ManualEvaluationPanel.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Props: `evaluation: Object`, `disabled: Boolean`.
- Emits: `patch` with a nested manual patch, `set-verdict` with `accurate | inaccurate`, `toggle-issue` with issue ID, `clear-excerpt`, and `save`.
- Consumes: `manualIssueOptions` from `answerEvaluationModel.js`.

- [ ] **Step 1: Add failing source-contract tests**

Read the component source and assert:

```js
test('manual review uses accurate and inaccurate as the only verdict labels', async () => {
  const source = await readFile(new URL('../src/features/qa/ManualEvaluationPanel.vue', import.meta.url), 'utf8')
  assert.match(source, />准确</)
  assert.match(source, />不准确</)
  assert.doesNotMatch(source, />正确</)
  assert.doesNotMatch(source, />不正确</)
  assert.match(source, /evaluation\.verdict === 'inaccurate'/)
})

test('manual diagnosis offers optional excerpt removal and retry-safe saving', async () => {
  const source = await readFile(new URL('../src/features/qa/ManualEvaluationPanel.vue', import.meta.url), 'utf8')
  assert.match(source, /问题片段/)
  assert.match(source, /clear-excerpt/)
  assert.match(source, /保存人工评估/)
  assert.match(source, /重新保存/)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test --test-name-pattern="manual review uses|manual diagnosis offers" tests/ascLabExperience.test.js`

Expected: FAIL because the Vue file does not exist.

- [ ] **Step 3: Implement the manual panel template and events**

Build a `fieldset` with the prompt “这条回答是否准确？” and two `aria-pressed` buttons. Render the diagnosis block only when `evaluation.verdict === 'inaccurate'`. Issue chips are real buttons with `aria-pressed`; comment updates emit `{ comment: event.target.value, saveStatus: 'idle', errorMessage: '' }`. Disable save while `saveStatus === 'saving'` or no verdict is selected.

Use these state messages:

- saving: `正在保存…`
- success: `人工评估已保存`
- error action: `重新保存`
- empty excerpt helper: `可在左侧回答中框选有问题的文字，也可以不框选直接提交。`

- [ ] **Step 4: Style the panel as the selected A direction**

Use an airy vertical workspace: 40–44px verdict controls, green accurate state, restrained orange-red inaccurate state, pale grouped diagnosis background, borderless issue-chip list, 13px body text, and a full-width primary save button. Add visible `:focus-visible` outlines and long-text wrapping.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS.

```bash
git add src/features/qa/ManualEvaluationPanel.vue tests/ascLabExperience.test.js
git commit -m "feat: build manual answer review panel"
```

---

### Task 4: LLM Evaluation Panel

**Files:**
- Create: `src/features/qa/LlmEvaluationPanel.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- Props: `evaluation: Object`, `disabled: Boolean`.
- Emits: `run`, `save`.
- Consumes result fields: `isDemo`, `summary`, `confidenceLabel`, `model`, `version`, `evaluatedAt`, `dimensions[]`, `risks[]`, `suggestions[]`.

- [ ] **Step 1: Write failing LLM-state source tests**

```js
test('LLM evaluation exposes idle loading error retry and success states', async () => {
  const source = await readFile(new URL('../src/features/qa/LlmEvaluationPanel.vue', import.meta.url), 'utf8')
  for (const state of ['idle', 'loading', 'error', 'success']) assert.match(source, new RegExp(`'${state}'`))
  assert.match(source, /开始 LLM 评估/)
  assert.match(source, /正在评估回答与引用证据…/)
  assert.match(source, /重新评估/)
  assert.match(source, /演示数据/)
})
```

- [ ] **Step 2: Run focused test and verify failure**

Run: `node --test --test-name-pattern="LLM evaluation exposes" tests/ascLabExperience.test.js`

Expected: FAIL because `LlmEvaluationPanel.vue` is absent.

- [ ] **Step 3: Implement the four run states**

Idle shows model context and one run button. Loading shows an accessible status line and skeleton rows. Error shows `evaluation.errorMessage` plus `重新评估`. Success renders the result summary, dimensions, risks, suggestions, model/version/time metadata, an `演示数据` badge only when `result.isDemo`, and `保存 LLM 评估结果`.

- [ ] **Step 4: Implement compact ASC result-card styling**

Use a summary card followed by border-light sections, not a copied dashboard. Risk rows use a small orange marker, suggestions use ordered numbering, and dimension values are text badges rather than the removed legacy progress bars.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS.

```bash
git add src/features/qa/LlmEvaluationPanel.vue tests/ascLabExperience.test.js
git commit -m "feat: build LLM answer evaluation panel"
```

---

### Task 5: Evidence Shell, Answer Selection, and Async Integration

**Files:**
- Modify: `src/features/qa/EvidencePanel.vue`
- Modify: `src/features/qa/ConversationPanel.vue`
- Modify: `src/views/AscQaView.vue`
- Test: `tests/ascLabExperience.test.js`

**Interfaces:**
- `ConversationPanel.vue` emits `answer-selection` with a normalized string.
- `EvidencePanel.vue` props add `evaluation`; emits `update:evaluation`, `save-manual`, `run-llm`, `save-llm` while retaining `close` and `select`.
- `AscQaView.vue` builds context `{ question, answerText, citationIds }` and invokes the selected evaluation service.

- [ ] **Step 1: Write failing integration-contract tests**

```js
test('answer text selection is routed into the evaluation workspace', async () => {
  const [conversation, view] = await Promise.all([
    readFile(new URL('../src/features/qa/ConversationPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ])
  assert.match(conversation, /answer-selection/)
  assert.match(conversation, /window\.getSelection/)
  assert.match(view, /@answer-selection=/)
  assert.match(view, /selectedExcerpt/)
})

test('evidence shell keeps sources and removes legacy scoring UI', async () => {
  const source = await readFile(new URL('../src/features/qa/EvidencePanel.vue', import.meta.url), 'utf8')
  assert.match(source, /引用来源/)
  assert.match(source, /人工评估/)
  assert.match(source, /LLM 评估/)
  assert.doesNotMatch(source, /专家评分|LLM Judge|score-summary|metric__track/)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test --test-name-pattern="answer text selection|evidence shell keeps" tests/ascLabExperience.test.js`

Expected: FAIL because the new event and shell are not wired.

- [ ] **Step 3: Refactor `EvidencePanel.vue` into the shell**

Retain the current header and reference-card loop. Rename the tabs to `人工评估` and `LLM 评估`, bind mode from `evaluation.mode`, and render the two new panels. Remove `metrics`, `score-summary`, and legacy excerpt markup/styles. Forward all child events without mutating props.

- [ ] **Step 4: Add scoped answer selection to `ConversationPanel.vue`**

Attach `ref="answerCard"`, `@mouseup="captureAnswerSelection"`, and `@keyup="captureAnswerSelection"` to the model answer article. In `captureAnswerSelection`, call `window.getSelection()`, require a non-collapsed selection whose anchor and focus nodes are contained by `answerCard`, normalize it, and emit only a non-empty excerpt. Citation button clicks must continue emitting only the existing citation event.

- [ ] **Step 5: Connect state and async handlers in `AscQaView.vue`**

Create one service instance. Add helpers to flatten `answer.summary` and `answer.sections[].body` into `answerText`. Wire excerpt selection to a manual patch that also switches the verdict to `inaccurate`. For each async action:

1. patch the relevant status to loading/saving and clear prior error;
2. await the service;
3. patch success/result; or
4. preserve user input and patch the normalized error message.

Guard every handler against duplicate loading/saving calls and against missing answers. Pass the full evaluation state into `EvidencePanel`.

- [ ] **Step 6: Adjust responsive workspace sizing**

Increase the desktop evidence column from `330px` to `390px` so error tags and result cards do not feel compressed. Keep the existing `max-width: 1180px` fixed drawer behavior, set drawer width to `min(420px, 94vw)`, and verify no horizontal overflow at 390px viewport width.

- [ ] **Step 7: Run tests and commit**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS.

```bash
git add src/features/qa/EvidencePanel.vue src/features/qa/ConversationPanel.vue src/views/AscQaView.vue tests/ascLabExperience.test.js
git commit -m "feat: integrate answer evaluation workspace"
```

---

### Task 6: Regression, Build, and Browser Verification

**Files:**
- Modify if verification reveals a defect: files already listed in Tasks 1–5 only.

**Interfaces:**
- Consumes the completed UI and state contracts.
- Produces a verified production build with no unrelated changes.

- [ ] **Step 1: Run every repository test**

Run: `node --test tests/*.test.js`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite exits 0 and creates `dist/` without compilation errors.

- [ ] **Step 3: Start a local preview and verify the main path**

Run: `npm run dev -- --host 127.0.0.1 --port 4173`

Verify in the browser:

1. submit a question and wait for the demo answer;
2. confirm R1–R3 sources remain clickable;
3. choose `准确`, save, close and reopen the drawer, and confirm the saved state remains;
4. choose `不准确`, select answer text, toggle two issue tags, enter a note, and save;
5. switch to LLM evaluation, run the demo, confirm its demo badge, and save;
6. simulate an error in API mode or through a rejected injected service and confirm retry preserves input;
7. repeat at desktop width and at 390px viewport width.

Expected: all interactions work, no old scores or progress bars appear, and no horizontal overflow occurs.

- [ ] **Step 4: Inspect the final diff for scope and copy regressions**

Run: `git diff --check HEAD~4..HEAD && git status --short`

Expected: no whitespace errors; only the planned QA evaluation files, tests, spec, and plan are changed; generated `dist/` is not tracked.

- [ ] **Step 5: Commit any verification-only fixes**

If and only if Step 3 exposed a defect, commit the focused correction:

```bash
git add src/features/qa tests/ascLabExperience.test.js
git commit -m "fix: polish answer evaluation interactions"
```

If no defect was found, do not create an empty commit.

