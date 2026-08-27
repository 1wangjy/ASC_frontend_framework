const SCHEMA_VERSION = 3;
const LEGACY_SCHEMA_VERSION = 2;
const SPECIAL_VALUES = new Set(['RT', 'N/A', 'UNKNOWN']);
const present = value => value !== -1 && value !== null && value !== undefined && value !== '';

const UNIT_ALIASES = new Map([
  ['mpa', 'MPa'], ['gpa', 'GPa'], ['kpa', 'kPa'], ['pa', 'Pa'],
  ['μm', 'μm'], ['µm', 'μm'], ['um', 'μm'],
  ['g/cm3', 'g/cm³'], ['g/cm³', 'g/cm³'],
  ['1', '无量纲'], ['dimensionless', '无量纲'], ['无量纲', '无量纲'],
  ['℃', '℃'], ['°c', '℃'], ['c', '℃'], ['摄氏度', '℃'],
  ['k', 'K'], ['kelvin', 'K'],
  ['h', 'h'], ['hr', 'h'], ['hrs', 'h'], ['hour', 'h'], ['hours', 'h'], ['小时', 'h'],
  ['min', 'min'], ['mins', 'min'], ['minute', 'min'], ['minutes', 'min'], ['分钟', 'min'],
  ['s', 's'], ['sec', 's'], ['secs', 's'], ['second', 's'], ['seconds', 's'], ['秒', 's']
]);

function emptyDocument() { return { schemaVersion: SCHEMA_VERSION, properties: {} }; }
function parseInput(input) {
  if (typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return null; }
}
function unitKey(unit) { return String(unit ?? '').trim().replace(/\s+/g, '').toLowerCase(); }
function aliasUnit(unit) {
  const source = String(unit ?? '').trim();
  return UNIT_ALIASES.get(unitKey(source)) || source;
}
function fieldsOf(definition = {}) {
  return definition.fields || [{ key: 'value', label: '数值', unit: definition.unit || '', acceptedUnits: definition.unit ? [definition.unit] : [], type: 'number' }];
}
function acceptedUnitsOf(field = {}) {
  if (Array.isArray(field.acceptedUnits) && field.acceptedUnits.length) return field.acceptedUnits;
  if (field.type === 'temperature') return ['℃', 'K'];
  if (field.type === 'duration') return ['h', 'min', 's'];
  return field.unit ? [field.unit] : [];
}
function normalizeUnit(unit, field = {}) {
  const source = String(unit ?? '').trim();
  if (!source) return '';
  const normalized = aliasUnit(source);
  const accepted = acceptedUnitsOf(field);
  if (!accepted.length && normalized === '无量纲') return '';
  const canonical = accepted.find(item => unitKey(aliasUnit(item)) === unitKey(normalized));
  if (!canonical) throw new Error(`${field.label || field.key || '字段'}单位“${source}”不受支持`);
  return aliasUnit(canonical);
}
function specialFieldValue(value) { return { value, unit: '' }; }
function fieldValueFromLegacy(value, field) {
  if (typeof value === 'string' && SPECIAL_VALUES.has(value.toUpperCase())) return specialFieldValue(value.toUpperCase());
  const normalizedValue = field.type === 'text' && typeof value === 'number' ? String(value) : value;
  return {
    value: normalizedValue,
    unit: field.type === 'text' || field.type === 'grade' ? '' : (field.unit || '')
  };
}
function inputFieldText(fieldValue) {
  if (!fieldValue || !present(fieldValue.value)) return '';
  const value = String(fieldValue.value);
  if (SPECIAL_VALUES.has(value.toUpperCase())) return value.toUpperCase();
  return `${value}${fieldValue.unit || ''}`;
}
function measurementFromTuple(tuple, definition) {
  const fields = fieldsOf(definition);
  const values = Array.isArray(tuple) ? tuple : [tuple];
  const result = {};
  fields.forEach((field, index) => {
    result[field.key] = fieldValueFromLegacy(values[index] ?? field.defaultValue ?? 'UNKNOWN', field);
  });
  return { fields: result, raw: fields.map(field => inputFieldText(result[field.key])).join(';') };
}
function normalizeStoredMeasurement(measurement, definition) {
  if (!measurement?.fields || typeof measurement.fields !== 'object') return measurementFromTuple(measurement, definition);
  const normalizedFields = {};
  fieldsOf(definition).forEach(field => {
    const stored = measurement.fields[field.key];
    if (!stored || !present(stored.value)) return;
    const upper = typeof stored.value === 'string' ? stored.value.toUpperCase() : '';
    if (SPECIAL_VALUES.has(upper)) {
      normalizedFields[field.key] = specialFieldValue(upper);
      return;
    }
    let value = stored.value;
    if (['number', 'temperature', 'duration'].includes(field.type)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) value = numeric;
    } else if (field.type === 'text' && typeof value === 'number') value = String(value);
    const fallbackUnit = field.type === 'text' || field.type === 'grade' ? '' : (field.unit || '');
    normalizedFields[field.key] = { value, unit: normalizeUnit(stored.unit || fallbackUnit, field) };
  });
  return {
    fields: normalizedFields,
    raw: String(measurement.raw || '').trim() || fieldsOf(definition).map(field => inputFieldText(normalizedFields[field.key])).filter(Boolean).join(';')
  };
}

function normalize(input, definitions = []) {
  const source = parseInput(input);
  if ([LEGACY_SCHEMA_VERSION, SCHEMA_VERSION].includes(source?.schemaVersion) && source.properties && typeof source.properties === 'object') {
    const definitionMap = new Map(definitions.map(item => [item.name, item]));
    const properties = {};
    Object.entries(source.properties).forEach(([key, measurements]) => {
      if (!Array.isArray(measurements)) return;
      const definition = definitionMap.get(key);
      if (!definition) return;
      const normalized = measurements.filter(present).map(measurement => (
        source.schemaVersion === SCHEMA_VERSION
          ? normalizeStoredMeasurement(measurement, definition)
          : measurementFromTuple(measurement, definition)
      )).filter(measurement => Object.keys(measurement.fields).length);
      if (normalized.length) properties[key] = normalized;
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      properties,
      ...(Array.isArray(source.customProperties) && source.customProperties.length
        ? { customProperties: source.customProperties.map(item => ({ ...item })) } : {})
    };
  }

  const legacy = Array.isArray(source) ? source : Array.isArray(source?.fixed) ? source.fixed : [];
  const document = emptyDocument();
  legacy.forEach((value, index) => {
    if (!present(value)) return;
    const definition = definitions.find(item => item.id === index) || definitions[index];
    if (!definition) return;
    const fields = fieldsOf(definition);
    const condition = definition.legacyCondition || {};
    const tuple = fields.map((field, fieldIndex) => fieldIndex === 0 ? value : (condition[field.key] ?? field.defaultValue ?? 'UNKNOWN'));
    if (!document.properties[definition.name]) document.properties[definition.name] = [];
    document.properties[definition.name].push(measurementFromTuple(tuple, definition));
  });
  const custom = Array.isArray(source?.custom) ? source.custom : [];
  const unknown = [];
  custom.forEach(item => {
    if (!item?.name || !present(item.value)) return;
    const definition = definitions.find(def => def.name === item.name || def.label === item.name);
    if (!definition) { unknown.push({ ...item }); return; }
    const fields = fieldsOf(definition);
    const tuple = [item.value, ...fields.slice(1).map(field => field.defaultValue ?? 'UNKNOWN')];
    if (!document.properties[definition.name]) document.properties[definition.name] = [];
    document.properties[definition.name].push(measurementFromTuple(tuple, definition));
  });
  if (unknown.length) document.customProperties = unknown;
  return document;
}

function validate(input, definitions = []) {
  const document = normalize(input, definitions);
  const map = new Map(definitions.map(item => [item.name, item]));
  Object.entries(document.properties).forEach(([key, measurements]) => {
    const definition = map.get(key);
    if (!definition) throw new Error(`未知物性: ${key}`);
    const fields = fieldsOf(definition);
    measurements.forEach(measurement => {
      if (!measurement?.fields || typeof measurement.fields !== 'object') throw new Error(`${definition.label}测量格式不正确`);
      fields.forEach(field => {
        const stored = measurement.fields[field.key];
        if (!stored || !present(stored.value)) throw new Error(`${definition.label}缺少${field.label || field.key}`);
        const upper = typeof stored.value === 'string' ? stored.value.toUpperCase() : '';
        if (SPECIAL_VALUES.has(upper)) {
          const allowed = (upper === 'RT' && field.type === 'temperature')
            || (upper === 'N/A' && field.type === 'duration')
            || (upper === 'UNKNOWN' && field.key !== 'value');
          if (!allowed) throw new Error(`${definition.label} ${field.label || field.key}的值不合法`);
          return;
        }
        if (field.type === 'text') {
          if (typeof stored.value !== 'string' || !stored.value.trim()) throw new Error(`${definition.label} ${field.label || field.key}不能为空`);
        } else if (field.type === 'grade') {
          const valid = (typeof stored.value === 'string' && stored.value.trim()) || (typeof stored.value === 'number' && Number.isFinite(stored.value));
          if (!valid) throw new Error(`${definition.label} ${field.label || field.key}不能为空`);
        } else if (typeof stored.value !== 'number' || !Number.isFinite(stored.value)) {
          throw new Error(`${definition.label} ${field.label || field.key}必须是数字`);
        }
        const canonicalUnit = normalizeUnit(stored.unit, field);
        if (!['text', 'grade'].includes(field.type) && acceptedUnitsOf(field).length && !canonicalUnit) {
          throw new Error(`${definition.label} ${field.label || field.key}必须填写单位`);
        }
        stored.unit = canonicalUnit;
      });
    });
  });
  return document;
}

function prepareForStorage(input, definitions = []) { return validate(input ?? emptyDocument(), definitions); }

module.exports = { SCHEMA_VERSION, emptyDocument, normalize, validate, prepareForStorage };
