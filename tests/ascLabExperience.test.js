import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const navigation = await import('../src/features/navigation/appNavigation.js').catch(() => ({}))
const recentConversation = await import('../src/features/navigation/recentConversationModel.js').catch(() => ({}))
const qa = await import('../src/features/qa/qaDemoModel.js').catch(() => ({}))
const evaluation = await import('../src/features/qa/answerEvaluationModel.js').catch(() => ({}))
const evaluationService = await import('../src/features/qa/answerEvaluationService.js').catch(() => ({}))
const guides = await import('../src/features/qa/questionGuideModel.js').catch(() => ({}))
const library = await import('../src/features/library/libraryModel.js').catch(() => ({}))
const libraryData = await import('../src/features/library/libraryData.js').catch(() => ({}))
const routes = await import('../src/config/ascRoutes.js').catch(() => ({}))
const overview = await import('../src/features/overview/moduleCatalog.js').catch(() => ({}))
const launcher = await import('../src/features/knowledge/knowledgeGraphLauncher.js').catch(() => ({}))
const graphData = await import('../src/features/knowledge/graphExplorerData.js').catch(() => ({}))
const graph = await import('../src/features/knowledge/graphExplorerModel.js').catch(() => ({}))

function contrastRatio(foreground, background) {
  const luminance = hex => {
    const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    const linear = channels.map(value => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ))
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2])
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

test('defines the five ASC LAB destinations in product order', () => {
  assert.deepEqual(
    navigation.primaryNavigation?.map(item => [item.label, item.path]),
    [
      ['问答首页', '/'],
      ['文献管理', '/documents'],
      ['知识图谱', '/knowledge'],
      ['数据平台', '/data'],
      ['专业模型', '/models']
    ]
  )
})

test('shows three recent conversations by default and all after expansion', () => {
  assert.deepEqual(
    recentConversation.getVisibleRecentConversations?.(
      navigation.recentConversations,
      false
    ).map(item => item.id),
    ['thermal-shock', 'oxidation', 'slag-corrosion']
  )
  assert.deepEqual(
    recentConversation.getVisibleRecentConversations?.(
      navigation.recentConversations,
      true
    ).map(item => item.id),
    [
      'thermal-shock',
      'oxidation',
      'slag-corrosion',
      'phase-design',
      'preparation',
      'characterization'
    ]
  )
})

test('finds the restorable question for a recent conversation', () => {
  const record = recentConversation.findRecentConversation?.(
    navigation.recentConversations,
    'oxidation'
  )

  assert.equal(record?.id, 'oxidation')
  assert.match(record?.question ?? '', /抗氧化剂/)
  assert.equal(
    recentConversation.findRecentConversation?.(navigation.recentConversations, 'missing'),
    null
  )
})

test('recent conversations panel provides quiet expandable history controls', async () => {
  const source = await readFile(
    new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url),
    'utf8'
  ).catch(() => '')

  assert.match(source, /最近会话/)
  assert.match(source, /查看更多历史/)
  assert.match(source, /收起历史/)
  assert.match(source, /aria-expanded/)
  assert.match(source, /getVisibleRecentConversations/)
  assert.match(source, /text-overflow:\s*ellipsis/)
  assert.match(source, /overflow-y:\s*auto/)
})

test('QA owns recent conversations and hides them beside evidence', async () => {
  const [view, sidebar, shell] = await Promise.all([
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/navigation/AscSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')
  ])

  assert.match(view, /RecentConversationsPanel/)
  assert.match(view, /v-if="!qaState\.evidenceOpen"/)
  assert.match(view, /findRecentConversation/)
  assert.doesNotMatch(sidebar, /最近会话|recentConversations|open-conversation/)
  assert.doesNotMatch(shell, /open-conversation|openConversation/)
})

test('compact recent conversations reserve their own row instead of covering QA content', async () => {
  const [panel, view] = await Promise.all([
    readFile(new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ])

  assert.doesNotMatch(panel, /position:\s*fixed/)
  assert.match(panel, /grid-row:\s*1/)
  assert.match(
    view,
    /@media \(max-width: 1120px\)[\s\S]*?\.qa-layout--recent \.qa-main\s*\{[^}]*grid-row:\s*2/
  )
})

test('quiet recent conversation text still meets normal-text contrast', async () => {
  const panel = await readFile(
    new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url),
    'utf8'
  )
  const colors = [...panel.matchAll(/--recent-(?:text|heading|muted):\s*(#[\da-f]{6})/gi)]
    .map(match => match[1])

  assert.equal(colors.length, 3)
  colors.forEach(color => assert.equal(contrastRatio(color, '#f3f7fb') >= 4.5, true))
})

test('closing compact recent conversations returns focus to its trigger', async () => {
  const panel = await readFile(
    new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url),
    'utf8'
  )

  assert.match(panel, /ref="compactToggle"/)
  assert.match(panel, /@keydown\.esc\.stop="closeCompactPanel"/)
  assert.match(panel, /compactToggle\.value\?\.focus\(\)/)
})

test('submitting a question opens the evidence report after mock completion', () => {
  const initial = qa.createQaState?.()
  const loading = qa.submitQuestion?.(initial, '  ASC Al₂O₃-SiC-C 材料体系的热震稳定性如何？  ')

  assert.equal(loading.phase, 'loading')
  assert.equal(loading.question, 'ASC Al₂O₃-SiC-C 材料体系的热震稳定性如何？')
  assert.equal(loading.evidenceOpen, false)

  const answered = qa.completeMockAnswer?.(loading)
  assert.equal(answered.phase, 'answered')
  assert.equal(answered.evidenceOpen, true)
  assert.deepEqual(answered.answer.citationIds, ['R1', 'R2', 'R3'])
  assert.equal(answered.references.length, 3)
})

test('empty questions do not start a mock answer', () => {
  const initial = qa.createQaState?.()
  assert.ok(initial)
  assert.deepEqual(qa.submitQuestion?.(initial, '   '), initial)
})

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
  const initial = evaluation.createAnswerEvaluationState?.()
  assert.equal(evaluation.setManualVerdict?.(initial, 'accurate').manual.verdict, 'accurate')
  assert.equal(evaluation.setManualVerdict?.(initial, 'inaccurate').manual.verdict, 'inaccurate')
  assert.equal(evaluation.setManualVerdict?.(initial, 'correct'), initial)
})

test('switching an inaccurate review to accurate clears diagnosis fields', () => {
  const inaccurate = evaluation.patchAnswerEvaluation?.(
    evaluation.setManualVerdict?.(evaluation.createAnswerEvaluationState(), 'inaccurate'),
    { manual: { selectedExcerpt: '问题片段', issueTypes: ['reasoning'], comment: '推理跳步' } }
  )

  assert.deepEqual(evaluation.setManualVerdict?.(inaccurate, 'accurate').manual, {
    verdict: 'accurate',
    selectedExcerpt: '',
    issueTypes: [],
    comment: '',
    saveStatus: 'idle',
    errorMessage: ''
  })
})

test('normalizes and limits an optional selected answer excerpt', () => {
  assert.equal(evaluation.normalizeAnswerExcerpt?.('  热震\n  稳定性  '), '热震 稳定性')
  assert.equal(evaluation.normalizeAnswerExcerpt?.('123456', 4), '1234')
})

test('toggles one manual issue without duplicating it', () => {
  const initial = evaluation.createAnswerEvaluationState?.()
  const selected = evaluation.toggleManualIssue?.(initial, 'evidence')
  const cleared = evaluation.toggleManualIssue?.(selected, 'evidence')

  assert.deepEqual(selected.manual.issueTypes, ['evidence'])
  assert.deepEqual(cleared.manual.issueTypes, [])
  assert.equal(evaluation.toggleManualIssue?.(initial, 'unknown'), initial)
})

test('builds binary manual feedback without a document score', () => {
  const payload = evaluationService.buildManualEvaluationPayload?.(
    { question: '热震稳定性如何？', answerText: '回答正文', citationIds: ['R1'] },
    {
      verdict: 'inaccurate',
      selectedExcerpt: '问题片段',
      issueTypes: ['evidence'],
      comment: '证据不足'
    }
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

test('builds an LLM judge request from the current answer context', () => {
  assert.deepEqual(
    evaluationService.buildLlmEvaluationPayload?.({
      question: '热震稳定性如何？',
      answerText: '回答正文',
      citationIds: ['R1', 'R2']
    }),
    {
      question: '热震稳定性如何？',
      final_answer: '回答正文',
      qa_result: {
        answer: '回答正文',
        citation_ids: ['R1', 'R2']
      }
    }
  )
})

test('demo evaluation service returns an explicitly marked LLM result', async () => {
  const service = evaluationService.createAnswerEvaluationService?.({ mode: 'demo', delay: 0 })
  const result = await service.runLlm({ question: 'Q', answerText: 'A', citationIds: ['R1'] })

  assert.equal(result.isDemo, true)
  assert.match(result.summary, /演示/)
  assert.equal(result.dimensions.length, 3)
})

test('turns answer evaluation failures into short retry messages', () => {
  assert.equal(
    evaluationService.getAnswerEvaluationErrorMessage?.(
      Object.assign(new Error('timeout of 300000ms exceeded'), { code: 'ECONNABORTED' })
    ),
    '评估等待时间过长，请重新尝试'
  )
  assert.equal(
    evaluationService.getAnswerEvaluationErrorMessage?.(new Error('Request failed with status code 500')),
    '评估服务暂时不可用，请稍后重试'
  )
})

test('manual review uses accurate and inaccurate as the only verdict labels', async () => {
  const source = await readFile(
    new URL('../src/features/qa/ManualEvaluationPanel.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /'accurate'/)
  assert.match(source, /'inaccurate'/)
  assert.match(source, />\s*准确\s*</)
  assert.match(source, />\s*不准确\s*</)
  assert.doesNotMatch(source, /正确|不正确/)
  assert.match(source, /evaluation\.verdict === 'inaccurate'/)
})

test('manual diagnosis offers optional excerpt removal and retry-safe saving', async () => {
  const source = await readFile(
    new URL('../src/features/qa/ManualEvaluationPanel.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /问题片段/)
  assert.match(source, /clear-excerpt/)
  assert.match(source, /保存人工评估/)
  assert.match(source, /重新保存/)
  assert.match(source, /可在左侧回答中框选/)
})

test('LLM evaluation exposes idle loading error retry and success states', async () => {
  const source = await readFile(
    new URL('../src/features/qa/LlmEvaluationPanel.vue', import.meta.url),
    'utf8'
  )

  for (const state of ['idle', 'loading', 'error', 'success']) {
    assert.match(source, new RegExp(`'${state}'`))
  }
  assert.match(source, /开始 LLM 评估/)
  assert.match(source, /正在评估回答与引用证据…/)
  assert.match(source, /重新评估/)
  assert.match(source, /演示数据/)
  assert.match(source, /保存 LLM 评估结果/)
})

test('answer text selection is routed into the evaluation workspace', async () => {
  const [conversation, view] = await Promise.all([
    readFile(new URL('../src/features/qa/ConversationPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ])

  assert.match(conversation, /answer-selection/)
  assert.match(conversation, /window\.getSelection/)
  assert.match(conversation, /answerCard\.value\.contains/)
  assert.match(view, /@answer-selection=/)
  assert.match(view, /selectedExcerpt/)
})

test('evidence shell keeps sources and removes legacy scoring UI', async () => {
  const source = await readFile(
    new URL('../src/features/qa/EvidencePanel.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /引用来源/)
  assert.match(source, /人工评估/)
  assert.match(source, /LLM 评估/)
  assert.match(source, /ManualEvaluationPanel/)
  assert.match(source, /LlmEvaluationPanel/)
  assert.doesNotMatch(source, /专家评分|LLM Judge|score-summary|metric__track/)
})

test('QA view keeps evaluation state outside the evidence drawer', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /:evaluation="qaState\.evaluation"/)
  assert.match(source, /updateAnswerEvaluation/)
  assert.match(source, /saveManualEvaluation/)
  assert.match(source, /runLlmEvaluation/)
  assert.match(source, /saveLlmEvaluation/)
})

test('offers domestic LLM and version pairs with DeepSeek V4 Flash as default', () => {
  const state = qa.createQaState?.()

  assert.equal(state.settings.model, 'DeepSeek · V4 Flash')
  assert.deepEqual(qa.domesticModelOptions, [
    'DeepSeek · V4 Flash',
    'DeepSeek · V4 Pro',
    '通义千问 · Qwen 3.7 Plus',
    '通义千问 · Qwen 3.7 Max',
    'ASC Local · V1.0'
  ])
  assert.deepEqual(qa.frameworkOptions, ['Hybrid RAG', 'NEXUS'])
  assert.deepEqual(qa.reasoningOptions, ['Auto', 'CoT', 'ToT'])
})

test('NEXUS forces ontology on and locks it until Hybrid RAG is restored', () => {
  const nexus = qa.updateQaSettings?.(qa.createQaState(), {
    framework: 'NEXUS',
    ontologyEnabled: false
  })

  assert.equal(nexus.settings.ontologyEnabled, true)
  assert.equal(nexus.settings.ontologyLocked, true)

  const ignoredToggle = qa.updateQaSettings?.(nexus, { ontologyEnabled: false })
  assert.equal(ignoredToggle.settings.ontologyEnabled, true)
  assert.equal(ignoredToggle.settings.ontologyLocked, true)

  const hybrid = qa.updateQaSettings?.(nexus, { framework: 'Hybrid RAG' })
  assert.equal(hybrid.settings.ontologyEnabled, true)
  assert.equal(hybrid.settings.ontologyLocked, false)
})

test('exposes one classic question for every approved category', () => {
  const state = guides.createQuestionGuideState?.(() => 0)

  assert.deepEqual(state?.map(item => item.id), [
    'materials',
    'processing',
    'characterization',
    'service'
  ])
  assert.equal(state?.every(item => item.questions.length === 1), true)
  assert.equal(state?.[0].questions[0], 'ASC 各组分分别起什么作用？')
})

test('refreshes one classic question without changing the other categories', () => {
  const initial = guides.createQuestionGuideState?.(() => 0)
  const refreshed = guides.refreshQuestionGuide?.(initial, 'processing', () => 0)

  assert.deepEqual(refreshed?.[1].questions, ['混炼顺序对浇注料性能有什么影响？'])
  assert.equal(refreshed?.[0], initial?.[0])
  assert.equal(refreshed?.[2], initial?.[2])
  assert.equal(refreshed?.[3], initial?.[3])
})

test('single-question cards use singular refresh wording', async () => {
  const source = await readFile(
    new URL('../src/features/qa/TaskShortcuts.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /换一个经典问题/)
  assert.doesNotMatch(source, /换一组经典问题/)
})

test('selecting an inline citation reopens evidence and selects the matching source', () => {
  const answered = qa.completeMockAnswer?.(
    qa.submitQuestion?.(qa.createQaState?.(), '热震稳定性如何？')
  )
  const closed = { ...answered, evidenceOpen: false }
  const selected = qa.selectCitation?.(closed, 'R2')

  assert.equal(selected.evidenceOpen, true)
  assert.equal(selected.selectedCitationId, 'R2')
  assert.equal(selected.references.find(item => item.id === 'R2').title.includes('气孔结构'), true)
})

test('finds a document by abstract or keyword and intersects it with year', () => {
  const result = library.filterDocuments?.(libraryData.documents, {
    query: 'residual strength',
    type: '',
    yearPartitions: ['2024']
  })

  assert.deepEqual(result.map(item => item.id), ['DOC-2024-001'])
})

test('combines multiple selected years with OR and keyword with AND', () => {
  const sharedFields = {
    type: 'journal',
    doi: '',
    journal: '',
    abstract: 'thermal-shock study',
    authors: [],
    keywords: [],
    tags: []
  }
  const fixtures = [
    { ...sharedFields, id: 'Y2024', title: 'Study A', year: 2024 },
    { ...sharedFields, id: 'Y2023', title: 'Study B', year: 2023 },
    { ...sharedFields, id: 'Y2022', title: 'Study C', year: 2022 }
  ]
  const result = library.filterDocuments?.(fixtures, {
    query: 'thermal-shock',
    type: '',
    yearPartitions: ['2024', '2023']
  })

  assert.deepEqual(result.map(item => item.id), ['Y2024', 'Y2023'])
})

test('toggles one year partition without changing the other selections', () => {
  assert.deepEqual(
    library.toggleYearPartition?.(['2024'], '2023'),
    ['2024', '2023']
  )
  assert.deepEqual(
    library.toggleYearPartition?.(['2024', '2023'], '2024'),
    ['2023']
  )
})

test('calculates stable library composition metrics', () => {
  assert.deepEqual(library.calculateLibraryMetrics?.(libraryData.documents), {
    total: 5,
    expertSelected: 3,
    academicPapers: 4,
    professionalResources: 1
  })
})

test('counts conference papers with journals and keeps all other records complementary', () => {
  const fixtures = [
    { type: 'journal', expertSelected: false },
    { type: 'conference', expertSelected: true },
    { type: 'book', expertSelected: false },
    { type: 'standard', expertSelected: false },
    { type: '', expertSelected: false }
  ]

  assert.deepEqual(library.calculateLibraryMetrics?.(fixtures), {
    total: 5,
    expertSelected: 1,
    academicPapers: 2,
    professionalResources: 3
  })
})

test('library composition metrics have zero-valued empty state', () => {
  assert.deepEqual(library.calculateLibraryMetrics?.([]), {
    total: 0,
    expertSelected: 0,
    academicPapers: 0,
    professionalResources: 0
  })
})

test('library overview uses retrieval-oriented metrics instead of processing state', async () => {
  const source = await readFile(
    new URL('../src/views/DocumentLibraryView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /学术论文/)
  assert.match(source, /专业资料/)
  assert.match(source, /期刊论文 \+ 会议论文/)
  assert.match(source, /专著、标准、专利等/)
  assert.doesNotMatch(
    source,
    /近三年文献|近年文献|覆盖年份|完成解析|进入 QA 索引|正文与索引已提取|可引用证据可用/
  )
})

test('document library hides large metrics behind the title overview', async () => {
  const source = await readFile(
    new URL('../src/views/DocumentLibraryView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /LibraryOverviewPopover/)
  assert.match(source, /:metrics="metrics"/)
  assert.doesNotMatch(source, /class="summary-grid"/)
})

test('library overview exposes hidden metrics with complete close controls', async () => {
  const source = await readFile(
    new URL('../src/features/library/LibraryOverviewPopover.vue', import.meta.url),
    'utf8'
  ).catch(() => '')

  assert.match(source, /馆藏概览/)
  assert.match(source, /aria-expanded/)
  assert.match(source, /pointerdown/)
  assert.match(source, /keydown\.esc/)
  assert.match(source, /trigger\.value\?\.focus/)
  assert.match(source, /@media \(max-width: 560px\)/)
})

test('keeps literature curation separate from answer evaluation scores', async () => {
  const table = await readFile(
    new URL('../src/features/library/DocumentTable.vue', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(table, /专家评分|处理状态|更新时间/)
  assert.doesNotMatch(table, /document\.(expertScore|statusLabel|updatedAt)/)
  assert.match(table, /document\.expertSelected/)
  assert.equal(
    libraryData.documents.every(document => (
      !Object.hasOwn(document, 'expertScore')
      && !Object.hasOwn(document, 'statusLabel')
      && !Object.hasOwn(document, 'updatedAt')
    )),
    true
  )
})

test('shows at most two literature authors without a remainder count', () => {
  assert.equal(
    library.summarizeAuthors?.(['Wang Y.', 'Li J.', 'Zhang H.']),
    'Wang Y., Li J.'
  )
  assert.equal(
    library.summarizeAuthors?.(['Wang Y.', 'Li J.']),
    'Wang Y., Li J.'
  )
  assert.equal(
    library.summarizeAuthors?.([]),
    ''
  )
})

test('provides a 72px desktop sidebar mode without replacing the mobile drawer', async () => {
  const [shell, sidebar, tokens] = await Promise.all([
    readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/navigation/AscSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
  ])

  assert.match(tokens, /--asc-sidebar-collapsed-width:\s*72px/)
  assert.match(shell, /sidebarCollapsed/)
  assert.match(shell, /app-shell--sidebar-collapsed/)
  assert.match(sidebar, /toggle-collapse/)
  assert.match(sidebar, /收起侧边栏/)
  assert.match(sidebar, /展开侧边栏/)
  assert.match(sidebar, /@media \(max-width: 760px\)/)
})

test('builds four exact years and an older partition', () => {
  assert.deepEqual(library.getYearPartitions?.(libraryData.documents, 4), {
    years: [2024, 2023, 2022, 2021],
    olderBefore: 2021
  })

  const older = library.filterDocuments?.(libraryData.documents, {
    query: '',
    type: '',
    yearPartitions: ['older:2021']
  })
  assert.deepEqual(older.map(item => item.id), ['DOC-2018-004'])
})

test('paginates with allowed page sizes and corrects an invalid page', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ id: `D${index + 1}` }))
  const result = library.paginateDocuments?.(rows, 9, 20)

  assert.equal(result.page, 3)
  assert.equal(result.pageCount, 3)
  assert.equal(result.items.length, 5)
  assert.deepEqual(result.pageSizes, [20, 50, 100])
})

test('opens the first literature detail on desktop but starts with the mobile list unobstructed', () => {
  assert.equal(
    library.initialSelectedDocumentId?.(libraryData.documents, false),
    'DOC-2024-001'
  )
  assert.equal(library.initialSelectedDocumentId?.(libraryData.documents, true), '')
})

test('keeps filtered literature details closed on mobile when the current row disappears', () => {
  const filtered = libraryData.documents.filter(document => document.year === 2023)

  assert.equal(
    library.reconcileSelectedDocumentId?.(filtered, '', true),
    ''
  )
  assert.equal(
    library.reconcileSelectedDocumentId?.(filtered, 'DOC-2024-001', true),
    ''
  )
  assert.equal(
    library.reconcileSelectedDocumentId?.(filtered, 'DOC-2024-001', false),
    'DOC-2023-002'
  )
})

test('adding a literature record to QA changes only the selected record', () => {
  const updated = library.addDocumentToQa?.(libraryData.documents, 'DOC-2022-003')

  assert.equal(updated.find(item => item.id === 'DOC-2022-003').qaIndexed, true)
  assert.equal(updated.find(item => item.id === 'DOC-2021-005').qaIndexed, false)
  assert.equal(libraryData.documents.find(item => item.id === 'DOC-2022-003').qaIndexed, false)
})

test('defines the six active ASC LAB routes and redirects unknown paths home', () => {
  assert.deepEqual(
    routes.ascRouteDefinitions?.map(route => [route.name, route.path]),
    [
      ['AscQa', '/'],
      ['Documents', '/documents'],
      ['Knowledge', '/knowledge'],
      ['KnowledgeExplorer', '/knowledge/explorer'],
      ['DataPlatform', '/data'],
      ['Models', '/models']
    ]
  )
  assert.deepEqual(routes.fallbackRoute, {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  })
  assert.equal(
    routes.ascRouteDefinitions?.find(route => route.name === 'AscQa')?.meta.title,
    '问答首页'
  )
})

test('keeps QA selector choices through answer completion', () => {
  const configured = qa.updateQaSettings?.(qa.createQaState(), {
    model: '通义千问 · Qwen 3.7 Max',
    framework: 'Hybrid RAG',
    reasoning: 'ToT',
    ontologyEnabled: false
  })
  const answered = qa.completeMockAnswer(
    qa.submitQuestion(configured, '比较不同抗氧化剂方案')
  )

  assert.deepEqual(answered.settings, {
    model: '通义千问 · Qwen 3.7 Max',
    framework: 'Hybrid RAG',
    reasoning: 'ToT',
    ontologyEnabled: false,
    ontologyLocked: false
  })
})

test('literature filters support no-result and full-reset states', () => {
  const filters = library.createLibraryFilters?.()
  assert.deepEqual(filters, {
    query: '',
    type: '',
    yearPartitions: []
  })
  assert.equal(
    library.filterDocuments(libraryData.documents, { ...filters, query: '不存在的文献标题' }).length,
    0
  )
  assert.equal(library.filterDocuments(libraryData.documents, filters).length, 5)
})

test('defines route-complete supporting modules without generated research results', () => {
  assert.deepEqual(Object.keys(overview.moduleCatalog || {}), ['knowledge', 'data', 'models'])
  assert.deepEqual(
    overview.moduleCatalog?.knowledge.items.map(item => item.title),
    ['材料体系', '物相与反应', '性能关系']
  )
  assert.equal(
    Object.values(overview.moduleCatalog || {}).every(module => module.items.length >= 3),
    true
  )
})

test('waits for the graph launch API and normalizes its returned page address', async () => {
  const requestedEndpoints = []
  const result = await launcher.requestGraphLaunch?.({
    endpoint: '/api/graph/launch',
    launchApi: async endpoint => {
      requestedEndpoints.push(endpoint)
      return {
        redirect_url: 'https://graph.example.com/session/42',
        graph_session_id: '42'
      }
    },
    currentUrl: 'http://localhost/knowledge'
  })

  assert.deepEqual(requestedEndpoints, ['/api/graph/launch'])
  assert.deepEqual(result, {
    redirectUrl: 'https://graph.example.com/session/42',
    graphSessionId: '42'
  })
})

test('routes every same-origin relative graph address through Vue Router', () => {
  assert.deepEqual(
    launcher.getGraphNavigationTarget?.(
      'knowledge/explorer?session=42#material:sic',
      'http://localhost/knowledge'
    ),
    {
      kind: 'internal',
      target: '/knowledge/explorer?session=42#material:sic'
    }
  )
  assert.deepEqual(
    launcher.getGraphNavigationTarget?.(
      'https://graph.example.com/session/42',
      'http://localhost/knowledge'
    ),
    {
      kind: 'external',
      target: 'https://graph.example.com/session/42'
    }
  )
})

test('keeps the current graph entry path for query-only and hash-only redirects', () => {
  assert.deepEqual(
    launcher.getGraphNavigationTarget?.('?session=42', 'http://localhost/knowledge'),
    {
      kind: 'internal',
      target: '/knowledge?session=42'
    }
  )
  assert.deepEqual(
    launcher.getGraphNavigationTarget?.('#material:sic', 'http://localhost/knowledge'),
    {
      kind: 'internal',
      target: '/knowledge#material:sic'
    }
  )
})

test('rejects an unsafe graph redirect returned by the launch API', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch?.({
      endpoint: '/api/graph/launch',
      launchApi: async () => ({ url: 'javascript:alert(1)' })
    }),
    /无效的图谱跳转地址/
  )
})

test('rejects an empty graph launch response with a useful address error', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch?.({
      endpoint: '/api/graph/launch',
      launchApi: async () => null
    }),
    /无效的图谱跳转地址/
  )
})

test('keeps the launch API failure available to the retry UI', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch?.({
      endpoint: '/api/graph/launch',
      launchApi: async () => {
        throw new Error('图谱构建失败，请重试')
      }
    }),
    /图谱构建失败，请重试/
  )
})

test('turns technical graph launch failures into actionable Chinese messages', () => {
  const timeoutError = Object.assign(new Error('timeout of 900000ms exceeded'), {
    code: 'ECONNABORTED'
  })

  assert.equal(
    launcher.getGraphLaunchErrorMessage?.(timeoutError),
    '图谱准备时间过长，请稍后重试'
  )
  assert.equal(
    launcher.getGraphLaunchErrorMessage?.(new Error('Request failed with status code 500')),
    '图谱服务暂时不可用，请稍后重试'
  )
  assert.equal(
    launcher.getGraphLaunchErrorMessage?.(new Error('图谱构建失败，请重试')),
    '图谱构建失败，请重试'
  )
})

test('uses the shared API client for one long graph launch request', async () => {
  const graphApi = await readFile(new URL('../src/api/graph.js', import.meta.url), 'utf8')
  const launchApiFunction = graphApi.match(
    /export function launchKnowledgeGraph[\s\S]*?\r?\n}\r?\n/
  )?.[0] ?? ''

  assert.match(launchApiFunction, /export function launchKnowledgeGraph/)
  assert.match(launchApiFunction, /method:\s*['"]post['"]/)
  assert.match(launchApiFunction, /timeout:\s*15\s*\*\s*60\s*\*\s*1000/)
  assert.doesNotMatch(launchApiFunction, /requestWithRetry/)
})

test('shows a guarded loading state and retry action while launching the graph', async () => {
  const view = await readFile(new URL('../src/views/KnowledgeView.vue', import.meta.url), 'utf8')

  assert.match(view, /进入知识图谱/)
  assert.match(view, /正在进入…/)
  assert.match(view, /:disabled="launching"/)
  assert.match(view, /if \(launching\.value\) return/)
  assert.match(view, /currentUrl:\s*window\.location\.href/)
  assert.match(view, />重试<\/button>/)
})

test('searches graph nodes by label alias and stable node id', () => {
  assert.equal(
    graph.searchGraphNodes?.(graphData.graphNodes, '碳化硅')[0].nodeId,
    'material:sic'
  )
  assert.equal(
    graph.searchGraphNodes?.(graphData.graphNodes, 'reaction:sic-oxidation')[0].label,
    'SiC 氧化'
  )
})

test('focuses a node at viewport center and highlights direct neighbors', () => {
  const focused = graph.focusGraphNode?.(
    graph.createGraphExplorerState(),
    graphData.graphNodes,
    graphData.graphEdges,
    'material:sic',
    { width: 760, height: 520, scale: 1.2 }
  )

  assert.equal(focused.focusedNodeId, 'material:sic')
  assert.deepEqual(focused.viewport, { x: 80, y: 44, scale: 1.2 })
  assert.ok(focused.highlightedNodeIds.includes('material:alumina'))
})

test('keeps the current graph view when a search target does not exist', () => {
  const state = graph.createGraphExplorerState?.()
  assert.ok(state)
  const unchanged = graph.focusGraphNode?.(
    state,
    graphData.graphNodes,
    graphData.graphEdges,
    'missing:node'
  )

  assert.equal(unchanged, state)
})

test('uses ASC LAB metadata in the application entry document', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')

  assert.match(html, /<html lang="zh-CN">/)
  assert.match(html, /<title>ASC LAB - 耐火材料智能研究平台<\/title>/)
  assert.match(html, /name="description"\s+content="ASC LAB 面向耐火材料研究的智能问答、文献管理与证据评估平台"/)
  assert.doesNotMatch(html, /NEXUS Materials Analytics/)
  assert.doesNotMatch(html, /fonts\.googleapis\.com/)
})
