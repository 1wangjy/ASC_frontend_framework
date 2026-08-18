function text(value) {
  return String(value ?? '').trim()
}

export function buildProjectReportTitle(projectName) {
  return `${text(projectName) || '未关联图谱'} · 研究报告`
}

export function normalizeReportStatus(value) {
  const status = text(value).toLowerCase()
  if (status === 'completed') return 'completed'
  if (['planning', 'generating', 'processing', 'running', 'pending'].includes(status)) return 'generating'
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

function parseSectionHeading(content, index) {
  const heading = String(content ?? '').match(/^##(?!#)\s+(.+?)\s*$/m)?.[1]?.trim() || ''
  const numberedHeading = heading.match(/^(\d+)\s+(.+)$/)
  return {
    number: numberedHeading?.[1] || String(index).padStart(2, '0'),
    title: numberedHeading?.[2]?.trim() || heading || `第 ${index} 章`
  }
}

const SECTION_HIGHLIGHT_LABELS = [
  '核心洞察',
  '研究认知',
  '关键中介变量',
  '可验证假设',
  '设计原则',
  '后续分析重点',
  '分析主线',
  '验证边界'
]

const SECTION_KEYWORDS = [
  'Al2O3',
  'SiC',
  'SiO2',
  'MgO',
  'CAC',
  'HA',
  '尖晶石',
  '莫来石',
  '孔隙率',
  '孔隙连通性',
  '分散均匀性',
  '显微结构',
  '界面',
  '热震稳定性',
  '抗氧化性',
  '抗侵蚀性',
  'SEM/EDS',
  'XRD',
  'TG-DSC',
  'MIP'
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findKeywordIndex(content, keyword) {
  if (!/[A-Za-z0-9]/.test(keyword)) return content.indexOf(keyword)

  const matcher = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(keyword)})(?=$|[^A-Za-z0-9])`, 'i')
  const match = matcher.exec(content)
  return match ? match.index + match[1].length : -1
}

export function extractSectionKeywords(content, limit = 8) {
  const maximum = Math.max(0, Number(limit) || 0)
  if (!maximum) return []

  const source = String(content ?? '')
  return SECTION_KEYWORDS
    .map((keyword, vocabularyIndex) => ({
      keyword,
      vocabularyIndex,
      sourceIndex: findKeywordIndex(source, keyword)
    }))
    .filter(match => match.sourceIndex >= 0)
    .sort((left, right) => left.sourceIndex - right.sourceIndex || left.vocabularyIndex - right.vocabularyIndex)
    .slice(0, maximum)
    .map(match => match.keyword)
}

function parseHighlightHeading(line) {
  const heading = String(line ?? '').trim().replace(/^#{1,6}\s+/, '').trim()

  for (const label of SECTION_HIGHLIGHT_LABELS) {
    for (const prefix of [label, `**${label}**`]) {
      if (heading === prefix) return { label, inlineText: '' }
      for (const separator of ['：', ':']) {
        if (heading.startsWith(`${prefix}${separator}`)) {
          return {
            label,
            inlineText: heading.slice(prefix.length + separator.length).trim()
          }
        }
      }
    }
  }

  return null
}

function collectHighlightBlock(lines, startIndex) {
  const listItems = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (parseHighlightHeading(line) || /^#{1,6}\s+/.test(trimmed) || /^\*\*[^*]+\*\*\s*$/.test(trimmed)) {
      break
    }

    const listItem = trimmed.match(/^(?:[-+*]|\d+[.)、])\s+(.+)$/)
    if (listItem) {
      listItems.push(listItem[1].trim())
    }
    index += 1
  }

  return { listItems, nextIndex: index }
}

export function extractSectionHighlights(content, limit = 4) {
  const maximum = Math.max(0, Number(limit) || 0)
  if (!maximum) return []

  const lines = String(content ?? '').split(/\r?\n/)
  const highlights = []

  for (let index = 0; index < lines.length && highlights.length < maximum; index += 1) {
    const heading = parseHighlightHeading(lines[index])
    if (!heading) continue

    const block = collectHighlightBlock(lines, index + 1)
    for (const item of block.listItems) {
      if (highlights.length >= maximum) break
      highlights.push({ label: heading.label, text: item })
    }
    index = Math.max(index, block.nextIndex - 1)
  }

  return highlights
}

export function buildReportSections(_report = {}, sectionsResponse = {}) {
  const saved = unwrapReportSections(sectionsResponse).sections

  return saved
    .map((section, sourceIndex) => {
      const index = Math.max(1, Number(section?.section_index) || sourceIndex + 1)
      const content = String(section?.content ?? section?.markdown_content ?? '')
      const heading = parseSectionHeading(content, index)
      return {
        index,
        number: heading.number,
        title: heading.title,
        filename: text(section?.filename),
        content
      }
    })
    .filter(section => section.content.trim())
    .sort((left, right) => left.index - right.index)
}

export function resolveCurrentSection(sections = [], currentSection = null) {
  if (!Array.isArray(sections) || !sections.length) return null
  const currentIndex = Number(currentSection?.index)
  return sections.find(section => Number(section?.index) === currentIndex) || sections[0]
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
