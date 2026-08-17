import test from 'node:test'
import assert from 'node:assert/strict'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

import { buildAscDomainTerms } from '../src/utils/ascDomainHighlighter.js'
import {
  buildQaAnswerSegments,
  buildQaEvidenceStats
} from '../src/features/qa/qaAnswerRenderingModel.js'
import QaAnswerText from '../src/features/qa/QaAnswerText.js'
import { createQaState } from '../src/features/qa/qaDemoModel.js'
import { buildQaAnswerDetails } from '../src/features/qa/qaAnswerDetailsModel.js'
import {
  buildQaReferenceSourceUrl,
  buildEvidenceTextPreview,
  formatExperimentConditions,
  formatReferenceLocation,
  normalizeEvidenceText
} from '../src/features/qa/qaEvidenceModel.js'
import { renderSfc } from './helpers/renderSfc.js'
import {
  findRenderedNode,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

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

test('counts citation records separately from unique source documents', () => {
  assert.deepEqual(buildQaEvidenceStats([
    { id: 'R1', sourceFileId: 'pdf-1' },
    { id: 'R2', sourceFileId: 'pdf-1' },
    { id: 'R3', paperId: 'paper-2' },
    { id: 'R4', paperId: 'paper-2' }
  ]), {
    citationCount: 4,
    documentCount: 2
  })
})

test('does not invent a document count when a citation has no document id', () => {
  assert.deepEqual(buildQaEvidenceStats([
    { id: 'R1', sourceFileId: 'pdf-1' },
    { id: 'R2' }
  ]), {
    citationCount: 2,
    documentCount: null
  })
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

test('renders supported answer emphasis and code markers without exposing raw markup', async () => {
  const text = '<i>斜体结论</i>，**关键发现**，`SiC`<c>R1</c>。'
  const html = await renderToString(createSSRApp({
    render: () => h(QaAnswerText, {
      text,
      references: [{ id: 'R1', title: 'paper.pdf', excerpt: '原文证据' }],
      domainTerms: buildAscDomainTerms({ content: text })
    })
  }))

  assert.match(html, /<em[^>]*>斜体结论<\/em>/)
  assert.match(html, /<strong[^>]*>关键发现<\/strong>/)
  assert.match(html, /<code[^>]*>SiC<\/code>/)
  assert.match(html, />\[R1\]<\/button>/)
  assert.doesNotMatch(html, /&lt;\/?i&gt;|\*\*|`/)
})

test('renders the real OMD answer with its original green ToT reasoning scaffold', async () => {
  const html = await renderSfc('/src/features/qa/OmdAnswerDetail.vue', {
    model: {
      lead: 'OMD 本体融合到直接回答：SiC 通过 SiO2 保护层改善抗氧化性能。',
      scaffold: {
        title: 'ToT 多分支辅助推理',
        summary: '先选最高质量路径，再比较其余候选。',
        items: [
          '**主路径 T1**：SiC → SiO2 → 抗氧化性能',
          '备选路径 T2：孔隙连通 → 氧扩散'
        ]
      },
      tail: '因此结论同时包含本体、路径和风险边界。'
    },
    references: [],
    domainTerms: buildAscDomainTerms({ content: 'SiC SiO2 抗氧化性能 孔隙连通 氧扩散' })
  })

  assert.match(html, /class="omd-answer"/)
  assert.match(html, /class="omd-answer__scaffold"/)
  assert.match(html, /ToT 多分支辅助推理/)
  assert.match(html, /先选最高质量路径，再比较其余候选/)
  assert.match(html, /主路径 T1/)
  assert.match(html, /备选路径 T2/)
  assert.match(html, /因此结论同时包含本体、路径和风险边界/)
  assert.match(html, /class="qa-domain-term/)
  assert.doesNotMatch(html, /qa-metric-grid|95%/)
})

test('the answer-details OMD tab uses the structured OMD renderer instead of flattening it', async () => {
  const html = await renderSfc('/src/features/qa/AnswerDetailsTabs.vue', {
    activeTab: 'omd',
    items: [{
      id: 'omd',
      label: 'OMD 本体增强',
      content: '扁平回退内容',
      omd: {
        lead: '真实 OMD 主回答',
        scaffold: {
          title: 'ToT 多分支辅助推理',
          summary: '真实辅助说明',
          items: ['主路径 T1：SiC → SiO2']
        },
        tail: '真实补充说明'
      }
    }],
    references: [],
    question: 'SiC 如何影响抗氧化性能？',
    result: {}
  })

  assert.match(html, /class="omd-answer"/)
  assert.match(html, /class="omd-answer__scaffold"/)
  assert.match(html, /真实 OMD 主回答/)
  assert.doesNotMatch(html, /扁平回退内容/)
})

test('renders the original topology canvas with real shared nodes, route evaluation and selection', async () => {
  const [reasoning] = buildQaAnswerDetails({
    reasoning_route: {
      requested_mode: 'auto',
      selected_mode: 'tot',
      selected_path_ids: ['path_001'],
      structural_metrics: { node_count: 4, relation_count: 4 }
    },
    routed_reasoning_paths: [
      {
        path_id: 'path_001',
        initial_score: 0.96,
        nodes: [{ name: 'SiC' }, { name: 'SiO2 保护层' }, { name: '抗氧化性能' }],
        edges: [{ relation: '氧化生成' }, { relation: '提升' }]
      },
      {
        path_id: 'path_002',
        initial_score: 0.84,
        nodes: [{ name: 'SiC' }, { name: '孔隙封闭' }, { name: '抗氧化性能' }],
        edges: [{ relation: '促进' }, { relation: '改善' }]
      }
    ]
  })

  const html = await renderSfc('/src/features/qa/QaReasoningTrace.vue', {
    trace: reasoning.trace,
    question: 'SiC 如何影响抗氧化性能？',
    domainTerms: buildAscDomainTerms({ content: 'SiC SiO2 保护层 孔隙封闭 抗氧化性能' })
  })

  assert.match(html, /Tree Search Canvas/)
  assert.match(html, /Problem/)
  assert.match(html, /Logic route lanes/)
  assert.match(html, /Route evaluate/)
  assert.match(html, /Select Answer/)
  assert.match(html, /class="reasoning-topology__canvas"/)
  assert.match(html, /<svg/)
  assert.match(html, /SiO2 保护层/)
  assert.match(html, /孔隙封闭/)
  assert.match(html, /class="qa-domain-term/)
  assert.doesNotMatch(html, /class="reasoning-trace__families"/)
})

test('keeps CoT answers on the original linear verification canvas', async () => {
  const [reasoning] = buildQaAnswerDetails({
    reasoning_route: {
      requested_mode: 'cot',
      selected_mode: 'cot',
      selected_path_ids: ['cot-main']
    },
    routed_reasoning_paths: [{
      path_id: 'cot-main',
      nodes: [{ name: 'SiC' }, { name: 'SiO2 保护层' }, { name: '抗氧化性能' }],
      edges: [{ relation: '氧化生成' }, { relation: '提升' }]
    }]
  })

  const html = await renderSfc('/src/features/qa/QaReasoningTrace.vue', {
    trace: reasoning.trace,
    question: 'SiC 如何影响抗氧化性能？',
    domainTerms: buildAscDomainTerms({ content: 'SiC SiO2 保护层 抗氧化性能' })
  })

  assert.match(html, /Linear Verification Canvas/)
  assert.match(html, /Verified KG chain/)
  assert.match(html, /Path verify/)
  assert.match(html, /Answer/)
  assert.match(html, /class="reasoning-topology__canvas"/)
})

test('escapes unsupported backend HTML instead of executing it', async () => {
  const html = await renderToString(createSSRApp({
    render: () => h(QaAnswerText, {
      text: '<script>alert(1)</script><img src=x onerror=alert(2)>安全正文',
      references: [],
      domainTerms: []
    })
  }))

  assert.doesNotMatch(html, /<script|<img/i)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /安全正文/)
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
          references: [
            { id: 'R1', title: 'paper-a.pdf', excerpt: '原文证据', sourceFileId: 'pdf-1' },
            { id: 'R2', title: 'paper-a.pdf', excerpt: '另一条证据', sourceFileId: 'pdf-1' },
            { id: 'R3', title: 'paper-b.pdf', excerpt: '第二篇文献证据', paperId: 'paper-2' }
          ]
        }
      })
    }))

    assert.match(html, /基于 3 条引用证据生成，来自 2 篇文献/)
    assert.doesNotMatch(html, /3 篇证据文献/)
    assert.match(html, /class="qa-inline-citation"/)
    assert.match(html, /class="qa-domain-term is-raw_material"/)
    assert.doesNotMatch(html, /&lt;c&gt;|<c>/)
    assert.doesNotMatch(html, /研究路径/)
    assert.equal((html.match(/>\[R1\]<\/button>/g) || []).length, 2)
  } finally {
    await server.close()
  }
})

test('hides the evidence action when the backend returned no references', async () => {
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
          question: '真实问题',
          answerSource: 'live',
          qaResult: {},
          answer: { summary: '没有引用的真实回答。', sections: [] },
          references: []
        }
      })
    }))

    assert.doesNotMatch(html, /查看引用证据/)
    assert.doesNotMatch(html, /查看质量评估/)
  } finally {
    await server.close()
  }
})

test('renders the evidence drawer as a source list and selected source detail without quality controls', async () => {
  const html = await renderSfc('/src/features/qa/EvidencePanel.vue', {
    references: [
      {
        id: 'R1',
        title: 'paper.pdf',
        authors: '王某、李某',
        source: 'pdf',
        year: 2026,
        locator: '第 4 页',
        pageNumber: 4,
        excerpt: '论文原文证据',
        chunkId: 'chunk-4',
        chunkText: '完整 Chunk 文本',
        experimentConditions: { temperature: ['1450℃'], atmosphere: ['air'] },
        score: 0.86,
        sourceFileId: 'pdf-1'
      },
      { id: 'R2', title: 'paper.pdf', authors: '', source: 'pdf', year: 2026, excerpt: '证据2', sourceFileId: 'pdf-1' }
    ],
    selectedCitationId: 'R1'
  })

  assert.match(html, /引用证据/)
  assert.match(html, /2 条引用证据/)
  assert.match(html, /来自 1 篇文献/)
  assert.match(html, /证据列表/)
  assert.match(html, /原始来源片段/)
  assert.match(html, /完整 Chunk 文本/)
  assert.match(html, /王某、李某/)
  assert.match(html, /1450℃/)
  assert.match(html, /86%/)
  assert.match(html, /打开原文/)
  assert.doesNotMatch(html, /回答质量评估|人工评估|LLM 评估/)
})

test('the evidence drawer hides absent bibliography and does not duplicate a chunk as a paper quote', async () => {
  const html = await renderSfc('/src/features/qa/EvidencePanel.vue', {
    references: [{
      id: 'R1',
      title: 'evidence_board',
      authors: '',
      year: '',
      locator: '',
      pageNumber: null,
      excerpt: '',
      chunkId: 'chunk-only-1',
      chunkText: '只有真实 Chunk。',
      experimentConditions: {},
      score: null,
      sourceFileId: '',
      deepLink: ''
    }],
    selectedCitationId: 'R1'
  })

  assert.match(html, /Chunk/)
  assert.match(html, /只有真实 Chunk。/)
  assert.doesNotMatch(html, /论文原文片段|页码|作者|年份|实验条件|证据得分|打开原文/)
})

test('builds original-source links from real reference fields and keeps absent links hidden', () => {
  assert.equal(buildQaReferenceSourceUrl({
    sourceFileId: 'pdf-1',
    pageNumber: 4
  }, {
    getPdfPreviewUrl: (fileId) => `/preview/${fileId}?user=u`
  }), '/preview/pdf-1?user=u#page=4')

  assert.equal(buildQaReferenceSourceUrl({
    deepLink: 'https://example.test/paper',
    pageNumber: 2
  }), 'https://example.test/paper#page=2')
  assert.equal(buildQaReferenceSourceUrl({}), '')
})

test('formats only the experiment conditions supplied by the backend', () => {
  assert.deepEqual(formatExperimentConditions({
    temperature: ['1450℃'],
    atmosphere: ['air'],
    composition: '5wt%'
  }), [
    { key: 'temperature', label: '温度', value: '1450℃' },
    { key: 'atmosphere', label: '气氛', value: 'air' },
    { key: 'composition', label: '组成', value: '5wt%' }
  ])
  assert.deepEqual(formatExperimentConditions({}), [])
})

test('formats the complete backend reference location without inventing missing fields', () => {
  assert.equal(formatReferenceLocation({
    pageNumber: 4,
    bbox: [12.4, 30, 120.25, 88.6],
    spatialMetadata: { section_anchor: 'Results 3.2' }
  }), '第 4 页 · bbox(12.4, 30.0, 120.3, 88.6)')
  assert.equal(formatReferenceLocation({
    pageNumber: null,
    spatialMetadata: { section_anchor: 'Results 3.2' }
  }), 'Results 3.2')
  assert.equal(formatReferenceLocation({}), '')
})

test('turns extracted HTML and Markdown evidence into readable safe text', () => {
  assert.equal(
    normalizeEvidenceText('<div>#### **KEYWORDS**</div><p>SiC&nbsp;improves strength.</p><script>bad()</script>'),
    'KEYWORDS\nSiC improves strength.'
  )

  const preview = buildEvidenceTextPreview('A'.repeat(540), 120)
  assert.equal(preview.truncated, true)
  assert.equal(preview.preview.length, 121)
  assert.equal(preview.preview.endsWith('…'), true)
})

test('renders paper identifiers, precise location, readable evidence and expandable chunks', async () => {
  const longChunk = `<p>${'完整检索内容 '.repeat(80)}</p>`
  const fixture = await mountSfcWithMemoryRouter('/src/features/qa/EvidencePanel.vue', '/', {
    references: [{
      id: 'R1',
      title: 'paper.pdf',
      authors: '',
      year: '',
      pageNumber: 4,
      paperId: 'paper-asc-1',
      markdownPath: 'papers/paper.md',
      bbox: [12.4, 30, 120.25, 88.6],
      spatialMetadata: {},
      excerpt: '<div>#### **原始结论**</div><p>SiC&nbsp;提高强度。</p>',
      chunkId: 'chunk-4',
      chunkText: longChunk,
      experimentConditions: {},
      score: null,
      sourceFileId: '',
      deepLink: ''
    }],
    selectedCitationId: 'R1'
  })

  try {
    const initialText = renderedText(fixture.root)
    assert.match(initialText, /Paper ID.*paper-asc-1/)
    assert.match(initialText, /Markdown.*papers\/paper\.md/)
    assert.match(initialText, /第 4 页 · bbox\(12\.4, 30\.0, 120\.3, 88\.6\)/)
    assert.match(initialText, /原始来源片段[\s\S]*原始结论[\s\S]*SiC 提高强度/)
    assert.doesNotMatch(initialText, /<div>|<p>|####|\*\*/)

    const expand = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('展开全文')
    )
    assert.ok(expand)
    assert.doesNotMatch(initialText, new RegExp(normalizeEvidenceText(longChunk)))
    await expand.props.onClick()
    await nextTick()
    assert.match(renderedText(fixture.root), new RegExp(normalizeEvidenceText(longChunk)))
  } finally {
    await fixture.close()
  }
})

test('renders real answer and reasoning quality metrics without fixed placeholder values', async () => {
  const html = await renderSfc('/src/features/qa/QualityPanel.vue', {
    result: {
      qa_quantitative_metrics: {
        confidence_score: 0.91,
        relevance_score: 0.88,
        accuracy_estimate: 0.86,
        llms_as_judge_score: 0.83,
        evidence_strength_score: 0.82,
        ontology_alignment_score: 0.77,
        path_validity_score: 0.84,
        condition_completeness_score: 0.69,
        evidence_coverage_score: 0.8,
        risk_control_score: 0.73,
        exploration_value_score: 0.71
      },
      reasoning_route: {
        selected_mode: 'tot',
        structural_score: 0.75,
        semantic_score: 0.66,
        fused_score: 0.72,
        confidence: 0.89,
        structural_metrics: {
          mechanism_coverage_score: 0.81,
          path_evidence_alignment_score: 0.79,
          reasoning_readiness_score: 0.76,
          cot_suitability_score: 0.42,
          tot_suitability_score: 0.87,
          max_path_length: 4
        }
      }
    }
  })

  assert.match(html, /质量评估/)
  assert.match(html, /回答质量/)
  assert.match(html, /Academic Metric Profile/)
  assert.match(html, /Robust evidence band/)
  assert.match(html, /Reliability \/ 回答可信性/)
  assert.match(html, /Evidence Maturity \/ 证据成熟度/)
  assert.match(html, /Ontology Alignment \/ 本体一致性/)
  assert.match(html, /Risk &amp; Discovery \/ 风险与探索/)
  assert.match(html, /推理质量/)
  assert.match(html, /置信度/)
  assert.match(html, /91\.00%/)
  assert.match(html, /证据强度/)
  assert.match(html, /82\.00%/)
  assert.match(html, /问题相关性/)
  assert.match(html, /88\.00%/)
  assert.match(html, /准确性估计/)
  assert.match(html, /86\.00%/)
  assert.match(html, /证据覆盖/)
  assert.match(html, /80\.00%/)
  assert.match(html, /机制覆盖度/)
  assert.match(html, /81%/)
  assert.match(html, /综合路由分/)
  assert.match(html, /72%/)
  assert.match(html, /CoT 适配度/)
  assert.match(html, /42%/)
  assert.match(html, /ToT 适配度/)
  assert.match(html, /87%/)
  assert.match(html, /最长推理路径/)
  assert.match(html, /4 跳/)
  assert.match(html, /回答质量雷达图/)
  assert.match(html, /推理质量雷达图/)
  assert.match(html, /Expert Eval/)
  assert.match(html, /LLM Judge/)
  assert.doesNotMatch(html, /50%|固定|示例指标/)
})
