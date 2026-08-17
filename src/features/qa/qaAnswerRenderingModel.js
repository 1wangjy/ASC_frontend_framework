import { findAscDomainTermMatches } from '../../utils/ascDomainHighlighter.js'

const INLINE_MARKUP_PATTERN = /<c>\s*(R\d+)\s*<\/c>|\[(R\d+)\]|<(i|em|strong|b)>([\s\S]*?)<\/\3>|\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`\n]+?)`|\*([^*\n]+?)\*|_([^_\n]+?)_/gi

function appendTextSegments(target, text, domainTerms) {
  if (!text) return

  const matches = findAscDomainTermMatches(text, domainTerms, {
    maxMatches: Math.max(3, Math.min(8, Math.ceil(String(text).length / 90))),
    maxPerSentence: 3
  })
  let cursor = 0

  for (const match of matches) {
    if (match.start > cursor) {
      target.push({ type: 'text', text: text.slice(cursor, match.start) })
    }
    target.push({
      type: 'domain',
      text: match.text,
      category: match.category,
      categoryLabel: match.categoryLabel,
      source: match.source
    })
    cursor = match.end
  }

  if (cursor < text.length) {
    target.push({ type: 'text', text: text.slice(cursor) })
  }
}

function sourceDocumentId(reference = {}) {
  return String(
    reference.sourceFileId
    || reference.source_file_id
    || reference.paperId
    || reference.paper_id
    || reference.documentId
    || reference.document_id
    || ''
  ).trim()
}

export function buildQaEvidenceStats(references = []) {
  const records = Array.isArray(references) ? references : []
  const documentIds = records.map(sourceDocumentId)
  return {
    citationCount: records.length,
    documentCount: documentIds.every(Boolean)
      ? new Set(documentIds).size
      : null
  }
}

function formatSegment(match, options) {
  const htmlTag = String(match[3] || '').toLowerCase()
  const format = htmlTag === 'i' || htmlTag === 'em'
    ? 'emphasis'
    : htmlTag === 'strong' || htmlTag === 'b'
      ? 'strong'
      : match[5] !== undefined || match[6] !== undefined
        ? 'strong'
        : match[7] !== undefined
          ? 'code'
          : 'emphasis'
  const content = match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8] ?? match[9] ?? ''

  return {
    type: 'format',
    format,
    text: String(content),
    children: format === 'code'
      ? [{ type: 'text', text: String(content) }]
      : buildQaAnswerSegments(content, options)
  }
}

export function buildQaAnswerSegments(text, { referenceIds = [], domainTerms = [] } = {}) {
  const value = String(text ?? '')
  const knownReferences = new Set(referenceIds.map(id => String(id).toUpperCase()))
  const options = { referenceIds: [...knownReferences], domainTerms }
  const segments = []
  let cursor = 0

  for (const match of value.matchAll(INLINE_MARKUP_PATTERN)) {
    appendTextSegments(segments, value.slice(cursor, match.index), domainTerms)
    const citationId = String(match[1] || match[2] || '').toUpperCase()
    if (citationId) {
      if (knownReferences.has(citationId)) {
        segments.push({ type: 'citation', citationId, text: `[${citationId}]` })
      } else {
        segments.push({ type: 'text', text: `[${citationId}]` })
      }
    } else {
      segments.push(formatSegment(match, options))
    }
    cursor = match.index + match[0].length
  }

  appendTextSegments(segments, value.slice(cursor), domainTerms)
  return segments
}
