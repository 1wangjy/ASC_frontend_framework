import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const navigation = await import('../src/features/navigation/appNavigation.js').catch(() => ({}))
const qa = await import('../src/features/qa/qaDemoModel.js').catch(() => ({}))
const guides = await import('../src/features/qa/questionGuideModel.js').catch(() => ({}))
const library = await import('../src/features/library/libraryModel.js').catch(() => ({}))
const libraryData = await import('../src/features/library/libraryData.js').catch(() => ({}))
const routes = await import('../src/config/ascRoutes.js').catch(() => ({}))
const overview = await import('../src/features/overview/moduleCatalog.js').catch(() => ({}))
const launcher = await import('../src/features/knowledge/knowledgeGraphLauncher.js').catch(() => ({}))
const graphData = await import('../src/features/knowledge/graphExplorerData.js').catch(() => ({}))
const graph = await import('../src/features/knowledge/graphExplorerModel.js').catch(() => ({}))

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

test('exposes three classic questions for every approved category', () => {
  const state = guides.createQuestionGuideState?.(() => 0)

  assert.deepEqual(state?.map(item => item.id), [
    'materials',
    'processing',
    'characterization',
    'service'
  ])
  assert.equal(state?.every(item => item.questions.length === 3), true)
  assert.equal(state?.[0].questions[0], 'ASC 各组分分别起什么作用？')
})

test('refreshes one three-question group without changing the other categories', () => {
  const initial = guides.createQuestionGuideState?.(() => 0)
  const refreshed = guides.refreshQuestionGuide?.(initial, 'processing', () => 0)

  assert.deepEqual(refreshed?.[1].questions, [
    '混炼顺序对浇注料性能有什么影响？',
    '烧成制度应如何匹配材料组成？',
    '振动成型参数如何影响坯体致密度？'
  ])
  assert.equal(refreshed?.[0], initial?.[0])
  assert.equal(refreshed?.[2], initial?.[2])
  assert.equal(refreshed?.[3], initial?.[3])
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

test('calculates all four library counters from document state', () => {
  assert.deepEqual(library.calculateLibraryMetrics?.(libraryData.documents), {
    total: 5,
    expertSelected: 3,
    parsed: 4,
    qaIndexed: 3
  })
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

test('uses the local graph explorer when no launch API is configured', async () => {
  const result = await launcher.requestGraphLaunch?.({ endpoint: '' })

  assert.equal(result.redirectUrl, '/knowledge/explorer')
})

test('rejects an unsafe graph redirect returned by the launch API', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch?.({
      endpoint: '/api/graph/launch',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ redirectUrl: 'javascript:alert(1)' })
      })
    }),
    /无效的图谱跳转地址/
  )
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
