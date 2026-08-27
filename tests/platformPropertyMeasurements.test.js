import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { renderSfc } from './helpers/renderSfc.js'
import * as propertyMeasurementUtils from '../src/platform/utils/propertyMeasurements.js'
import {
  formatPropertyDocument,
  measurementToInputLine,
  normalizePropertyDocument,
  parseMeasurementInput,
} from '../src/platform/utils/propertyMeasurements.js'

const require = createRequire(import.meta.url)
const propertiesDef = require('../backend_impl/src/config/properties-def.js')

const definitions = [{
  id: 0,
  name: 'flexuralStrength',
  label: '抗折强度',
  fields: [
    { key: 'value', label: '数值', unit: 'MPa', type: 'number' },
    { key: 'temperature', label: '温度', unit: '℃', acceptedUnits: ['℃', 'K'], type: 'temperature', defaultValue: 'RT' },
    { key: 'duration', label: '时间', unit: 'h', acceptedUnits: ['h', 'min', 's'], type: 'duration', defaultValue: 'N/A' },
  ],
}]

test('legacy TP values become variable measurements and compact training text', () => {
  const normalized = normalizePropertyDocument({ fixed: [50], custom: [] }, definitions)
  normalized.properties.flexuralStrength.push(parseMeasurementInput('60MPa;120℃;25h', definitions[0]))

  assert.equal(
    formatPropertyDocument(normalized, definitions),
    '抗折强度: [(50 MPa, RT, N/A), (60 MPa, 120 ℃, 25 h)]',
  )
})

test('normalizes unit aliases and restores canonical field order', () => {
  const measurement = parseMeasurementInput('25hours;120°C;60mpa', definitions[0])

  assert.deepEqual(measurement, {
    fields: {
      value: { value: 60, unit: 'MPa' },
      temperature: { value: 120, unit: '℃' },
      duration: { value: 25, unit: 'h' },
    },
    raw: '25hours;120°C;60mpa',
  })
  assert.equal(measurementToInputLine(measurement, definitions[0]), '60MPa;120℃;25h')
})

test('restores lowercase special values to canonical text for the editor', () => {
  const definition = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'specificHeat')
  const measurement = parseMeasurementInput('rt;68J/(kg·K)', definition)

  assert.equal(measurementToInputLine(measurement, definition), '68J/(kg·K);RT')
})

test('Tab completion appends canonical units and separators in field order', () => {
  assert.equal(typeof propertyMeasurementUtils.completeMeasurementInput, 'function')
  const completeMeasurementInput = propertyMeasurementUtils.completeMeasurementInput
  const first = completeMeasurementInput('20', '20'.length, definitions[0])
  assert.deepEqual(first, { value: '20MPa;', caret: 6 })

  const secondInput = '20MPa;100'
  const second = completeMeasurementInput(secondInput, secondInput.length, definitions[0])
  assert.deepEqual(second, { value: '20MPa;100℃;', caret: 11 })

  const thirdInput = '20MPa;100℃;24'
  const third = completeMeasurementInput(thirdInput, thirdInput.length, definitions[0])
  assert.deepEqual(third, { value: '20MPa;100℃;24h', caret: 14 })
  assert.equal(completeMeasurementInput(third.value, third.caret, definitions[0]), null)
})

test('Tab completion handles special and unitless fields without inventing units', () => {
  const completeMeasurementInput = propertyMeasurementUtils.completeMeasurementInput
  const unitlessDefinition = {
    name: 'poissonRatio', label: '泊松比',
    fields: [
      { key: 'value', label: '数值', unit: '', acceptedUnits: [], type: 'number' },
      { key: 'temperature', label: '温度', unit: '℃', acceptedUnits: ['℃', 'K'], type: 'temperature', defaultValue: 'RT' },
    ],
  }

  assert.deepEqual(completeMeasurementInput('0.3', 3, unitlessDefinition), { value: '0.3;', caret: 4 })
  assert.deepEqual(completeMeasurementInput('0.3;RT', '0.3;RT'.length, unitlessDefinition), null)
  assert.deepEqual(completeMeasurementInput('20MPa;RT', '20MPa;RT'.length, definitions[0]), { value: '20MPa;RT;', caret: 9 })
})

test('provides an inline ghost suffix without changing the stored input', () => {
  assert.equal(typeof propertyMeasurementUtils.getMeasurementCompletionSuggestion, 'function')
  const getSuggestion = propertyMeasurementUtils.getMeasurementCompletionSuggestion

  assert.equal(getSuggestion('20', 2, definitions[0]), 'MPa;')
  assert.equal(getSuggestion('20MPa;100', '20MPa;100'.length, definitions[0]), '℃;')
  assert.equal(getSuggestion('20MPa;100℃;24', '20MPa;100℃;24'.length, definitions[0]), 'h')
  assert.equal(getSuggestion('20MPa;100℃;24h', '20MPa;100℃;24h'.length, definitions[0]), '')
})

test('rejects ambiguous condition values without units', () => {
  assert.throws(
    () => parseMeasurementInput('60;120;25', definitions[0]),
    /单位|无法识别/,
  )
  assert.throws(
    () => parseMeasurementInput('60;120℃;25h', definitions[0]),
    /数值.*单位/,
  )
})

test('accepts and displays dimensionless numeric properties without a unit label', () => {
  const definition = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'poissonRatio')

  assert.equal(definition.fields[0].unit, '')
  assert.deepEqual(definition.fields[0].acceptedUnits, [])

  const measurement = parseMeasurementInput('0.3', definition)

  assert.deepEqual(measurement.fields.value, { value: 0.3, unit: '' })
  assert.equal(measurementToInputLine(measurement, definition), '0.3;RT')
  assert.equal(
    formatPropertyDocument({ schemaVersion: 3, properties: { poissonRatio: [measurement] } }, [definition]),
    '泊松比: [(0.3, RT)]',
  )
})

test('labels text and grade property inputs by their actual value type', () => {
  const color = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'color')
  const chemicalStability = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'chemicalStability')
  const flexuralStrength = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'flexuralStrength')

  assert.equal(color.fields[0].label, '文本')
  assert.equal(chemicalStability.fields[0].label, '等级')
  assert.equal(flexuralStrength.fields[0].label, '数值')
})

test('keeps per-property hints focused on fields and examples', () => {
  const hint = propertyMeasurementUtils.getMeasurementInputHint({
    ...definitions[0],
    inputExample: '60MPa;120℃;25h',
  })

  assert.match(hint, /数值\(MPa\)/)
  assert.match(hint, /示例：60MPa;120℃;25h/)
  assert.doesNotMatch(hint, /每行一次测量|字段顺序不限/)
})

test('edits each property as one measurement per text line', async () => {
  const document = normalizePropertyDocument({
    schemaVersion: 2,
    properties: { flexuralStrength: [[50, 'RT', 'N/A'], [60, 120, 25]] },
  }, definitions)
  const html = await renderSfc('/src/platform/components/PropertyMeasurementsEditor.vue', {
    modelValue: document,
    definitions,
  })
  const source = await readFile(
    new URL('../src/platform/components/PropertyMeasurementsEditor.vue', import.meta.url),
    'utf8',
  )

  assert.match(html, /textarea/)
  assert.match(html, /50MPa;RT;N\/A/)
  assert.match(html, /60MPa;120℃;25h/)
  assert.match(html, /每行代表一次测量/)
  assert.match(html, /RT 表示常温，N\/A 表示不适用/)
  assert.doesNotMatch(html, /删除第 1 次/)
  assert.match(source, /parseMeasurementInput/)
  assert.match(source, /split\('\\n'\)/)
  assert.match(source, /@keydown\.tab="handleTabCompletion/)
  assert.match(source, /@blur="handleDraftBlur/)
  assert.match(source, /function normalizeDraft/)
  assert.match(source, /property-editor__ghost-text/)
  assert.match(source, /getMeasurementCompletionSuggestion/)
  assert.match(source, /每行代表一次测量，英文分号作为分隔符，TAB 单位符号自动补全/)
  assert.match(source, /property-editor__guide-note/)
  assert.match(source, /\.property-editor__guide > span \{ display: inline; \}/)
  assert.match(source, /\.property-editor__guide \{[^\n]*color: #16803a/)
  assert.match(source, /\.property-editor__guide \{[^\n]*font-weight: 600/)
  assert.doesNotMatch(source, /property-editor__remove-property/)
})

test('uses the navigation list itself to add or locate properties', async () => {
  const navigationDefinitions = [
    ...definitions,
    {
      id: 1,
      name: 'bulkDensity',
      label: '体积密度',
      fields: [{ key: 'value', label: '数值', unit: 'g/cm³', type: 'number' }],
    },
  ]
  const document = normalizePropertyDocument({
    schemaVersion: 3,
    properties: { flexuralStrength: [[50, 'RT', 'N/A']] },
  }, navigationDefinitions)
  const html = await renderSfc('/src/platform/components/PropertyMeasurementsEditor.vue', {
    modelValue: document,
    definitions: navigationDefinitions,
  })
  const source = await readFile(
    new URL('../src/platform/components/PropertyMeasurementsEditor.vue', import.meta.url),
    'utf8',
  )

  assert.match(html, /property-editor__sidebar/)
  assert.match(html, /property-editor__nav-item/)
  assert.match(html, /抗折强度/)
  assert.match(html, /体积密度/)
  assert.doesNotMatch(html, /property-editor__select/)
  assert.doesNotMatch(html, /添加属性编辑区/)
  assert.match(source, /property-editor__groups-scroll/)
  assert.match(source, /activateProperty/)
  assert.match(source, /syncActiveNavigation/)
  assert.match(source, /overflow-y: auto/)
})

test('keeps each property textarea at a fixed height with internal scrolling', async () => {
  const source = await readFile(
    new URL('../src/platform/components/PropertyMeasurementsEditor.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /\.property-editor__textarea \{[^\n]*height: 112px/)
  assert.match(source, /\.property-editor__textarea \{[^\n]*max-height: 112px/)
  assert.match(source, /\.property-editor__textarea \{[^\n]*resize: none/)
  assert.match(source, /\.property-editor__textarea \{[^\n]*overflow-y: auto/)
})

test('labels MP and TP record creation buttons by their actual purpose', async () => {
  const source = await readFile(
    new URL('../src/platform/views/DataManagerView.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /新建物性记录/)
  assert.match(source, /新建测试记录/)
  assert.match(source, /\{\{ addRecordLabel \}\}/)
})

test('TP table removes the standalone condition column and renders one property per line', async () => {
  const html = await renderSfc('/src/platform/components/DataTable.vue', {
    table: 'tp',
    data: [{
      tp_id: 'TP_000001',
      mr_ids: ['MR_000001'],
      test_results: {
        schemaVersion: 3,
        properties: { flexuralStrength: [
          parseMeasurementInput('50MPa;RT;N/A', definitions[0]),
          parseMeasurementInput('60MPa;120℃;25h', definitions[0]),
        ] },
      },
      create_time: '2026-08-26T10:00:00',
      update_time: '2026-08-26T10:00:00',
    }],
    mrOptions: [{ mr_id: 'MR_000001', formula_name: '浇注料配方' }],
    testProperties: definitions,
  })

  assert.doesNotMatch(html, />测试条件</)
  assert.match(html, />关联配方</)
  assert.match(html, /抗折强度: \[\(50 MPa, RT, N\/A\), \(60 MPa, 120 ℃, 25 h\)\]/)
})

test('MP table renders variable property documents instead of an empty state', async () => {
  const html = await renderSfc('/src/platform/components/DataTable.vue', {
    table: 'mp',
    data: [{
      mp_id: 'MP_000001',
      fixed_properties: {
        schemaVersion: 3,
        properties: { flexuralStrength: [
          parseMeasurementInput('50MPa;RT;N/A', definitions[0]),
          parseMeasurementInput('60MPa;120℃;25h', definitions[0]),
        ] },
      },
      custom_properties: [],
      mc_ids: ['MC_000001'],
      create_time: '2026-08-26T10:00:00',
      update_time: '2026-08-26T10:00:00',
    }],
    pureProperties: definitions,
  })

  assert.match(html, /抗折强度: \[\(50 MPa, RT, N\/A\), \(60 MPa, 120 ℃, 25 h\)\]/)
  assert.doesNotMatch(html, />暂无数据</)
})
