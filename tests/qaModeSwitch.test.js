import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import * as qa from '../src/features/qa/qaDemoModel.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { findRenderedNode, mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'
import { renderSfc } from './helpers/renderSfc.js'

test('shared mode switcher emits the selected QA page mode', async () => {
  let selectedMode = ''
  const fixture = await mountSfcWithMemoryRouter(
    '/src/features/qa/QaModeSwitcher.vue',
    '/',
    {
      mode: 'single',
      'onUpdate:mode': mode => { selectedMode = mode }
    }
  )

  try {
    const multiButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('智能会话')
    )
    assert.ok(multiButton)
    assert.equal(multiButton.props['aria-pressed'], false)
    await multiButton.props.onClick()
    assert.equal(selectedMode, 'multi')
  } finally {
    await fixture.close()
  }
})

test('centers the shared mode switcher without shifting either page heading', async () => {
  const [switcherSource, qaViewSource] = await Promise.all([
    readFile(new URL('../src/features/qa/QaModeSwitcher.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ])

  assert.match(switcherSource, /\.qa-mode-switcher\s*\{[\s\S]*?justify-self:\s*center;/)
  assert.doesNotMatch(qaViewSource, /\.qa-empty h1,[\s\S]*?transform:\s*translateX/)
})

test('defaults to the Agent multi-turn entry with NEXUS with ontology enhancement enabled', () => {
  const state = qa.createQaState()

  assert.equal(state.mode, 'multi')
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

  assert.match(html, /深度研究/)
  assert.match(html, /智能会话/)
  assert.match(html, /模型/)
  assert.match(html, /推理/)
  assert.match(html, />查询</)
  assert.doesNotMatch(html, /框架|本体增强/)
})

test('shows a live send entry for multi-turn', async () => {
  const state = qa.selectQaMode?.(qa.createQaState(), 'multi') ?? qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '继续讨论',
    settings: state.settings,
    mode: 'multi'
  })

  assert.match(html, /<button[^>]*class="send-button"[^>]*>[\s\S]*发送/)
  assert.doesNotMatch(html, /title="多轮问答接口尚未接入"/)
})

test('hides the entire compact follow-up composer after a single-turn question', async () => {
  const state = qa.createQaState()
  const html = await renderSfc('/src/features/qa/QuestionComposer.vue', {
    modelValue: '',
    settings: state.settings,
    mode: 'single',
    compact: true
  })

  assert.doesNotMatch(html, /深度研究|智能会话/)
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

  assert.doesNotMatch(html, /深度研究|智能会话/)
  assert.match(html, /继续追问/)
  assert.match(html, /模型/)
  assert.match(html, /推理/)
  assert.match(html, />发送</)
})
