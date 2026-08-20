import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('quality drawer hosts the real Expert Eval and LLM Judge workspaces', async () => {
  const source = await readSource('../src/features/qa/QualityPanel.vue')

  assert.match(source, /ManualEvaluationPanel/)
  assert.match(source, /LlmEvaluationPanel/)
  assert.match(source, /evaluationEnabled/)
  assert.match(source, /evaluation\.mode === 'manual'/)
  assert.match(source, /evaluation\.mode === 'llm'/)
  assert.match(source, /save-manual/)
  assert.match(source, /run-llm/)
  assert.match(source, /save-llm/)
  assert.doesNotMatch(source, /disabled>Expert Eval|disabled>LLM Judge/)
})

test('QA view wires the current real answer evaluation state into the quality drawer', async () => {
  const source = await readSource('../src/views/AscQaView.vue')

  assert.match(source, /<QualityPanel[\s\S]*:evaluation="qaState\.evaluation"/)
  assert.match(source, /:evaluation-enabled="evaluationEnabled"/)
  assert.match(source, /@update:evaluation="patchEvaluation"/)
  assert.match(source, /@save-manual="saveManualEvaluation"/)
  assert.match(source, /@run-llm="runLlmEvaluation"/)
  assert.match(source, /@save-llm="saveLlmEvaluation"/)
})

test('a real answer can open quality evaluation even without quantitative metrics', async () => {
  const [conversation, view] = await Promise.all([
    readSource('../src/features/qa/ConversationPanel.vue'),
    readSource('../src/views/AscQaView.vue')
  ])

  assert.match(conversation, /evaluationEnabled/)
  assert.match(conversation, /hasQualityData \|\| evaluationEnabled/)
  assert.match(view, /:evaluation-enabled="evaluationEnabled"/)
})

test('selecting an answer excerpt opens Expert Eval in the quality drawer', async () => {
  const source = await readSource('../src/views/AscQaView.vue')
  const captureBlock = source.match(/function captureEvaluationExcerpt\(value\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(captureBlock, /qualityOpen\.value = true/)
  assert.doesNotMatch(captureBlock, /evidenceOpen: true/)
})

test('LLM evaluation panel distinguishes evaluation source and feedback persistence', async () => {
  const source = await readSource('../src/features/qa/LlmEvaluationPanel.vue')

  assert.match(source, /evaluation\.result\.sourceLabel/)
  assert.match(source, /evaluation\.result\.sourceDescription/)
  assert.match(source, /规则兜底评估/)
  assert.match(source, /另存为反馈记录/)
  assert.match(source, /已由后端自动记录/)
  assert.match(source, /v-if="evaluation\.result\.dimensions\.length"/)
  assert.match(source, /v-if="evaluation\.result\.risks\.length"/)
  assert.match(source, /v-if="evaluation\.result\.suggestions\.length"/)
})
