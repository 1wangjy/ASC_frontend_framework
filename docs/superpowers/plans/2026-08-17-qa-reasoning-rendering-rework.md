# QA Reasoning Rendering Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the original QA-Bot separation between readable detailed derivation and structured CoT/ToT route visualization using only existing backend fields.

**Architecture:** Extend the existing pure QA detail model so it preserves path evidence, route families, branch roles, and structured derivation sections. Keep rendering in two focused Vue components: one for readable derivation and one for CoT/ToT routes. Do not change the API adapter contract or add backend requests.

**Tech Stack:** Vue 3, JavaScript ES modules, Node test runner, Vite.

## Global Constraints

- Use only `logic_chain_derivation`, `reasoning_route`, `debug_trace.adaptive_reasoning`, and `routed_reasoning_paths` already returned by the backend.
- Do not add mock UI data, fixed scores, endpoints, or backend changes.
- Do not modify Citation or quality evaluation behavior in this task.
- Preserve the current ASC LAB blue-white layout.

---

### Task 1: Preserve reasoning route semantics

**Files:**
- Modify: `tests/qaAnswerDetailsModel.test.js`
- Modify: `src/features/qa/qaAnswerDetailsModel.js`

**Interfaces:**
- Consumes: existing QA result fields.
- Produces: `buildQaReasoningTrace(result)` with `families`, branch roles, readable route metadata, nodes, relations, facts, and evidence.

- [ ] Add failing tests using a real-shaped ToT response with repeated nodes, relation facts, route scores, and branch metadata.
- [ ] Run `node --test tests/qaAnswerDetailsModel.test.js` and confirm the new assertions fail because the current model is flat.
- [ ] Port the minimal route-family and branch normalization behavior from the original `Step5Interaction.vue`.
- [ ] Re-run the focused test until it passes.

### Task 2: Structure detailed logic derivation

**Files:**
- Modify: `tests/qaAnswerDetailsModel.test.js`
- Modify: `src/features/qa/qaAnswerDetailsModel.js`
- Create: `src/features/qa/QaLogicDerivation.vue`
- Modify: `src/features/qa/AnswerDetailsTabs.vue`

**Interfaces:**
- Consumes: `logic_chain_derivation`.
- Produces: readable labelled sections and ontology term chips without exposing serialized backend objects.

- [ ] Add a failing test containing the observed `canonical` object serialization and labelled derivation sections.
- [ ] Confirm the test fails because the current model returns one raw string.
- [ ] Parse known labelled sections and extract real canonical terms while suppressing object syntax.
- [ ] Render the resulting sections in `QaLogicDerivation.vue` and connect the logic tab.
- [ ] Re-run the focused test.

### Task 3: Replace the flat ToT card grid

**Files:**
- Modify: `src/features/qa/QaReasoningTrace.vue`

**Interfaces:**
- Consumes: the structured trace produced by Task 1.
- Produces: a linear CoT chain or a rooted, family-grouped ToT hierarchy.

- [ ] Render CoT as one ordered chain.
- [ ] Render ToT as one KG root followed by route-family lanes and main/candidate branches.
- [ ] Keep full relation labels available and remove the misleading independent-card grid.
- [ ] Preserve responsive single-column behavior.

### Task 4: Verify the scoped rework

**Files:**
- Verify: all files above.

- [ ] Run `node --test tests/qaAnswerDetailsModel.test.js tests/qaApiAdapter.test.js tests/qaAnswerRendering.test.js`.
- [ ] Run `npm run build` once.
- [ ] Run `git diff --check` and inspect the scoped diff without committing or touching backend/3001 code.
