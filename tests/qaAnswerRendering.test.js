import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

import { buildAscDomainTerms } from '../src/utils/ascDomainHighlighter.js'
import { buildQaAnswerSegments } from '../src/features/qa/qaAnswerRenderingModel.js'
import QaAnswerText from '../src/features/qa/QaAnswerText.js'

test('keeps backend citation anchors inline and highlights ASC domain terms', () => {
  const text = 'ASC 中的 SiC 改善抗氧化性能<c>r1</c>，并形成 SiO2 玻璃相[R2]。'
  const domainTerms = buildAscDomainTerms({ content: text })
  const segments = buildQaAnswerSegments(text, {
    referenceIds: ['R1', 'R2'],
    domainTerms
  })

  assert.deepEqual(
    segments.filter(segment => segment.type === 'citation'),
    [
      { type: 'citation', citationId: 'R1', text: '[R1]' },
      { type: 'citation', citationId: 'R2', text: '[R2]' }
    ]
  )
  assert.ok(segments.some(segment => segment.type === 'domain' && segment.text === 'ASC'))
  assert.ok(segments.some(segment => segment.type === 'domain' && segment.text === 'SiC'))
  assert.equal(segments.map(segment => segment.text).join(''), 'ASC 中的 SiC 改善抗氧化性能[R1]，并形成 SiO2 玻璃相[R2]。')
})

test('does not expose a clickable citation when the backend returned no matching reference', () => {
  const segments = buildQaAnswerSegments('结论<c>R9</c>。', {
    referenceIds: ['R1'],
    domainTerms: []
  })

  assert.equal(segments.some(segment => segment.type === 'citation'), false)
  assert.equal(segments.map(segment => segment.text).join(''), '结论[R9]。')
})

test('renders inline citations as buttons and domain terms with the original green-term hook', async () => {
  const text = 'ASC 中的 SiC<c>R1</c>。'
  const html = await renderToString(createSSRApp({
    render: () => h(QaAnswerText, {
      text,
      references: [{ id: 'R1', title: 'paper.pdf', excerpt: '原文证据' }],
      domainTerms: buildAscDomainTerms({ content: text })
    })
  }))

  assert.match(html, /class="qa-domain-term is-raw_material"/)
  assert.match(html, /<u>ASC<\/u>/)
  assert.match(html, /class="qa-inline-citation"/)
  assert.match(html, />\[R1\]<\/button>/)
  assert.doesNotMatch(html, /&lt;c&gt;|<c>/)
})

test('emits the backend reference id when an inline citation is clicked', () => {
  const emitted = []
  const render = QaAnswerText.setup({
    text: '结论<c>R1</c>。',
    references: [{ id: 'R1', title: 'paper.pdf', excerpt: '原文证据' }],
    domainTerms: []
  }, {
    emit: (event, value) => emitted.push([event, value])
  })
  const root = render()
  const queue = [root]
  let citationButton = null
  while (queue.length) {
    const vnode = queue.shift()
    if (vnode?.props?.class === 'qa-inline-citation') {
      citationButton = vnode
      break
    }
    if (Array.isArray(vnode?.children)) queue.push(...vnode.children)
  }

  assert.ok(citationButton)
  citationButton.props.onClick()
  assert.deepEqual(emitted, [['citation', 'R1']])
})

test('keeps backend citation bindings as a fallback without duplicating inline anchors', async () => {
  const renderAnswer = async (text) => renderToString(createSSRApp({
    render: () => h(QaAnswerText, {
      text,
      references: [{ id: 'R1', title: 'paper.pdf', excerpt: '原文证据' }],
      citationIds: ['R1'],
      domainTerms: []
    })
  }))

  const boundOnly = await renderAnswer('后端只返回了绑定。')
  const alreadyInline = await renderAnswer('后端已有标记<c>R1</c>。')

  assert.equal((boundOnly.match(/>\[R1\]<\/button>/g) || []).length, 1)
  assert.equal((alreadyInline.match(/>\[R1\]<\/button>/g) || []).length, 1)
})

test('the real conversation panel renders backend citations inline with domain highlighting', async () => {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true }
  })

  try {
    const { default: ConversationPanel } = await server.ssrLoadModule('/src/features/qa/ConversationPanel.vue')
    const html = await renderToString(createSSRApp({
      render: () => h(ConversationPanel, {
        state: {
          phase: 'answered',
          question: 'ASC 中的 SiC 有什么作用？',
          answerSource: 'live',
          qaResult: {},
          answer: {
            summary: 'ASC 体系结论<c>R1</c>。',
            sections: [{
              title: '机理',
              body: 'SiC 改善抗氧化性能<c>R1</c>。',
              citations: ['R1']
            }],
            researchPath: []
          },
          references: [{ id: 'R1', title: 'paper.pdf', excerpt: '原文证据' }]
        }
      })
    }))

    assert.match(html, /class="qa-inline-citation"/)
    assert.match(html, /class="qa-domain-term is-raw_material"/)
    assert.doesNotMatch(html, /&lt;c&gt;|<c>/)
    assert.equal((html.match(/>\[R1\]<\/button>/g) || []).length, 2)
  } finally {
    await server.close()
  }
})
