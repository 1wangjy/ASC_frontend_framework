import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptCodGraphRagResponse,
  buildCodQueryPayload,
  isInvalidQaEligibilityError,
  requestCodAnswer
} from '../src/features/qa/qaApiAdapter.js'
import {
  canEvaluateAnswer,
  completeApiAnswer,
  completePreviewAnswer,
  createQaState,
  failApiAnswer,
  PREVIEW_QUESTION,
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
      stages: [{ stage: 'query_decomposition' }, { stage: 'path_verification' }],
      graph_context: {
        scope_resolution: 'project_id',
        requested_project_id: 'p1',
        requested_graph_id: 'g1',
        project_id: 'p1',
        graph_id: 'g1'
      }
    }
  }
}

const completedReportResponse = {
  success: true,
  data: {
    report_id: 'r1',
    project_id: 'p1',
    graph_id: 'g1',
    simulation_id: 's1',
    status: 'completed'
  }
}

function authoritativeProjectResponse() {
  return {
    success: true,
    data: {
      project_id: 'p1',
      graph_id: 'g1',
      simulation_id: 's1',
      project_name: 'Graph one',
      status: 'graph_completed'
    }
  }
}

test('does not send CoD when the selected report is no longer completed', async () => {
  let codCalls = 0

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => authoritativeProjectResponse(),
      getReport: async () => ({
        ...completedReportResponse,
        data: { ...completedReportResponse.data, status: 'generating' }
      }),
      codGraphRAGQuery: async () => { codCalls += 1 }
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Keep this question',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => isInvalidQaEligibilityError(error)
  )

  assert.equal(codCalls, 0)
})

test('blocks report identity and association changes before CoD submission', async () => {
  for (const report of [
    { ...completedReportResponse.data, report_id: 'r2' },
    { ...completedReportResponse.data, project_id: 'p2' },
    { ...completedReportResponse.data, graph_id: 'g2' },
    { ...completedReportResponse.data, simulation_id: 's2' }
  ]) {
    let codCalls = 0
    await assert.rejects(
      requestCodAnswer({
        getProject: async () => authoritativeProjectResponse(),
        getReport: async () => ({ success: true, data: report }),
        codGraphRAGQuery: async () => { codCalls += 1 }
      }, {
        reportId: 'r1',
        simulationId: 's1',
        question: 'Keep this question',
        project: { project_id: 'p1', graph_id: 'g1' }
      }),
      (error) => isInvalidQaEligibilityError(error)
    )
    assert.equal(codCalls, 0)
  }
})

test('fails closed when the report preflight cannot be read', async () => {
  let codCalls = 0
  await assert.rejects(
    requestCodAnswer({
      getProject: async () => authoritativeProjectResponse(),
      getReport: async () => { throw new Error('report service unavailable') },
      codGraphRAGQuery: async () => { codCalls += 1 }
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Keep this question',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => isInvalidQaEligibilityError(error)
  )
  assert.equal(codCalls, 0)
})

test('blocks an authoritative project simulation mismatch before reading the report', async () => {
  let reportCalls = 0
  let codCalls = 0

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => ({
        ...authoritativeProjectResponse(),
        data: { ...authoritativeProjectResponse().data, simulation_id: 's2' }
      }),
      getReport: async () => { reportCalls += 1; return completedReportResponse },
      codGraphRAGQuery: async () => { codCalls += 1 }
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Keep this question',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => isInvalidQaEligibilityError(error)
  )

  assert.equal(reportCalls, 0)
  assert.equal(codCalls, 0)
})

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

test('rejects a question without a complete backend graph scope', () => {
  assert.throws(
    () => buildCodQueryPayload({ question: 'Q', project: { project_id: 'p1' } }),
    /project_id.*graph_id/
  )
  assert.throws(
    () => buildCodQueryPayload({ question: ' ', project: { project_id: 'p1', graph_id: 'g1' } }),
    /question/
  )
})

test('calls the query API with the exact scoped payload and adapts its response', async () => {
  const calls = []
  const adapted = await requestCodAnswer({
    getProject: async (projectId) => {
      calls.push(['getProject', projectId])
      return {
        success: true,
        data: {
          project_id: 'p1',
          graph_id: 'g1',
          project_name: 'Graph one',
          status: 'graph_completed',
          updated_at: '2026-08-09T00:00:00Z'
        }
      }
    },
    getReport: async (reportId) => {
      calls.push(['getReport', reportId])
      return completedReportResponse
    },
    codGraphRAGQuery: async (payload) => {
      calls.push(['codGraphRAGQuery', payload])
      return backendResponse
    }
  }, {
    reportId: 'r1',
    simulationId: 's1',
    question: 'Q',
    project: { project_id: 'p1', graph_id: 'g1' },
    settings: { framework: 'NEXUS', reasoning: 'Auto' }
  })

  assert.deepEqual(calls, [
    ['getProject', 'p1'],
    ['getReport', 'r1'],
    ['codGraphRAGQuery', {
      question: 'Q',
      project_id: 'p1',
      graph_id: 'g1',
      reasoning_mode: 'auto',
      mode: 'adaptive_cod'
    }]
  ])
  assert.equal(adapted.qaRunId, 'qarun_1')
})

test('does not POST when the selected project was deleted before submission', async () => {
  let queryCalled = false
  const notFound = new Error('Project not found')
  notFound.response = { status: 404 }

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => { throw notFound },
      getReport: async () => completedReportResponse,
      codGraphRAGQuery: async () => {
        queryCalled = true
        return backendResponse
      }
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Keep this question',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_GRAPH_SCOPE')
      return true
    }
  )

  assert.equal(queryCalled, false)
})

test('does not POST when the authoritative project now points at another graph', async () => {
  let queryCalled = false

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => ({
        success: true,
        data: {
          project_id: 'p1',
          graph_id: 'g2',
          project_name: 'Rebuilt graph',
          status: 'graph_completed',
          updated_at: '2026-08-09T00:00:00Z'
        }
      }),
      getReport: async () => completedReportResponse,
      codGraphRAGQuery: async () => {
        queryCalled = true
        return backendResponse
      }
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Keep this question',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_GRAPH_SCOPE')
      assert.match(error.message, /graph_id/)
      return true
    }
  )

  assert.equal(queryCalled, false)
})

test('rejects a successful answer resolved through the latest-project fallback', async () => {
  const fallbackResponse = {
    ...backendResponse,
    data: {
      ...backendResponse.data,
      debug_trace: {
        ...backendResponse.data.debug_trace,
        graph_context: {
          scope_resolution: 'latest_project_fallback',
          requested_project_id: 'p1',
          requested_graph_id: 'g1',
          project_id: 'p2',
          graph_id: 'g2'
        }
      }
    }
  }

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => ({
        success: true,
        data: {
          project_id: 'p1',
          graph_id: 'g1',
          project_name: 'Graph one',
          status: 'graph_completed',
          updated_at: '2026-08-09T00:00:00Z'
        }
      }),
      getReport: async () => completedReportResponse,
      codGraphRAGQuery: async () => fallbackResponse
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Never show another graph answer',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_GRAPH_SCOPE')
      assert.match(error.message, /scope_resolution/)
      return true
    }
  )
})

test('rejects a successful answer whose resolved identifiers differ from the request', async () => {
  const mismatchedResponse = {
    ...backendResponse,
    data: {
      ...backendResponse.data,
      debug_trace: {
        ...backendResponse.data.debug_trace,
        graph_context: {
          scope_resolution: 'project_id',
          requested_project_id: 'p1',
          requested_graph_id: 'g1',
          project_id: 'p1',
          graph_id: 'g2'
        }
      }
    }
  }

  await assert.rejects(
    requestCodAnswer({
      getProject: async () => ({
        success: true,
        data: {
          project_id: 'p1',
          graph_id: 'g1',
          project_name: 'Graph one',
          status: 'graph_completed',
          updated_at: '2026-08-09T00:00:00Z'
        }
      }),
      getReport: async () => completedReportResponse,
      codGraphRAGQuery: async () => mismatchedResponse
    }, {
      reportId: 'r1',
      simulationId: 's1',
      question: 'Never show another graph answer',
      project: { project_id: 'p1', graph_id: 'g1' }
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_GRAPH_SCOPE')
      assert.match(error.message, /graph_id/)
      return true
    }
  )
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

test('marks preview answers and keeps backend identifiers empty', () => {
  const preview = completePreviewAnswer(
    submitQuestion(createQaState(), PREVIEW_QUESTION)
  )

  assert.equal(preview.phase, 'answered')
  assert.equal(preview.question, PREVIEW_QUESTION)
  assert.equal(preview.answerSource, 'preview')
  assert.equal(preview.qaRunId, '')
  assert.equal(preview.qaResult, null)
  assert.equal(canEvaluateAnswer(preview), false)
})

test('allows evaluation only for a completed live answer', () => {
  const loading = submitQuestion(createQaState(), '真实问题')
  const live = completeApiAnswer(loading, adaptCodGraphRagResponse(backendResponse))

  assert.equal(live.answerSource, 'live')
  assert.equal(canEvaluateAnswer(live), true)
  assert.equal(canEvaluateAnswer(loading), false)
})

test('extracts and preserves the citation markers emitted by the backend', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_citation',
      final_answer: '## 结论\n碳化硅改善性能<c>R1</c>。',
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, '碳化硅改善性能<c>R1</c>。')
  assert.deepEqual(adapted.answer.sections, [])
  assert.deepEqual(adapted.answer.citationIds, ['R1'])
})

test('preserves ordinary bracketed answer text while validating citation markers', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_brackets',
      final_answer: '## 结论\nASC [Al2O3-SiC-C] 体系<c>R1</c>。',
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, 'ASC [Al2O3-SiC-C] 体系<c>R1</c>。')
  assert.deepEqual(adapted.answer.sections, [])
})

test('does not render an unstructured backend answer twice as summary and section', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_single_answer',
      final_answer: 'SiC 改善 ASC 材料的抗氧化性能<c>R1</c>。',
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, 'SiC 改善 ASC 材料的抗氧化性能<c>R1</c>。')
  assert.deepEqual(adapted.answer.sections, [])
})

test('removes a generic answer section when it repeats the direct answer', () => {
  const answer = '界面反应层决定渣蚀路径<c>R1</c>。'
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_repeated_answer',
      final_answer: `${answer}\n\n## 回答\n${answer}`,
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, answer)
  assert.deepEqual(adapted.answer.sections, [])
})

test('rejects a successful response that contains no real answer text', () => {
  assert.throws(() => adaptCodGraphRagResponse({
    success: true,
    data: { qa_run_id: 'qarun_empty', final_answer: '   ', references: [] }
  }), /未返回有效回答/)
})
