const config = require('./properties-config.json');

const valueField = (unit, type = 'number') => ({
  key: 'value', label: type === 'text' ? '文本' : type === 'grade' ? '等级' : '数值', unit: unit || '',
  acceptedUnits: unit ? [unit] : [], type
});
const temperatureField = {
  key: 'temperature', label: '温度', unit: '℃', acceptedUnits: ['℃', 'K'],
  type: 'temperature', defaultValue: 'RT'
};
const durationField = {
  key: 'duration', label: '时间', unit: 'h', acceptedUnits: ['h', 'min', 's'],
  type: 'duration', defaultValue: 'N/A'
};
const profiles = config.measurementProfiles || {};
const pureTemperature = new Set(profiles.pure?.temperature || []);
const pureTemperatureDuration = new Set(profiles.pure?.temperatureDuration || []);
const testTemperature = new Set(profiles.test?.temperature || []);
const textProperties = new Set(profiles.valueTypes?.text || []);
const gradeProperties = new Set(profiles.valueTypes?.grade || []);

function enrichProperty(property, kind, options = {}) {
  const valueType = textProperties.has(property.name) ? 'text' : gradeProperties.has(property.name) ? 'grade' : 'number';
  const measurementUnit = property.unit || '';
  const fields = [valueField(measurementUnit, valueType)];
  if (options.forceTemperatureDuration || (kind === 'pure' && pureTemperatureDuration.has(property.name))) {
    fields.push({ ...temperatureField }, { ...durationField });
  } else if ((kind === 'pure' && pureTemperature.has(property.name)) || (kind === 'test' && testTemperature.has(property.name))) {
    fields.push({ ...temperatureField });
  }
  const valueExample = measurementUnit ? `60${measurementUnit}` : '0.3';
  const inputExample = valueType === 'text'
    ? '刚玉相'
    : valueType === 'grade'
      ? '一级'
      : fields.length === 3
        ? `${valueExample};120℃;25h`
        : fields.length === 2
          ? `${valueExample};500K`
          : valueExample;
  return { ...property, fields, inputExample, ...(options.legacyCondition ? { legacyCondition: options.legacyCondition } : {}) };
}

const PURE_MATERIAL_PROPERTIES = config.pureMaterialProperties.map(property => enrichProperty(property, 'pure'));
const LEGACY_TEST_PROPERTIES = config.testProperties.map(property => {
  const match = property.name.match(/^(.+)\((\d+)Cx(\d+)H\)$/);
  if (!match) return enrichProperty(property, 'test');
  const [, name, temperature, duration] = match;
  return enrichProperty({ ...property, name, label: property.label.replace(/\(\d+Cx\d+H\)$/, '') }, 'test', {
    forceTemperatureDuration: true,
    legacyCondition: { temperature: Number(temperature), duration: Number(duration) }
  });
});
const canonicalTestMap = new Map();
LEGACY_TEST_PROPERTIES.forEach(property => {
  const existing = canonicalTestMap.get(property.name);
  if (existing) { existing.legacyIds.push(property.id); return; }
  canonicalTestMap.set(property.name, { ...property, id: canonicalTestMap.size, legacyIds: [property.id] });
});
const TEST_PROPERTIES = Array.from(canonicalTestMap.values());

const getPurePropertyByName = (name) => {
  return PURE_MATERIAL_PROPERTIES.find(p => p.name === name || p.label === name);
};

const getPurePropertyById = (id) => {
  return PURE_MATERIAL_PROPERTIES.find(p => p.id === id);
};

const getAllPurePropertyNames = () => {
  return PURE_MATERIAL_PROPERTIES.map(p => p.name);
};

const getTestPropertyByName = (name) => {
  return TEST_PROPERTIES.find(p => p.name === name || p.label === name);
};

const getTestPropertyById = (id) => {
  return TEST_PROPERTIES.find(p => p.id === id);
};

const getAllTestPropertyNames = () => {
  return TEST_PROPERTIES.map(p => p.name);
};

const initPropertyArray = () => {
  return new Array(32).fill(-1);
};

const initCustomProperties = () => {
  return [
    { name: '', value: -1 },
    { name: '', value: -1 },
    { name: '', value: -1 },
    { name: '', value: -1 }
  ];
};

const toFixedAndCustomProperties = (source = {}, definitions = []) => {
  const fixed = initPropertyArray();
  const custom = [];

  Object.entries(source || {}).forEach(([key, raw]) => {
    const isObjectValue = raw && typeof raw === 'object' && !Array.isArray(raw);
    const value = isObjectValue ? raw.value : raw;
    const unit = isObjectValue ? (raw.unit || '') : '';
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    const definition = definitions.find((item) => item.name === key || item.label === key);
    if (definition && Number.isInteger(definition.id) && definition.id >= 0 && definition.id < 32) {
      fixed[definition.id] = numericValue;
      return;
    }

    custom.push({ name: key, value: numericValue, ...(unit ? { unit } : {}) });
  });

  return { fixed, custom };
};

module.exports = {
  PURE_MATERIAL_PROPERTIES,
  TEST_PROPERTIES,
  LEGACY_TEST_PROPERTIES,
  getPurePropertyByName,
  getPurePropertyById,
  getAllPurePropertyNames,
  getTestPropertyByName,
  getTestPropertyById,
  getAllTestPropertyNames,
  initPropertyArray,
  initCustomProperties,
  toFixedAndCustomProperties
};
