import test from 'node:test'
import assert from 'node:assert/strict'

import { nextTick } from 'vue'

import { createQaState, selectQaMode } from '../src/features/qa/qaDemoModel.js'
import {
  findRenderedNode,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

function findButton(root, label) {
  return findRenderedNode(
    root,
    node => node?.type === 'button' && renderedText(node).includes(label)
  )
}

async function invoke(handler, event = {}) {
  const handlers = Array.isArray(handler) ? handler : [handler]
  for (const item of handlers) {
    if (typeof item === 'function') await item(event)
  }
  await nextTick()
}

async function mountMultiComposer(extraProps = {}) {
  const state = selectQaMode(createQaState(), 'multi')
  return mountSfcWithMemoryRouter('/src/features/qa/QuestionComposer.vue', '/', {
    modelValue: '',
    settings: state.settings,
    mode: 'multi',
    ...extraProps
  })
}

test('multi-turn mode exposes image and one mutually exclusive answer-module selector without a live submit', async () => {
  let submits = 0
  const fixture = await mountMultiComposer({ onSubmit: () => { submits += 1 } })

  try {
    const fileInput = findRenderedNode(
      fixture.root,
      node => node?.type === 'input' && node.props?.type === 'file'
    )
    const moduleSelector = findRenderedNode(
      fixture.root,
      node => node?.type === 'select' && node.props?.['aria-label'] === '多模块回答'
    )
    const send = findButton(fixture.root, '发送')
    const form = findRenderedNode(fixture.root, node => node?.type === 'form')

    assert.ok(fileInput)
    assert.equal(fileInput.props.accept, 'image/*')
    assert.equal(moduleSelector?.props?.value, 'inline')
    assert.doesNotMatch(renderedText(moduleSelector), /关闭/)
    assert.match(renderedText(moduleSelector), /正文穿插.*证据区域/)
    assert.equal(findButton(fixture.root, '正文穿插'), null)
    assert.equal(findButton(fixture.root, '证据区域'), null)
    assert.notEqual(send?.props?.disabled, null)
    assert.notEqual(send?.props?.disabled, false)

    await invoke(moduleSelector.props.onChange, { target: { value: 'inline' } })
    assert.equal(
      findRenderedNode(fixture.root, node => node?.type === 'select' && node.props?.['aria-label'] === '多模块回答')?.props?.value,
      'inline'
    )
    await invoke(moduleSelector.props.onChange, { target: { value: 'evidence' } })
    assert.equal(
      findRenderedNode(fixture.root, node => node?.type === 'select' && node.props?.['aria-label'] === '多模块回答')?.props?.value,
      'evidence'
    )

    await invoke(form.props.onSubmit, { preventDefault() {} })
    assert.equal(submits, 0)
  } finally {
    await fixture.close()
  }
})

test('multi-turn image selection shows one preview and removing it releases the preview URL', async () => {
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const revoked = []
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:asc-preview'
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: value => revoked.push(value)
  })

  const fixture = await mountMultiComposer()
  try {
    const fileInput = findRenderedNode(
      fixture.root,
      node => node?.type === 'input' && node.props?.type === 'file'
    )
    await invoke(fileInput.props.onChange, {
      target: {
        files: [{ name: 'microstructure.png', type: 'image/png' }],
        value: 'C:\\fakepath\\microstructure.png'
      }
    })

    const image = findRenderedNode(fixture.root, node => node?.type === 'img')
    assert.equal(image?.props?.src, 'blob:asc-preview')
    assert.equal(image?.props?.alt, 'microstructure.png')
    assert.match(renderedText(fixture.root), /microstructure\.png/)

    await invoke(findButton(fixture.root, '删除图片').props.onClick)
    assert.equal(findRenderedNode(fixture.root, node => node?.type === 'img'), null)
    assert.doesNotMatch(renderedText(fixture.root), /microstructure\.png/)
    assert.deepEqual(revoked, ['blob:asc-preview'])
  } finally {
    await fixture.close()
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
    else delete URL.createObjectURL
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
    else delete URL.revokeObjectURL
  }
})

test('single-turn mode does not render multi-turn image or answer-module controls', async () => {
  const state = createQaState()
  const fixture = await mountSfcWithMemoryRouter('/src/features/qa/QuestionComposer.vue', '/', {
    modelValue: '为什么会发生热震损伤？',
    settings: state.settings,
    mode: 'single'
  })

  try {
    assert.equal(
      findRenderedNode(fixture.root, node => node?.type === 'input' && node.props?.type === 'file'),
      null
    )
    assert.equal(findButton(fixture.root, '正文穿插'), null)
    assert.equal(findButton(fixture.root, '证据区域'), null)
    assert.ok(findButton(fixture.root, '查询'))
  } finally {
    await fixture.close()
  }
})
