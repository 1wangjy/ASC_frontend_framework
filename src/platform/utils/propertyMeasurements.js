export const PROPERTY_SCHEMA_VERSION = 3
export const ROOM_TEMPERATURE = 'RT'
export const NOT_APPLICABLE = 'N/A'
export const UNKNOWN_VALUE = 'UNKNOWN'

const SPECIAL_TOKENS = new Set([ROOM_TEMPERATURE, NOT_APPLICABLE, UNKNOWN_VALUE])
const isPresent = value => value !== -1 && value !== null && value !== undefined && value !== ''

const UNIT_ALIASES = new Map([
  ['mpa', 'MPa'], ['gpa', 'GPa'], ['kpa', 'kPa'], ['pa', 'Pa'],
  ['μm', 'μm'], ['µm', 'μm'], ['um', 'μm'],
  ['g/cm3', 'g/cm³'], ['g/cm³', 'g/cm³'],
  ['1', '无量纲'], ['dimensionless', '无量纲'], ['无量纲', '无量纲'],
  ['℃', '℃'], ['°c', '℃'], ['c', '℃'], ['摄氏度', '℃'],
  ['k', 'K'], ['kelvin', 'K'],
  ['h', 'h'], ['hr', 'h'], ['hrs', 'h'], ['hour', 'h'], ['hours', 'h'], ['小时', 'h'],
  ['min', 'min'], ['mins', 'min'], ['minute', 'min'], ['minutes', 'min'], ['分钟', 'min'],
  ['s', 's'], ['sec', 's'], ['secs', 's'], ['second', 's'], ['seconds', 's'], ['秒', 's'],
])

function unitKey(unit) {
  return String(unit ?? '').trim().replace(/\s+/g, '').toLowerCase()
}

function aliasUnit(unit) {
  const source = String(unit ?? '').trim()
  return UNIT_ALIASES.get(unitKey(source)) || source
}

function fieldsOf(definition = {}) {
  return definition.fields || [{
    key: 'value', label: '数值', unit: definition.unit || '',
    acceptedUnits: definition.unit ? [definition.unit] : [], type: 'number',
  }]
}

function acceptedUnitsOf(field = {}) {
  if (Array.isArray(field.acceptedUnits) && field.acceptedUnits.length) return field.acceptedUnits
  if (field.type === 'temperature') return ['℃', 'K']
  if (field.type === 'duration') return ['h', 'min', 's']
  return field.unit ? [field.unit] : []
}

export function normalizeMeasurementUnit(unit, field = {}) {
  const source = String(unit ?? '').trim()
  if (!source) return ''
  const normalized = aliasUnit(source)
  const accepted = acceptedUnitsOf(field)
  if (!accepted.length && normalized === '无量纲') return ''
  const canonical = accepted.find(item => unitKey(aliasUnit(item)) === unitKey(normalized))
  if (!canonical) {
    const expected = accepted.length ? accepted.join('、') : '无单位'
    throw new Error(`${field.label || field.key || '字段'}单位“${source}”不受支持，请使用 ${expected}`)
  }
  return aliasUnit(canonical)
}

function specialFieldValue(value) { return { value, unit: '' } }

function legacyFieldValue(value, field) {
  if (typeof value === 'string' && SPECIAL_TOKENS.has(value.toUpperCase())) {
    return specialFieldValue(value.toUpperCase())
  }
  const textValue = field.type === 'text' && typeof value === 'number' ? String(value) : value
  const unit = field.type === 'text' || field.type === 'grade' ? '' : (field.unit || '')
  return { value: textValue, unit }
}

function formatInputField(fieldValue) {
  if (!fieldValue || !isPresent(fieldValue.value)) return ''
  const value = String(fieldValue.value)
  if (SPECIAL_TOKENS.has(value.toUpperCase())) return value.toUpperCase()
  return `${value}${fieldValue.unit || ''}`
}

function measurementFromTuple(tuple, definition) {
  const fields = fieldsOf(definition)
  const values = Array.isArray(tuple) ? tuple : [tuple]
  const result = {}
  fields.forEach((field, index) => {
    const value = values[index] ?? field.defaultValue ?? UNKNOWN_VALUE
    result[field.key] = legacyFieldValue(value, field)
  })
  return { fields: result, raw: fields.map(field => formatInputField(result[field.key])).join(';') }
}

function normalizeStoredMeasurement(measurement, definition) {
  if (!measurement?.fields || typeof measurement.fields !== 'object') {
    return measurementFromTuple(measurement, definition)
  }
  const normalizedFields = {}
  fieldsOf(definition).forEach(field => {
    const stored = measurement.fields[field.key]
    if (!stored || !isPresent(stored.value)) return
    const upper = typeof stored.value === 'string' ? stored.value.toUpperCase() : ''
    if (SPECIAL_TOKENS.has(upper)) {
      normalizedFields[field.key] = specialFieldValue(upper)
      return
    }
    let value = stored.value
    if (['number', 'temperature', 'duration'].includes(field.type)) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) value = numeric
    } else if (field.type === 'text' && typeof value === 'number') value = String(value)
    const fallbackUnit = field.type === 'text' || field.type === 'grade' ? '' : (field.unit || '')
    normalizedFields[field.key] = {
      value,
      unit: normalizeMeasurementUnit(stored.unit || fallbackUnit, field),
    }
  })
  return {
    fields: normalizedFields,
    raw: String(measurement.raw || '').trim() || fieldsOf(definition)
      .map(field => formatInputField(normalizedFields[field.key])).filter(Boolean).join(';'),
  }
}

export function createEmptyPropertyDocument() {
  return { schemaVersion: PROPERTY_SCHEMA_VERSION, properties: {} }
}

export function normalizePropertyDocument(input, definitions = []) {
  let source = input
  if (typeof source === 'string') {
    try { source = JSON.parse(source) } catch { source = null }
  }

  if ([2, PROPERTY_SCHEMA_VERSION].includes(source?.schemaVersion) && source.properties && typeof source.properties === 'object') {
    const properties = {}
    Object.entries(source.properties).forEach(([key, measurements]) => {
      if (!Array.isArray(measurements)) return
      const definition = definitions.find(item => item.name === key)
      if (!definition) return
      const normalized = measurements.filter(isPresent).map(measurement => (
        source.schemaVersion === PROPERTY_SCHEMA_VERSION
          ? normalizeStoredMeasurement(measurement, definition)
          : measurementFromTuple(measurement, definition)
      )).filter(measurement => Object.keys(measurement.fields).length)
      if (normalized.length) properties[key] = normalized
    })
    return {
      schemaVersion: PROPERTY_SCHEMA_VERSION,
      properties,
      ...(Array.isArray(source.customProperties) && source.customProperties.length
        ? { customProperties: source.customProperties.map(item => ({ ...item })) } : {}),
    }
  }

  const legacyArray = Array.isArray(source) ? source : Array.isArray(source?.fixed) ? source.fixed : []
  const document = createEmptyPropertyDocument()
  legacyArray.forEach((value, index) => {
    if (!isPresent(value)) return
    const definition = definitions.find(item => item.id === index) || definitions[index]
    if (!definition) return
    const fields = fieldsOf(definition)
    const condition = definition.legacyCondition || {}
    const tuple = fields.map((field, fieldIndex) => (
      fieldIndex === 0 ? value : (condition[field.key] ?? field.defaultValue ?? UNKNOWN_VALUE)
    ))
    if (!document.properties[definition.name]) document.properties[definition.name] = []
    document.properties[definition.name].push(measurementFromTuple(tuple, definition))
  })
  const legacyCustom = Array.isArray(source?.custom) ? source.custom : []
  const customProperties = []
  legacyCustom.forEach(item => {
    if (!item?.name || !isPresent(item.value)) return
    const definition = definitions.find(def => def.name === item.name || def.label === item.name)
    if (!definition) { customProperties.push({ ...item }); return }
    const fields = fieldsOf(definition)
    const tuple = [item.value, ...fields.slice(1).map(field => field.defaultValue ?? UNKNOWN_VALUE)]
    if (!document.properties[definition.name]) document.properties[definition.name] = []
    document.properties[definition.name].push(measurementFromTuple(tuple, definition))
  })
  if (customProperties.length) document.customProperties = customProperties
  return document
}

function parseNumericToken(token) {
  const match = String(token).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(.*)$/)
  return match ? { value: Number(match[1]), unit: match[2].trim() } : null
}

export function completeMeasurementInput(input, caretPosition, definition) {
  const value = String(input ?? '')
  const caret = Math.max(0, Math.min(Number(caretPosition) || 0, value.length))
  const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
  const nextLineBreak = value.indexOf('\n', caret)
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak
  if (caret !== lineEnd) return null

  const linePrefix = value.slice(lineStart, caret)
  const tokens = linePrefix.split(/[;；]/)
  const fieldIndex = tokens.length - 1
  const fields = fieldsOf(definition)
  if (fieldIndex >= fields.length) return null

  const rawToken = tokens[fieldIndex]
  const token = rawToken.trim()
  if (!token) return null

  const field = fields[fieldIndex]
  const upper = token.toUpperCase()
  let completedToken = token
  let changed = false

  if (!SPECIAL_TOKENS.has(upper) && !['text', 'grade'].includes(field.type)) {
    const numeric = parseNumericToken(token)
    if (!numeric) return null
    if (!numeric.unit && field.unit) {
      completedToken += field.unit
      changed = true
    }
  }

  if (fieldIndex < fields.length - 1) {
    completedToken += ';'
    changed = true
  }
  if (!changed) return null

  const tokenStart = caret - rawToken.length
  const completedValue = `${value.slice(0, tokenStart)}${completedToken}${value.slice(caret)}`
  return { value: completedValue, caret: tokenStart + completedToken.length }
}

export function getMeasurementCompletionSuggestion(input, caretPosition, definition) {
  const value = String(input ?? '')
  const caret = Math.max(0, Math.min(Number(caretPosition) || 0, value.length))
  const completed = completeMeasurementInput(value, caret, definition)
  if (!completed || !completed.value.startsWith(value.slice(0, caret))) return ''
  return completed.value.slice(caret, completed.caret)
}

function fieldCandidates(token, fields) {
  const text = String(token).trim().replace(/^['"]|['"]$/g, '')
  const upper = text.toUpperCase()
  if (upper === ROOM_TEMPERATURE) return fields.filter(field => field.type === 'temperature')
  if (upper === NOT_APPLICABLE) return fields.filter(field => field.type === 'duration')
  if (upper === UNKNOWN_VALUE) return fields.filter(field => field.key !== 'value')
  const numeric = parseNumericToken(text)
  if (!numeric) return fields.filter(field => field.key === 'value' && ['text', 'grade'].includes(field.type))
  if (!numeric.unit) return fields.filter(field => field.key === 'value')
  return fields.filter(field => {
    try { normalizeMeasurementUnit(numeric.unit, field); return true } catch { return false }
  })
}

function parseForField(token, field) {
  const text = String(token).trim().replace(/^['"]|['"]$/g, '')
  const upper = text.toUpperCase()
  if (SPECIAL_TOKENS.has(upper)) return specialFieldValue(upper)
  if (field.type === 'text' || field.type === 'grade') return { value: text, unit: '' }
  const numeric = parseNumericToken(text)
  if (!numeric) throw new Error(`${field.label || field.key}必须是带单位的数值`)
  if (!numeric.unit && acceptedUnitsOf(field).length) {
    throw new Error(`${field.label || field.key}必须填写单位，请使用 ${acceptedUnitsOf(field).join('、')}`)
  }
  return { value: numeric.value, unit: normalizeMeasurementUnit(numeric.unit, field) }
}

export function parseMeasurementInput(input, definition) {
  const fields = fieldsOf(definition)
  const raw = String(input ?? '').trim()
  const tokens = raw.split(/[;；]+/).map(item => item.trim()).filter(Boolean)
  if (!tokens.length) throw new Error('请输入测量数据')
  if (tokens.length > fields.length) throw new Error(`${definition.label}最多需要填写 ${fields.length} 个字段`)
  const parsedFields = {}
  tokens.forEach(token => {
    const candidates = fieldCandidates(token, fields).filter(field => !parsedFields[field.key])
    if (!candidates.length) throw new Error(`无法识别“${token}”的字段或单位`)
    if (candidates.length > 1) throw new Error(`“${token}”的单位存在歧义，请注明字段名称`)
    const field = candidates[0]
    parsedFields[field.key] = parseForField(token, field)
  })
  fields.forEach(field => {
    if (parsedFields[field.key]) return
    if (field.defaultValue === undefined) {
      const unitHint = acceptedUnitsOf(field).join('、')
      throw new Error(`${definition.label}缺少${field.label || field.key}${unitHint ? `，单位请使用 ${unitHint}` : ''}`)
    }
    parsedFields[field.key] = specialFieldValue(String(field.defaultValue).toUpperCase())
  })
  return { fields: parsedFields, raw }
}

export function appendMeasurement(input, propertyKey, measurement, definitions = []) {
  const definition = definitions.find(item => item.name === propertyKey)
  if (!definition) throw new Error(`未知物性: ${propertyKey}`)
  const document = normalizePropertyDocument(input, definitions)
  return {
    ...document,
    properties: {
      ...document.properties,
      [propertyKey]: [...(document.properties[propertyKey] || []), normalizeStoredMeasurement(measurement, definition)],
    },
  }
}

export function replacePropertyMeasurements(input, propertyKey, measurements, definitions = []) {
  const definition = definitions.find(item => item.name === propertyKey)
  if (!definition) throw new Error(`未知物性: ${propertyKey}`)
  const document = normalizePropertyDocument(input, definitions)
  const properties = { ...document.properties }
  const normalized = measurements.map(item => normalizeStoredMeasurement(item, definition))
  if (normalized.length) properties[propertyKey] = normalized
  else delete properties[propertyKey]
  return { ...document, properties }
}

export function removeMeasurement(input, propertyKey, index, definitions = []) {
  const document = normalizePropertyDocument(input, definitions)
  const properties = { ...document.properties }
  const remaining = (properties[propertyKey] || []).filter((_, itemIndex) => itemIndex !== index)
  if (remaining.length) properties[propertyKey] = remaining
  else delete properties[propertyKey]
  return { ...document, properties }
}

function formatDisplayField(fieldValue) {
  if (!fieldValue || !isPresent(fieldValue.value)) return UNKNOWN_VALUE
  const value = String(fieldValue.value)
  if (SPECIAL_TOKENS.has(value.toUpperCase())) return value.toUpperCase()
  return fieldValue.unit ? `${value} ${fieldValue.unit}` : value
}

export function measurementToInputLine(measurement, definition) {
  const normalized = normalizeStoredMeasurement(measurement, definition)
  return fieldsOf(definition).map(field => formatInputField(normalized.fields[field.key])).join(';')
}

export function formatPropertyDocument(input, definitions = []) {
  const document = normalizePropertyDocument(input, definitions)
  const lines = []
  definitions.forEach(definition => {
    const measurements = document.properties[definition.name]
    if (!measurements?.length) return
    const fields = fieldsOf(definition)
    const values = measurements.map(measurement => {
      const normalized = normalizeStoredMeasurement(measurement, definition)
      return `(${fields.map(field => formatDisplayField(normalized.fields[field.key])).join(', ')})`
    })
    lines.push(`${definition.label}: [${values.join(', ')}]`)
  })
  ;(document.customProperties || []).forEach(item => {
    if (item?.name && isPresent(item.value)) lines.push(`${item.name}: [(${item.value}${item.unit ? ` ${item.unit}` : ''})]`)
  })
  return lines.join('\n') || '暂无数据'
}

export function getMeasurementInputHint(definition) {
  const fields = fieldsOf(definition)
  const signature = fields.map(field => {
    const units = acceptedUnitsOf(field)
    return `${field.label || field.key}${units.length ? `(${units.join('/')})` : ''}`
  }).join(';')
  const example = definition?.inputExample ? `；示例：${definition.inputExample}` : ''
  return `${signature}${example}`
}
