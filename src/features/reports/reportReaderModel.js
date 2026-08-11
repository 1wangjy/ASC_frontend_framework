function text(value) {
  return String(value ?? '').trim()
}

export function buildProjectReportTitle(projectName) {
  return `${text(projectName) || '未关联图谱'} · 研究报告`
}

export function normalizeReportStatus(value) {
  const status = text(value).toLowerCase()
  if (status === 'completed') return 'completed'
  if (['generating', 'processing', 'running', 'pending'].includes(status)) return 'generating'
  if (['failed', 'error'].includes(status)) return 'failed'
  return 'unknown'
}

export function unwrapReportSections(response = {}) {
  const data = response?.data && !Array.isArray(response.data)
    ? response.data
    : response
  return {
    sections: Array.isArray(data?.sections) ? data.sections : [],
    totalSections: Math.max(0, Number(data?.total_sections) || 0),
    complete: data?.is_complete === true
  }
}

function outlineSections(report = {}) {
  return Array.isArray(report?.outline?.sections) ? report.outline.sections : []
}

export function buildReportSections(report = {}, sectionsResponse = {}) {
  const outline = outlineSections(report)
  const saved = unwrapReportSections(sectionsResponse).sections
  const source = saved.length
    ? saved
    : outline.map((section, index) => ({
        section_index: index + 1,
        section_title: section?.title,
        content: section?.content
      }))

  return source
    .map((section, sourceIndex) => {
      const index = Math.max(1, Number(section?.section_index) || sourceIndex + 1)
      const matchingOutline = outline[index - 1] || {}
      return {
        index,
        title: text(section?.section_title || section?.title || matchingOutline.title) || `第 ${index} 章`,
        content: text(section?.content || section?.markdown_content)
      }
    })
    .filter(section => section.content)
    .sort((left, right) => left.index - right.index)
}

export function buildReportProgress(report = {}, sectionsResponse = {}) {
  const normalized = unwrapReportSections(sectionsResponse)
  const renderedSections = buildReportSections(report, sectionsResponse)
  const total = Math.max(
    normalized.totalSections,
    outlineSections(report).length,
    renderedSections.length
  )
  const finished = normalizeReportStatus(report?.status) === 'completed' || normalized.complete
  const completed = finished ? total : Math.min(total, renderedSections.length)
  return {
    completed,
    total,
    percent: finished ? 100 : (total ? Math.round((completed / total) * 100) : 0)
  }
}
