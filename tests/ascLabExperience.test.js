import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const navigation = await import('../src/features/navigation/appNavigation.js').catch(() => ({}))
const qa = await import('../src/features/qa/qaDemoModel.js').catch(() => ({}))
const library = await import('../src/features/library/libraryModel.js').catch(() => ({}))
const libraryData = await import('../src/features/library/libraryData.js').catch(() => ({}))
const routes = await import('../src/config/ascRoutes.js').catch(() => ({}))
const overview = await import('../src/features/overview/moduleCatalog.js').catch(() => ({}))

test('defines the five ASC LAB destinations in product order', () => {
  assert.deepEqual(
    navigation.primaryNavigation?.map(item => [item.label, item.path]),
    [
      ['QA 首页', '/'],
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

test('filters literature by query and metadata using AND semantics', () => {
  const result = library.filterDocuments?.(libraryData.documents, {
    query: 'thermal shock',
    type: 'journal',
    year: '2024',
    expertStatus: 'selected',
    parsingStatus: 'indexed',
    language: 'English'
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'DOC-2024-001')
})

test('adding a literature record to QA changes only the selected record', () => {
  const updated = library.addDocumentToQa?.(libraryData.documents, 'DOC-2022-003')

  assert.equal(updated.find(item => item.id === 'DOC-2022-003').qaIndexed, true)
  assert.equal(updated.find(item => item.id === 'DOC-2021-005').qaIndexed, false)
  assert.equal(libraryData.documents.find(item => item.id === 'DOC-2022-003').qaIndexed, false)
})

test('defines the five active ASC LAB routes and redirects unknown paths home', () => {
  assert.deepEqual(
    routes.ascRouteDefinitions?.map(route => [route.name, route.path]),
    [
      ['AscQa', '/'],
      ['Documents', '/documents'],
      ['Knowledge', '/knowledge'],
      ['DataPlatform', '/data'],
      ['Models', '/models']
    ]
  )
  assert.deepEqual(routes.fallbackRoute, {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  })
})

test('keeps QA selector choices through answer completion', () => {
  const configured = qa.updateQaSettings?.(qa.createQaState(), {
    knowledgeBase: '个人文献',
    model: 'ASC 专业模型',
    framework: '知识图谱 RAG',
    reasoning: '深度分析',
    ontologyEnabled: false
  })
  const answered = qa.completeMockAnswer(
    qa.submitQuestion(configured, '比较不同抗氧化剂方案')
  )

  assert.deepEqual(answered.settings, {
    knowledgeBase: '个人文献',
    model: 'ASC 专业模型',
    framework: '知识图谱 RAG',
    reasoning: '深度分析',
    ontologyEnabled: false
  })
})

test('literature filters support no-result and full-reset states', () => {
  const filters = library.createLibraryFilters?.()
  assert.deepEqual(filters, {
    query: '',
    type: '',
    year: '',
    expertStatus: '',
    parsingStatus: '',
    language: ''
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

test('uses ASC LAB metadata in the application entry document', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')

  assert.match(html, /<html lang="zh-CN">/)
  assert.match(html, /<title>ASC LAB - 耐火材料智能研究平台<\/title>/)
  assert.match(html, /name="description"\s+content="ASC LAB 面向耐火材料研究的智能问答、文献管理与证据评估平台"/)
  assert.doesNotMatch(html, /NEXUS Materials Analytics/)
  assert.doesNotMatch(html, /fonts\.googleapis\.com/)
})
