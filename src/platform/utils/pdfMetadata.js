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

  return {
    ...(title ? { title } : {}),
    ...(authors ? { authors } : {}),
  }
}
