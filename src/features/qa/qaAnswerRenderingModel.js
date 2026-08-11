import { findAscDomainTermMatches } from '../../utils/ascDomainHighlighter.js'

const INLINE_CITATION_PATTERN = /<c>\s*(R\d+)\s*<\/c>|\[(R\d+)\]/gi

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

export function buildQaAnswerSegments(text, { referenceIds = [], domainTerms = [] } = {}) {
  const value = String(text ?? '')
  const knownReferences = new Set(referenceIds.map(id => String(id).toUpperCase()))
  const segments = []
  let cursor = 0

  for (const match of value.matchAll(INLINE_CITATION_PATTERN)) {
    appendTextSegments(segments, value.slice(cursor, match.index), domainTerms)
    const citationId = String(match[1] || match[2] || '').toUpperCase()
    if (knownReferences.has(citationId)) {
      segments.push({ type: 'citation', citationId, text: `[${citationId}]` })
    } else {
      segments.push({ type: 'text', text: `[${citationId}]` })
    }
    cursor = match.index + match[0].length
  }

  appendTextSegments(segments, value.slice(cursor), domainTerms)
  return segments
}
