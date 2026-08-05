const REASONING_MODES = {
  Auto: 'auto',
  CoT: 'cot',
  ToT: 'tot'
}

const STAGE_LABELS = {
  query_decomposition: '问题分解',
  subgraph_retrieval: '子图检索',
  path_reconstruction: '路径重建',
  path_verification: '路径验证',
  answer_generation: '回答生成',
  llm_answer_refinement: '回答校正'
}

function unwrapResult(payload) {
  if (payload?.final_answer !== undefined) return payload
  if (payload?.data?.final_answer !== undefined) return payload.data
  if (payload?.data?.data?.final_answer !== undefined) return payload.data.data
  return {}
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function explicitCitations(value) {
  const answer = String(value ?? '')
  return unique([
    ...[...answer.matchAll(/<c>\s*([^<]+?)\s*<\/c>/gi)].map((match) => match[1].trim()),
    ...[...answer.matchAll(/\[([^\[\]]+)\]/g)].map((match) => match[1].trim())
  ])
}

function cleanCitationMarkers(value) {
  return String(value ?? '')
    .replace(/\s*<c>\s*[^<]+?\s*<\/c>/gi, '')
    .replace(/\s*\[[^\[\]]+\]/g, '')
    .trim()
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
  const summary = cleanCitationMarkers(summaryRaw || sections[0]?.lines.join('\n') || '后端已完成回答。')
  const normalizedSections = sections.map((section) => {
    const rawBody = section.lines.join('\n').trim()
    const body = cleanCitationMarkers(rawBody)
    const boundIds = bindings
      .filter((binding) => {
        const excerpt = String(binding?.answer_excerpt ?? '').trim()
        return excerpt && (rawBody.includes(excerpt) || body.includes(cleanCitationMarkers(excerpt)))
      })
      .map((binding) => String(binding.reference_id ?? '').trim())

    return {
      title: section.title,
      body: body || '该部分没有返回正文。',
      citations: unique([...explicitCitations(rawBody), ...boundIds]).filter((id) => referenceIds.includes(id))
    }
  })

  if (!normalizedSections.length) {
    normalizedSections.push({
      title: '回答',
      body: summary,
      citations: unique([
        ...explicitCitations(summaryRaw),
        ...bindings.map((binding) => String(binding?.reference_id ?? '').trim())
      ]).filter((id) => referenceIds.includes(id))
    })
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
  const meaningfulAnswer = cleanCitationMarkers(result.final_answer)
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
  const payload = {
    question: String(question ?? '').trim(),
    reasoning_mode: REASONING_MODES[settings.reasoning] || 'auto'
  }

  const projectId = String(project?.project_id ?? '').trim()
  const graphId = String(project?.graph_id ?? '').trim()
  if (projectId && !project?.omit_project_id_from_query) payload.project_id = projectId
  if (graphId) payload.graph_id = graphId

  if (settings.framework === 'NEXUS') payload.mode = 'adaptive_cod'
  return payload
}

export async function requestCodAnswer(codGraphRAGQuery, context) {
  const response = await codGraphRAGQuery(buildCodQueryPayload(context))
  return adaptCodGraphRagResponse(response)
}
