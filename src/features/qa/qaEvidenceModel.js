const CONDITION_LABELS = {
  temperature: '温度',
  atmosphere: '气氛',
  composition: '组成',
  conditions: '实验条件'
}

const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

function present(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean).join('、')
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${present(item)}`)
      .filter(item => !item.endsWith(': '))
      .join('；')
  }
  return String(value ?? '').trim()
}

export function formatExperimentConditions(conditions = {}) {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return []

  return Object.entries(conditions).flatMap(([key, value]) => {
    const formatted = present(value)
    return formatted
      ? [{ key, label: CONDITION_LABELS[key] || key, value: formatted }]
      : []
  })
}

export function formatReferenceLocation(reference = {}) {
  const parts = []
  if (reference.pageNumber !== null && reference.pageNumber !== undefined) {
    parts.push(`第 ${reference.pageNumber} 页`)
  }

  if (Array.isArray(reference.bbox) && reference.bbox.length >= 4) {
    const coordinates = reference.bbox.slice(0, 4).map(value => Number(value))
    if (coordinates.every(Number.isFinite)) {
      parts.push(`bbox(${coordinates.map(value => value.toFixed(1)).join(', ')})`)
    }
  }

  if (!parts.length) {
    const spatialMetadata = reference.spatialMetadata && typeof reference.spatialMetadata === 'object'
      ? reference.spatialMetadata
      : {}
    const section = String(spatialMetadata.section_anchor || spatialMetadata.section || '').trim()
    if (section) parts.push(section)
  }

  return parts.join(' · ')
}

export function normalizeEvidenceText(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|section|article|blockquote|li|h[1-6])\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const hexadecimal = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }
      return HTML_ENTITIES[entity.toLowerCase()] ?? match
    })
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildEvidenceTextPreview(value, maxLength = 520) {
  const text = normalizeEvidenceText(value)
  const limit = Number.isFinite(Number(maxLength)) ? Math.max(1, Number(maxLength)) : 520
  if (text.length <= limit) return { text, preview: text, truncated: false }

  const initial = text.slice(0, limit)
  const breakAt = Math.max(initial.lastIndexOf('\n'), initial.lastIndexOf(' '), initial.lastIndexOf('。'))
  const preview = (breakAt >= Math.floor(limit * 0.65) ? initial.slice(0, breakAt + 1) : initial).trimEnd()
  return { text, preview: `${preview}…`, truncated: true }
}

export function buildQaReferenceSourceUrl(reference = {}, dependencies = {}) {
  const getPreviewUrl = dependencies.getPdfPreviewUrl
  const makeApiUrl = dependencies.buildApiUrl || ((path) => path)
  let url = ''

  if (reference.sourceFileId && typeof getPreviewUrl === 'function') {
    url = getPreviewUrl(reference.sourceFileId)
  } else {
    const deepLink = String(reference.deepLink || '').trim()
    if (/^https?:\/\//i.test(deepLink)) url = deepLink
    else if (deepLink.startsWith('/')) url = makeApiUrl(deepLink)
  }

  if (!url) return ''
  if (reference.pageNumber !== null && reference.pageNumber !== undefined && !/#page=/i.test(url)) {
    url += `${url.includes('#') ? '&' : '#'}page=${encodeURIComponent(reference.pageNumber)}`
  }
  return url
}

export function formatEvidenceScore(score) {
  return typeof score === 'number' && Number.isFinite(score)
    ? `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
    : ''
}
