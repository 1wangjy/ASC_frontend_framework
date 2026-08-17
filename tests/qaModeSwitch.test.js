import test from 'node:test'
import assert from 'node:assert/strict'

import * as qa from '../src/features/qa/qaDemoModel.js'
import { renderSfc } from './helpers/renderSfc.js'

test('defaults to single-turn NEXUS with ontology enhancement enabled', () => {
  const state = qa.createQaState()

  assert.equal(state.mode, 'single')
  assert.equal(state.settings.framework, 'NEXUS')
  assert.equal(state.settings.ontologyEnabled, true)
})

test('switches to multi-turn Hybrid RAG without ontology enhancement', () => {
  const state = qa.selectQaMode?.(qa.createQaState(), 'multi')

  assert.equal(state?.mode, 'multi')
  assert.equal(state?.settings.framework, 'Hybrid RAG')
  assert.equal(state?.settings.ontologyEnabled, false)
})

test('switching back to single-turn restores its internal configuration', () => {
  const multi = qa.selectQaMode?.(qa.createQaState(), 'multi')
  const single = qa.selectQaMode?.(multi, 'single')

  assert.equal(single?.mode, 'single')
  assert.equal(single?.settings.framework, 'NEXUS')
  assert.equal(single?.settings.ontologyEnabled, true)
})

test('renders one composer with mode choices, model, reasoning, and no internal controls', async () => {
  const state = qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '研究问题',
    settings: state.settings,
    mode: 'single'
  })

  assert.match(html, /单轮深度/)
  assert.match(html, /多轮连续/)
  assert.match(html, /模型/)
  assert.match(html, /推理/)
  assert.match(html, />查询</)
  assert.doesNotMatch(html, /框架|本体增强/)
})

test('shows a disabled send entry for multi-turn without invoking the single-turn backend', async () => {
  const state = qa.selectQaMode?.(qa.createQaState(), 'multi') ?? qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '继续讨论',
    settings: state.settings,
    mode: 'multi'
  })

  assert.match(html, /<button[^>]*class="send-button"[^>]*disabled[^>]*>[\s\S]*发送/)
})

test('hides the entire compact follow-up composer after a single-turn question', async () => {
  const state = qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '',
    settings: state.settings,
    mode: 'single',
    compact: true
  })

  assert.doesNotMatch(html, /单轮深度|多轮连续/)
  assert.doesNotMatch(html, /继续追问|模型|推理|查询/)
})

test('keeps the compact follow-up composer for multi-turn mode without mode choices', async () => {
  const state = qa.selectQaMode?.(qa.createQaState(), 'multi') ?? qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '',
    settings: state.settings,
    mode: 'multi',
    compact: true
  })

  assert.doesNotMatch(html, /单轮深度|多轮连续/)
  assert.match(html, /继续追问/)
  assert.match(html, /模型/)
  assert.match(html, /推理/)
  assert.match(html, />发送</)
})
