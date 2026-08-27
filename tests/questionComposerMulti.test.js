import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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

test('multi-turn mode defaults to text-only and submits multimodal response as disabled', async () => {
  const submissions = []
  const fixture = await mountMultiComposer({
    modelValue: '如何结合 XRD 与 SEM 判断物相演变？',
    modelOptions: [{ value: 'fast_interactive', label: '快速交互模式 · Gemini Flash' }],
    settings: { model: 'fast_interactive', reasoning: 'CoT' },
    onSubmit: payload => submissions.push(payload)
  })

  try {
    const fileInput = findRenderedNode(
      fixture.root,
      node => node?.type === 'input' && node.props?.type === 'file'
    )
    const multimodalToggle = findButton(fixture.root, '多模态回答')
    const send = findButton(fixture.root, '发送')
    const form = findRenderedNode(fixture.root, node => node?.type === 'form')

    assert.ok(fileInput)
    assert.equal(fileInput.props.accept, 'image/*')
    assert.match(renderedText(multimodalToggle), /多模态回答.*已关闭/)
    assert.equal(multimodalToggle?.props?.['aria-pressed'], false)
    assert.equal(findButton(fixture.root, '正文穿插'), null)
    assert.equal(findButton(fixture.root, '证据区域'), null)
    assert.equal(send?.props?.disabled, false)

    await invoke(form.props.onSubmit, { preventDefault() {} })
    assert.deepEqual(submissions, [{
      question: '如何结合 XRD 与 SEM 判断物相演变？',
      image: null,
      enableMultimodalResponse: false,
      multiModule: 'inline'
    }])
  } finally {
    await fixture.close()
  }
})

test('multi-turn mode lets users enable multimodal response and choose its presentation', async () => {
  const submissions = []
  const fixture = await mountMultiComposer({
    modelValue: '展示相关显微组织证据',
    onSubmit: payload => submissions.push(payload)
  })

  try {
    const multimodalToggle = findButton(fixture.root, '多模态回答')
    await invoke(multimodalToggle.props.onClick)

    assert.match(renderedText(findButton(fixture.root, '多模态回答')), /已开启/)
    assert.equal(findButton(fixture.root, '多模态回答')?.props?.['aria-pressed'], true)
    assert.equal(findButton(fixture.root, '正文穿插')?.props?.['aria-pressed'], true)
    assert.equal(findButton(fixture.root, '证据区域')?.props?.['aria-pressed'], false)

    await invoke(findButton(fixture.root, '证据区域').props.onClick)
    assert.equal(findButton(fixture.root, '正文穿插')?.props?.['aria-pressed'], false)
    assert.equal(findButton(fixture.root, '证据区域')?.props?.['aria-pressed'], true)

    const form = findRenderedNode(fixture.root, node => node?.type === 'form')
    await invoke(form.props.onSubmit, { preventDefault() {} })
    assert.deepEqual(submissions, [{
      question: '展示相关显微组织证据',
      image: null,
      enableMultimodalResponse: true,
      multiModule: 'evidence'
    }])
  } finally {
    await fixture.close()
  }
})

test('multi-turn image selection can open a large preview before removal', async () => {
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

    assert.equal(findRenderedNode(fixture.root, node => node?.props?.role === 'dialog'), null)
    await invoke(findButton(fixture.root, '放大查看 microstructure.png').props.onClick)
    const dialog = findRenderedNode(fixture.root, node => node?.props?.role === 'dialog')
    assert.ok(dialog)
    assert.equal(dialog.props['aria-modal'], 'true')
    const largeImage = findRenderedNode(dialog, node => node?.type === 'img')
    assert.equal(largeImage?.props?.src, 'blob:asc-preview')
    assert.equal(largeImage?.props?.alt, 'microstructure.png')

    await invoke(dialog.props.onKeydown, { key: 'Escape', stopPropagation() {} })
    assert.equal(findRenderedNode(fixture.root, node => node?.props?.role === 'dialog'), null)

    await invoke(findButton(fixture.root, '放大查看 microstructure.png').props.onClick)

    const closePreview = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && node.props?.['aria-label'] === '关闭图片预览'
    )
    await invoke(closePreview.props.onClick)
    assert.equal(findRenderedNode(fixture.root, node => node?.props?.role === 'dialog'), null)

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

test('multi-turn history attachments and answer evidence use the same large-image preview', async () => {
  const source = await readFile(
    new URL('../src/features/qa/multiDiscussion/MultiDiscussionPanel.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /attachment\.previewUrl \|\| attachment\.url[\s\S]*?@click="openImagePreview/)
  assert.match(source, /evidence\.image_url[\s\S]*?@click="openImagePreview/)
  assert.match(source, /<AscImageLightbox/)
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
