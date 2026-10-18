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
      markdown_path: 'papers/paper.md',
      evidence_chunk: {
        chunk_id: 'chunk-4',
        text: '完整 Chunk 文本',
        evidence_type: 'text'
      },
      experiment_conditions: {
        temperature: ['1450℃'],
        atmosphere: ['air']
      },
      score: 0.86,
      source_file_id: 'pdf-1',
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

test('completed graph queries do not require a completed report', async () => {
  let reportReads = 0
  let codCalls = 0
  const adapted = await requestCodAnswer({
    getProject: async () => authoritativeProjectResponse(),
    getReport: async () => { reportReads += 1; throw new Error('report service unavailable') },
    codGraphRAGQuery: async () => { codCalls += 1; return backendResponse }
  }, {
    reportId: 'obsolete-report', simulationId: 's1',
    question: 'Keep this question', project: { project_id: 'p1', graph_id: 'g1' }
  })
  assert.equal(reportReads, 0)
  assert.equal(codCalls, 1)
  assert.equal(adapted.qaRunId, 'qarun_1')
})

test('a historical report token does not override the selected project and graph', async () => {
  let sent
  await requestCodAnswer({
    getProject: async () => authoritativeProjectResponse(),
    codGraphRAGQuery: async payload => { sent = payload; return backendResponse }
  }, {
    reportId: 'report-from-other-project', simulationId: 's1',
    question: 'Keep this question', project: { project_id: 'p1', graph_id: 'g1' }
  })
  assert.equal(sent.project_id, 'p1')
  assert.equal(sent.graph_id, 'g1')
  assert.equal(Object.hasOwn(sent, 'report_id'), false)
})

test('fails closed when the authoritative project preflight cannot be read', async () => {
  let calls = 0
  await assert.rejects(() => requestCodAnswer({
    getProject: async () => { throw new Error('project service unavailable') },
    codGraphRAGQuery: async () => { calls += 1; return backendResponse }
  }, {
    simulationId: 's1', question: 'Keep this question',
    project: { project_id: 'p1', graph_id: 'g1' }
  }), /project service unavailable/)
  assert.equal(calls, 0)
})

test('blocks an authoritative project simulation mismatch before sending the query', async () => {
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
    pageNumber: 4,
    markdownPath: 'papers/paper.md',
    excerpt: '实验原文',
    chunkId: 'chunk-4',
    chunkText: '完整 Chunk 文本',
    experimentConditions: {
      temperature: ['1450℃'],
      atmosphere: ['air']
    },
    score: 0.86,
    sourceFileId: 'pdf-1',
    paperId: '',
    bbox: [],
    spatialMetadata: {},
    deepLink: ''
  })
  assert.equal(Object.hasOwn(adapted.answer, 'researchPath'), false)
})

test('builds an explicitly scoped CoD request from the selected project', () => {
  assert.deepEqual(buildCodQueryPayload({
    question: '为什么热震稳定性提升？',
    simulationId: 'simulation-1',
    project: { project_id: 'project-1', graph_id: 'graph-1' },
    settings: { framework: 'Hybrid RAG', reasoning: 'ToT', ontologyEnabled: false }
  }), {
    question: '为什么热震稳定性提升？',
    project_id: 'project-1',
    graph_id: 'graph-1',
    simulation_id: 'simulation-1',
    reasoning_mode: 'tot',
    top_k_subgraphs: 5,
    top_k_paths: 8,
    enable_verification: true,
    enable_llm_decomposition_fallback: false,
    enable_llm_path_verification: false,
    enable_llm_reasoning_judge: false,
    enable_llm_answer_refinement: true,
    force_llm_answer_refinement: true,
    enable_graph_mutation_proposal: true,
    show_audit_appendix: false
  })
})

test('uses the original ontology mechanism query mode when ontology enhancement is enabled', () => {
  assert.equal(buildCodQueryPayload({
    question: '为什么热震稳定性提升？',
    simulationId: 'simulation-1',
    project: { project_id: 'project-1', graph_id: 'graph-1' },
    settings: { framework: 'NEXUS', reasoning: 'Auto', ontologyEnabled: true }
  }).mode, 'ontology_mechanism_query')
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
    ['codGraphRAGQuery', {
      question: 'Q',
      project_id: 'p1',
      graph_id: 'g1',
      simulation_id: 's1',
      reasoning_mode: 'auto',
      mode: 'ontology_mechanism_query',
      top_k_subgraphs: 5,
      top_k_paths: 8,
      enable_verification: true,
      enable_llm_decomposition_fallback: false,
      enable_llm_path_verification: false,
      enable_llm_reasoning_judge: false,
      enable_llm_answer_refinement: true,
      force_llm_answer_refinement: true,
      enable_graph_mutation_proposal: true,
      show_audit_appendix: false
    }]
  ])
  assert.equal(adapted.qaRunId, 'qarun_1')
})

test('accepts the new backend project and graph scope when both resolved identifiers match', async () => {
  const combinedScopeResponse = {
    ...backendResponse,
    data: {
      ...backendResponse.data,
      debug_trace: {
        ...backendResponse.data.debug_trace,
        graph_context: {
          ...backendResponse.data.debug_trace.graph_context,
          scope_resolution: 'project_id+graph_id'
        }
      }
    }
  }

  const adapted = await requestCodAnswer({
    getProject: async () => authoritativeProjectResponse(),
    codGraphRAGQuery: async () => combinedScopeResponse
  }, {
    simulationId: 's1',
    question: 'Q',
    project: { project_id: 'p1', graph_id: 'g1' }
  })

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
  assert.equal(completed.evidenceOpen, false)

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

test('keeps chunk-only evidence out of the paper quote and page fields', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_chunk_only',
      final_answer: '真实回答<c>R1</c>',
      references: [{
        reference_id: 'R1',
        source_label: 'evidence_board',
        markdown_path: 'internal/project/path.md',
        evidence_chunk: {
          chunk_id: 'chunk-only-1',
          text: '只有真实 Chunk，没有论文原文和页码。'
        }
      }]
    }
  })

  assert.equal(adapted.references[0].excerpt, '')
  assert.equal(adapted.references[0].chunkText, '只有真实 Chunk，没有论文原文和页码。')
  assert.equal(adapted.references[0].locator, '')
  assert.equal(adapted.references[0].pageNumber, null)
})

test('preserves backend paper identifiers and spatial reference location', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_location',
      final_answer: '真实回答<c>R1</c>',
      references: [{
        reference_id: 'R1',
        source_label: 'paper.pdf',
        paper_id: 'paper-asc-1',
        markdown_path: 'papers/paper.md',
        bbox: [12.4, 30, 120.25, 88.6],
        spatial_metadata: { section_anchor: 'Results 3.2' },
        evidence_chunk: { chunk_id: 'chunk-4', text: '证据' }
      }]
    }
  })

  assert.equal(adapted.references[0].paperId, 'paper-asc-1')
  assert.equal(adapted.references[0].markdownPath, 'papers/paper.md')
  assert.deepEqual(adapted.references[0].bbox, [12.4, 30, 120.25, 88.6])
  assert.deepEqual(adapted.references[0].spatialMetadata, { section_anchor: 'Results 3.2' })
})

test('prefers the original deep-interaction LLM refined answer over final_answer', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_llm_refined',
      llm_cod_direct_answer: '## 结论\nLLM 精炼回答<c>R1</c>。',
      final_answer: '## 结论\n旧 final_answer。',
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, 'LLM 精炼回答<c>R1</c>。')
  assert.equal(adapted.qaResult.final_answer, '## 结论\n旧 final_answer。')
})

test('keeps mixed CoD and OMD content out of the primary refined answer', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_separated_modules',
      final_answer: '## 结论\n精炼后的 LLMs + CoD 主回答<c>R1</c>。',
      cod_direct_answer: [
        '<div class="cod-direct-answer-block"><i>用户问的是某问题，应该围绕某目标回答。</i></div>',
        '<div class="omd-direct-answer-block"><strong>OMD 本体逻辑链</strong></div>'
      ].join(''),
      debug_trace: {
        stages: ['llm_initial_question_answer', 'path_grounded_answer_generation']
      },
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, '精炼后的 LLMs + CoD 主回答<c>R1</c>。')
  assert.doesNotMatch(adapted.answer.summary, /用户问的是|OMD 本体逻辑链/)
  assert.deepEqual(adapted.answerDetails.map(item => item.id), ['cod', 'omd'])
  assert.match(adapted.answerDetails[0].content, /用户问的是/)
  assert.match(adapted.answerDetails[1].content, /OMD 本体逻辑链/)
  assert.equal(Object.hasOwn(adapted.answer, 'researchPath'), false)
})

test('isolates the CoD body when refined answer fields contain the combined answer scaffold', () => {
  const combinedAnswer = [
    '## CoD + OMD 本体融合回答',
    '### CoD 证据主线',
    '组合字段中的 CoD 内容。',
    '### 本体增强融合分析',
    '组合字段中的 OMD、推理与量化指标。'
  ].join('\n')
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_combined_scaffold',
      llm_cod_direct_answer: combinedAnswer,
      final_answer: combinedAnswer,
      cod_direct_answer: [
        '<div class="cod-direct-answer-block">',
        '<div class="direct-answer-block-title">CoD 直接回答</div>',
        '<i>隔离后的 CoD 主体<c>R1</c>。</i>',
        '</div>',
        '<div class="omd-direct-answer-block"><strong>独立 OMD 内容</strong></div>'
      ].join(''),
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  const renderedAnswer = [
    adapted.answer.summary,
    ...adapted.answer.sections.flatMap(section => [section.title, section.body])
  ].join('\n')

  assert.match(renderedAnswer, /隔离后的 CoD 主体<c>R1<\/c>/)
  assert.doesNotMatch(
    renderedAnswer,
    /CoD \+ OMD 本体融合回答|本体增强融合分析|独立 OMD 内容|量化指标/
  )
})

test('keeps the final LLM plus CoD answer isolated and uses the original embedded OMD detail', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun-real-shape',
      llm_cod_direct_answer: '最终主回答<c>R1</c>\n## 结论条件\n该小标题仍属于最终主回答。',
      final_answer: '不应覆盖 llm_cod_direct_answer',
      cod_direct_answer: [
        '<div class="cod-direct-answer-block">',
        '<div class="direct-answer-block-title">CoD 直接回答</div>',
        '<i>真实 CoD 路径结论</i>',
        '</div>',
        '<div class="omd-direct-answer-block">',
        '<div class="direct-answer-block-title omd">OMD 本体增强直接回答</div>',
        '内嵌 OMD 回退内容',
        '</div>'
      ].join(''),
      ontology_direct_answer_gain: '<strong>真实独立 OMD 结论</strong>',
      logic_chain_derivation: '真实详细推理链',
      reasoning_route: { selected_mode: 'cot', reason: '真实 CoT 路由依据' },
      qa_quantitative_metrics: { confidence_score: 0.95 },
      references: [{
        reference_id: 'R1',
        source_label: 'paper.pdf',
        original_quote: '真实证据'
      }]
    }
  })

  assert.equal(adapted.answer.summary, '最终主回答<c>R1</c>')
  assert.deepEqual(adapted.answer.sections, [{
    title: '结论条件',
    body: '该小标题仍属于最终主回答。',
    citations: []
  }])
  assert.deepEqual(adapted.answerDetails.slice(0, 2), [
    { id: 'cod', label: 'CoD 直接回答', content: '*真实 CoD 路径结论*' },
    { id: 'omd', label: 'OMD 本体增强', content: '内嵌 OMD 回退内容' }
  ])
  assert.deepEqual(adapted.answerDetails.map(item => item.id), ['cod', 'omd', 'logic', 'reasoning'])
  assert.equal(adapted.answerDetails[2].content, '真实详细推理链')
  assert.equal(adapted.answerDetails[3].trace.mode, 'cot')
})

test('adapts real answer detail fields and normalizes backend block HTML', () => {
  const adapted = adaptCodGraphRagResponse({
    success: true,
    data: {
      qa_run_id: 'qarun_details',
      llm_cod_direct_answer: '<p>LLMs + CoD 主回答<c>R1</c></p>',
      final_answer: '旧 final_answer',
      cod_direct_answer: [
        '<div class="cod-direct-answer-block"><i>CoD 直接回答<c>R1</c></i></div>',
        '<div class="omd-direct-answer-block"><strong>OMD 本体结论</strong></div>'
      ].join(''),
      logic_chain_derivation: '真实详细推理链',
      reasoning_route: { selected_mode: 'cot', reason: '真实路由依据' },
      routed_reasoning_paths: [{ natural_language_path: '节点 A -> 节点 B' }],
      references: [{ reference_id: 'R1', source_label: 'paper.pdf' }],
      citation_bindings: []
    }
  })

  assert.equal(adapted.answer.summary, 'LLMs + CoD 主回答<c>R1</c>')
  assert.deepEqual(adapted.answerDetails.map(item => item.id), ['cod', 'omd', 'logic', 'reasoning'])
  assert.equal(adapted.answerDetails[0].content, '*CoD 直接回答<c>R1</c>*')
  assert.equal(adapted.answerDetails[2].content, '真实详细推理链')
  assert.deepEqual(adapted.answerDetails[3].trace.paths[0].nodes, ['节点 A', '节点 B'])
  assert.doesNotMatch(adapted.answer.summary, /<p>|<div>/)

  const completed = completeApiAnswer(submitQuestion(createQaState(), '真实问题'), adapted)
  assert.deepEqual(completed.answerDetails, adapted.answerDetails)
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
