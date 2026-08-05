import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptCodGraphRagResponse,
  buildCodQueryPayload,
  requestCodAnswer
} from '../src/features/qa/qaApiAdapter.js'
import {
  completeApiAnswer,
  createQaState,
  failApiAnswer,
  submitQuestion
} from '../src/features/qa/qaDemoModel.js'

const backendResponse = {
  success: true,
  data: {
    qa_run_id: 'qarun_1',
    final_answer: '核心结论。\n\n## 机理\n碳化硅改善热震性能。',
    references: [{
      reference_id: 'R1',
      source_label: 'paper.pdf',
      original_quote: '实验原文',
      source: 'pdf_library',
      page_number: 4,
      metadata: { year: 2025, authors: ['王某', '李某'] }
    }],
    citation_bindings: [{
      reference_id: 'R1',
      answer_excerpt: '碳化硅改善热震性能'
    }],
    debug_trace: {
      stages: [{ stage: 'query_decomposition' }, { stage: 'path_verification' }]
    }
  }
}

test('adapts a real CoD GraphRAG response into the current answer UI model', () => {
  const adapted = adaptCodGraphRagResponse(backendResponse)

  assert.equal(adapted.qaRunId, 'qarun_1')
  assert.equal(adapted.answer.summary, '核心结论。')
  assert.deepEqual(adapted.answer.sections, [{
    title: '机理',
    body: '碳化硅改善热震性能。',
    citations: ['R1']
  }])
  assert.deepEqual(adapted.answer.citationIds, ['R1'])
  assert.deepEqual(adapted.references[0], {
    id: 'R1',
    title: 'paper.pdf',
    authors: '王某、李某',
    source: 'pdf_library',
    year: 2025,
    locator: '第 4 页',
    excerpt: '实验原文',
    sourceFileId: '',
    deepLink: ''
  })
  assert.deepEqual(adapted.answer.researchPath, ['问题分解', '路径验证'])
})

test('builds an explicitly scoped CoD request from the selected project', () => {
  assert.deepEqual(buildCodQueryPayload({
    question: '为什么热震稳定性提升？',
    project: { project_id: 'project-1', graph_id: 'graph-1' },
    settings: { framework: 'Hybrid RAG', reasoning: 'ToT' }
  }), {
    question: '为什么热震稳定性提升？',
    project_id: 'project-1',
    graph_id: 'graph-1',
    reasoning_mode: 'tot'
  })
})

test('omits the synthetic project id for graph-only local configuration', () => {
  assert.deepEqual(buildCodQueryPayload({
    question: 'Q',
    project: {
      project_id: 'configured:g1',
      graph_id: 'g1',
      omit_project_id_from_query: true
    }
  }), {
    question: 'Q',
    graph_id: 'g1',
    reasoning_mode: 'auto'
  })
})

test('calls the query API with the exact scoped payload and adapts its response', async () => {
  const calls = []
  const adapted = await requestCodAnswer(async (payload) => {
    calls.push(payload)
    return backendResponse
  }, {
    question: 'Q',
    project: { project_id: 'p1', graph_id: 'g1' },
    settings: { framework: 'NEXUS', reasoning: 'Auto' }
  })

  assert.deepEqual(calls, [{
    question: 'Q',
    project_id: 'p1',
    graph_id: 'g1',
    reasoning_mode: 'auto',
    mode: 'adaptive_cod'
  }])
  assert.equal(adapted.qaRunId, 'qarun_1')
})

test('completes and fails a real API answer without substituting mock data', () => {
  const loading = submitQuestion(createQaState(), '真实问题')
  const completed = completeApiAnswer(loading, adaptCodGraphRagResponse(backendResponse))

  assert.equal(completed.phase, 'answered')
  assert.equal(completed.qaRunId, 'qarun_1')
  assert.equal(completed.answer.summary, '核心结论。')
  assert.equal(completed.evidenceOpen, true)

  const failed = failApiAnswer(loading, new Error('后端调用失败'))
  assert.equal(failed.phase, 'error')
  assert.equal(failed.question, '真实问题')
  assert.equal(failed.errorMessage, '后端调用失败')
  assert.equal(failed.answer, null)
})

test('extracts and removes the citation markers emitted by the backend', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_citation',
      final_answer: '## 结论\n碳化硅改善性能<c>R1</c>。',
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.sections[0].body, '碳化硅改善性能。')
  assert.deepEqual(adapted.answer.sections[0].citations, ['R1'])
})

test('rejects a successful response that contains no real answer text', () => {
  assert.throws(() => adaptCodGraphRagResponse({
    success: true,
    data: { qa_run_id: 'qarun_empty', final_answer: '   ', references: [] }
  }), /未返回有效回答/)
})
