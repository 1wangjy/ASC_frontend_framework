const PDF_SIGNATURE = '%PDF-'

async function readFileBytes(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('请选择 PDF 文件')
  }
  return new Uint8Array(await file.arrayBuffer())
}

function hasPdfSignature(bytes) {
  return new TextDecoder('ascii').decode(bytes.slice(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE
}

function decodeUtf16Be(bytes) {
  let value = ''
  for (let index = 2; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
  }
  return value
}

function decodePdfBytes(bytes) {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeUtf16Be(bytes)
  return new TextDecoder('latin1').decode(bytes)
}

function parseHexString(source, start) {
  const end = source.indexOf('>', start + 1)
  if (end === -1) return null

  let hex = source.slice(start + 1, end).replace(/\s/g, '')
  if (!/^[0-9a-f]*$/i.test(hex)) return null
  if (hex.length % 2) hex += '0'

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }
  return decodePdfBytes(bytes)
}

function parseLiteralString(source, start) {
  let depth = 1
  let value = ''

  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]

    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) break
      if (/[0-7]/.test(next)) {
        const octal = source.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0] || next
        value += String.fromCharCode(Number.parseInt(octal, 8))
        index += octal.length
        continue
      }
      if (next === '\r' || next === '\n') {
        if (next === '\r' && source[index + 2] === '\n') index += 1
        index += 1
        continue
      }
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
      value += escapes[next] ?? next
      index += 1
      continue
    }

    if (char === '(') {
      depth += 1
      value += char
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0) return value
      value += char
      continue
    }
    value += char
  }

  return null
}

function findDocumentInfoValue(source, key) {
  const marker = new RegExp(`/${key}\\b`, 'g')
  let match = marker.exec(source)

  while (match) {
    let index = match.index + match[0].length
    while (/\s/.test(source[index] || '')) index += 1

    const value = source[index] === '('
      ? parseLiteralString(source, index)
      : source[index] === '<' && source[index + 1] !== '<'
        ? parseHexString(source, index)
        : null

    if (typeof value === 'string' && value.trim()) return value.trim()
    match = marker.exec(source)
  }

  return ''
}

function mapExplicitType(value = '') {
  const normalized = String(value).replace(/<[^>]+>/g, ' ').toLowerCase()

  if (/\bpatent\b/.test(normalized)) return 'patent'
  if (/\b(?:conference|proceedings|symposium)\b/.test(normalized)) return 'conference'
  if (/\b(?:book|monograph|handbook|manual|textbook)\b/.test(normalized)) return 'book'
  if (/\b(?:journal|article)\b/.test(normalized)) return 'journal'
  return ''
}

function findExplicitXmpType(source) {
  const marker = /<(?:dc:type|prism:publicationType)\b[^>]*>([\s\S]{0,240}?)<\/(?:dc:type|prism:publicationType)>/gi
  let match = marker.exec(source)

  while (match) {
    const entryType = mapExplicitType(match[1])
    if (entryType) return entryType
    match = marker.exec(source)
  }
  return ''
}

function findFourDigitYear(value = '') {
  const match = String(value).match(/(?:^|[^\d])((?:18|19|20)\d{2})(?!\d)/)
  return match?.[1] || ''
}

function findXmpYear(source, tags) {
  const tagPattern = tags.join('|')
  const marker = new RegExp(`<(?:${tagPattern})\\b[^>]*>([\\s\\S]{0,240}?)<\\/(?:${tagPattern})>`, 'gi')
  let match = marker.exec(source)

  while (match) {
    const year = findFourDigitYear(match[1].replace(/<[^>]+>/g, ' '))
    if (year) return year
    match = marker.exec(source)
  }
  return ''
}

function inferLiteratureYear({ source, title, filename }) {
  const publicationYear = findXmpYear(source, ['prism:publicationDate', 'prism:coverDate'])
  if (publicationYear) return publicationYear

  const labelYear = findFourDigitYear(`${title || ''} ${fallbackTitleFromFilename(filename)}`)
  if (labelYear) return labelYear
  return ''
}

function inferLiteratureEntryType({ source, title, filename }) {
  const explicitType = findExplicitXmpType(source)
  if (explicitType) return explicitType

  if (/\b(?:CN\s?\d{7,12}[A-Z]\d?|WO\s?\d{4}\/?\d{4,8}[A-Z]\d?|US\s?\d{7,11}[A-Z]\d?)\b/i.test(source)) {
    return 'patent'
  }
  if (/\bISBN(?:-1[03])?\s*:?\s*(?:97[89][\s-]?)?[\dX](?:[\dX\s-]{7,20})\b/i.test(source)) {
    return 'book'
  }
  if (/\bISSN\s*:?\s*\d{4}-?\d{3}[\dX]\b/i.test(source)) {
    return 'journal'
  }

  const label = `${title || ''} ${fallbackTitleFromFilename(filename)}`
  if (/(?:专利|\bpatent\b)/i.test(label)) return 'patent'
  if (/(?:会议论文|会议录|\bconference\b|\bproceedings\b|\bsymposium\b)/i.test(label)) return 'conference'
  if (/(?:手册|书籍|图书|辞典|字典|\bhandbook\b|\bmanual\b|\bmonograph\b|\btextbook\b|\breference book\b)/i.test(label)) {
    return 'book'
  }
  if (/(?:期刊论文|\bjournal article\b)/i.test(label)) return 'journal'
  return ''
}

export function fallbackTitleFromFilename(filename = '') {
  const rawFilename = String(filename).trim()
  const title = rawFilename.replace(/\.pdf$/i, '').trim()
  return title || rawFilename || '未命名 PDF'
}

export async function validatePdfSelection(file) {
  if (!file || !/\.pdf$/i.test(file.name || '')) throw new Error('请选择 PDF 文件')
  if (file.type && file.type.toLowerCase() !== 'application/pdf') throw new Error('请选择 PDF 文件')

  const bytes = await readFileBytes(file)
  if (!hasPdfSignature(bytes)) throw new Error('文件不是有效的 PDF')
}

export async function extractPdfMetadata(file) {
  const bytes = await readFileBytes(file)
  if (!hasPdfSignature(bytes)) return {}

  const source = new TextDecoder('latin1').decode(bytes)
  const title = findDocumentInfoValue(source, 'Title')
  const authors = findDocumentInfoValue(source, 'Author')
  const entryType = inferLiteratureEntryType({ source, title, filename: file.name })
  const year = inferLiteratureYear({ source, title, filename: file.name })

  return {
    ...(title ? { title } : {}),
    ...(authors ? { authors } : {}),
    ...(entryType ? { entry_type: entryType } : {}),
    ...(year ? { year } : {}),
  }
}
