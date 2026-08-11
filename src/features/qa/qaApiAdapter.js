const REASONING_MODES = {
  Auto: 'auto',
  CoT: 'cot',
  ToT: 'tot'
}

const INVALID_GRAPH_SCOPE_CODE = 'INVALID_GRAPH_SCOPE'

const STAGE_LABELS = {
  query_decomposition: '问题分解',
  subgraph_retrieval: '子图检索',
  path_reconstruction: '路径重建',
  path_verification: '路径验证',
  answer_generation: '回答生成',
  llm_answer_refinement: '回答校正'
}

function unwrapResult(payload) {
  if (!payload) return {}
  if (payload?.final_answer !== undefined) return payload
  if (payload?.data?.final_answer !== undefined) return payload.data
  if (payload?.data?.data?.final_answer !== undefined) return payload.data.data
  if (payload?.answer !== undefined) return payload
  if (payload?.data?.answer !== undefined) return payload.data
  return {}
}

function invalidGraphScope(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = INVALID_GRAPH_SCOPE_CODE
  return error
}

function isMissingScopeResponse(error) {
  const status = error?.response?.status
  const message = String(error?.message ?? '').toLowerCase()
  return status === 404 || /graph.*not found|project.*not found|图谱不存在|项目不存在/.test(message)
}

function projectFromResponse(response) {
  if (response?.data && typeof response.data === 'object') return response.data
  return response && typeof response === 'object' ? response : null
}

function assertAuthoritativeProjectScope(requestScope, response) {
  if (response?.success === false) {
    throw invalidGraphScope(response?.error || 'Selected project no longer exists')
  }

  const project = projectFromResponse(response)
  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()
  if (!projectId || projectId !== requestScope.project_id) {
    throw invalidGraphScope('Authoritative project_id does not match the selected project')
  }
  if (!graphId || graphId !== requestScope.graph_id) {
    throw invalidGraphScope('Authoritative graph_id does not match the selected graph')
  }
}

function assertResolvedResponseScope(payload, requestScope) {
  const graphContext = unwrapResult(payload)?.debug_trace?.graph_context
  if (!graphContext || typeof graphContext !== 'object') {
    throw invalidGraphScope('Successful answer is missing debug_trace.graph_context')
  }

  if (String(graphContext.scope_resolution ?? '').trim() !== 'project_id') {
    throw invalidGraphScope('Response scope_resolution did not resolve from the requested project_id')
  }
  if (String(graphContext.project_id ?? '').trim() !== requestScope.project_id) {
    throw invalidGraphScope('Resolved response project_id does not match the request')
  }
  if (String(graphContext.graph_id ?? '').trim() !== requestScope.graph_id) {
    throw invalidGraphScope('Resolved response graph_id does not match the request')
  }
}

export function isInvalidGraphScopeError(error) {
  return error?.code === INVALID_GRAPH_SCOPE_CODE
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function explicitCitations(value) {
  const answer = String(value ?? '')
  return unique([
    ...[...answer.matchAll(/<c>\s*(R\d+)\s*<\/c>/gi)].map((match) => match[1].toUpperCase()),
    ...[...answer.matchAll(/\[(R\d+)\]/gi)].map((match) => match[1].toUpperCase())
  ])
}

function stripCitationMarkers(value) {
  return String(value ?? '')
    .replace(/\s*<c>\s*R\d+\s*<\/c>/gi, '')
    .replace(/\s*\[R\d+\]/gi, '')
    .trim()
}

function comparableAnswerText(value) {
  return stripCitationMarkers(value)
    .replace(/<\/?(?:i|em|strong|b)>/gi, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^(?:直接回答|回答|结论|答案|direct answer|answer|conclusion)\s*[:：]\s*/i, '')
    .replace(/\s+/g, '')
    .trim()
}

function isGenericAnswerTitle(value) {
  return /^(?:直接回答|回答|结论|答案|direct answer|answer|conclusion)$/i.test(String(value ?? '').trim())
}

function parseAnswer(markdown, bindings, referenceIds) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const summaryLines = []
  const sections = []
  let current = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const heading = line.match(/^#{2,6}\s+(.+)$/)
    if (heading) {
      current = { title: heading[1].trim(), lines: [] }
      sections.push(current)
    } else if (current) {
      if (line) current.lines.push(line)
    } else if (line && !line.startsWith('#')) {
      summaryLines.push(line)
    }
  }

  const summaryRaw = summaryLines.join('\n').trim()
  let summary = summaryRaw
  let normalizedSections = sections.map((section) => {
    const rawBody = section.lines.join('\n').trim()
    const body = rawBody
    const boundIds = bindings
      .filter((binding) => {
        const excerpt = String(binding?.answer_excerpt ?? '').trim()
        return excerpt && (
          rawBody.includes(excerpt)
          || stripCitationMarkers(rawBody).includes(stripCitationMarkers(excerpt))
        )
      })
      .map((binding) => String(binding.reference_id ?? '').trim())

    return {
      title: section.title,
      body: body || '该部分没有返回正文。',
      citations: unique([...explicitCitations(rawBody), ...boundIds]).filter((id) => referenceIds.includes(id))
    }
  })

  if (!summary && normalizedSections.length && isGenericAnswerTitle(normalizedSections[0].title)) {
    summary = normalizedSections[0].body
    normalizedSections = normalizedSections.slice(1)
  }

  if (summary) {
    const comparableSummary = comparableAnswerText(summary)
    normalizedSections = normalizedSections.filter(section => !(
      isGenericAnswerTitle(section.title)
      && comparableAnswerText(section.body) === comparableSummary
    ))
  }

  return { summary, sections: normalizedSections }
}

function adaptReference(reference = {}) {
  const metadata = reference.metadata && typeof reference.metadata === 'object' ? reference.metadata : {}
  const rawAuthors = metadata.authors ?? metadata.author ?? ''
  const authors = Array.isArray(rawAuthors) ? rawAuthors.join('、') : String(rawAuthors ?? '')
  const pageNumber = reference.page_number

  return {
    id: String(reference.reference_id ?? '').trim(),
    title: String(
      reference.source_label
      || reference.paper_id
      || reference.source_file_id
      || reference.reference_id
      || '未命名来源'
    ),
    authors,
    source: String(reference.source ?? 'unknown'),
    year: metadata.year ?? '',
    locator: pageNumber !== null && pageNumber !== undefined
      ? `第 ${pageNumber} 页`
      : String(reference.markdown_path ?? ''),
    excerpt: String(reference.original_quote || reference.evidence_chunk?.quote || ''),
    sourceFileId: String(reference.source_file_id ?? ''),
    deepLink: String(reference.deep_link ?? '')
  }
}

function researchPathOf(result) {
  const stages = Array.isArray(result?.debug_trace?.stages) ? result.debug_trace.stages : []
  const labels = stages.map((stage) => {
    const key = typeof stage === 'string' ? stage : stage?.stage
    return STAGE_LABELS[key] || String(key ?? '').trim()
  }).filter(Boolean)

  return unique(labels).length
    ? unique(labels)
    : ['问题分解', '子图检索', '路径验证', '回答生成']
}

export function adaptCodGraphRagResponse(payload = {}) {
  const result = unwrapResult(payload)
  const meaningfulAnswer = stripCitationMarkers(result.final_answer)
    .replace(/^#{1,6}\s+.*$/gm, '')
    .trim()
  if (!meaningfulAnswer) {
    throw new Error('后端未返回有效回答，请重新尝试。')
  }
  const rawReferences = Array.isArray(result.references) ? result.references : []
  const references = rawReferences.map(adaptReference).filter((reference) => reference.id)
  const referenceIds = references.map((reference) => reference.id)
  const bindings = Array.isArray(result.citation_bindings) ? result.citation_bindings : []
  const parsed = parseAnswer(result.final_answer, bindings, referenceIds)

  return {
    qaRunId: String(result.qa_run_id ?? ''),
    qaResult: result,
    answer: {
      summary: parsed.summary,
      sections: parsed.sections,
      citationIds: referenceIds,
      researchPath: researchPathOf(result)
    },
    references
  }
}

export function buildCodQueryPayload({ question, project, settings = {} } = {}) {
  const normalizedQuestion = String(question ?? '').trim()
  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()

  if (!normalizedQuestion) throw new Error('question 不能为空')
  if (!projectId || !graphId) throw new Error('问答请求必须同时包含 project_id 和 graph_id')

  const payload = {
    question: normalizedQuestion,
    project_id: projectId,
    graph_id: graphId,
    reasoning_mode: REASONING_MODES[settings.reasoning] || 'auto'
  }

  if (settings.framework === 'NEXUS') payload.mode = 'adaptive_cod'
  return payload
}

export async function requestCodAnswer({ codGraphRAGQuery, getProject } = {}, context) {
  if (typeof getProject !== 'function' || typeof codGraphRAGQuery !== 'function') {
    throw new TypeError('requestCodAnswer requires getProject and codGraphRAGQuery')
  }

  const payload = buildCodQueryPayload(context)
  let projectResponse
  try {
    projectResponse = await getProject(payload.project_id)
  } catch (error) {
    if (isMissingScopeResponse(error)) {
      throw invalidGraphScope('Selected project no longer exists', error)
    }
    throw error
  }
  assertAuthoritativeProjectScope(payload, projectResponse)

  let response
  try {
    response = await codGraphRAGQuery(payload)
  } catch (error) {
    if (isMissingScopeResponse(error)) {
      throw invalidGraphScope('Selected graph scope no longer exists', error)
    }
    throw error
  }
  assertResolvedResponseScope(response, payload)
  return adaptCodGraphRagResponse(response)
}
