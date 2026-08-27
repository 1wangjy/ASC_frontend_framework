import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as entities from '../src/platform/types/entities.js'

test('MR component selection stores the selected MC id while MC selection stores its MP id', () => {
  assert.equal(typeof entities.resolveComponentSelection, 'function')

  const material = {
    mc_id: 'MC_000123',
    batch_no: 'No.260826',
    component_list: [['氧化铝', 'MP_000456', '{}', 100]],
  }

  assert.deepEqual(entities.resolveComponentSelection('mr', material), {
    name: '氧化铝',
    id: 'MC_000123',
  })
  assert.deepEqual(entities.resolveComponentSelection('mc', material), {
    name: '氧化铝',
    id: 'MP_000456',
  })
  assert.deepEqual(entities.resolveComponentSelection('mc', { mp_id: 'MP_000789' }), {
    name: '',
    id: 'MP_000789',
  })
})

test('component validation rejects invalid references, duplicates and totals other than 100 percent', () => {
  assert.equal(typeof entities.validateComponentRows, 'function')

  assert.equal(entities.validateComponentRows('mr', [
    { name: '氧化铝', id: 'MC_000001', ratio: 60 },
    { name: '水', id: 'MC_000002', ratio: 40 },
  ]), '')
  assert.match(entities.validateComponentRows('mr', [
    { name: '氧化铝', id: 'MP_000001', ratio: 100 },
  ]), /MC_ID/)
  assert.match(entities.validateComponentRows('mr', [
    { name: '氧化铝', id: 'MC_000001', ratio: 60 },
    { name: '氧化铝', id: 'MC_000001', ratio: 40 },
  ]), /重复/)
  assert.match(entities.validateComponentRows('mc', [
    { name: '氧化铝', id: 'MP_000001', ratio: 80 },
  ]), /100%/)
})

test('TP payload uses mr_ids and always contains required JSON fields', () => {
  assert.equal(typeof entities.buildTpPayload, 'function')

  assert.deepEqual(entities.buildTpPayload('MR_000001', {
    fixed: [1, 2],
    custom: [],
  }), {
    mr_ids: ['MR_000001'],
    mp_id: null,
    test_params: {},
    test_results: {
      fixed: [1, 2],
      custom: [],
    },
    test_condition: '无',
  })
})

test('data management recipe parsing only requests embedding when the panel enables it', () => {
  const panel = fs.readFileSync(new URL('../src/platform/components/RecipeParserPanel.vue', import.meta.url), 'utf8')
  const composable = fs.readFileSync(new URL('../src/platform/composables/useRecipeParser.js', import.meta.url), 'utf8')

  assert.match(panel, /parseRecipe\(rawText\.value,\s*\{\s*generateEmbedding:\s*props\.showEmbedding\s*\}\)/)
  assert.match(composable, /if\s*\(options\.generateEmbedding\)/)
  assert.doesNotMatch(composable, /addTableData/)
  assert.doesNotMatch(composable, /registerTestData/)
})

test('TP editing keeps its MR relationship in the submitted payload', () => {
  const table = fs.readFileSync(new URL('../src/platform/components/DataTable.vue', import.meta.url), 'utf8')
  assert.match(table, /case 'tp':[\s\S]*?payload\.mr_ids\s*=\s*Array\.isArray\(row\.mr_ids\)/)
  assert.match(table, /payload\.mr_ids\s*=\s*\(payload\.mr_ids\s*\|\|\s*''\)\.split/)
})

test('newly created MP can be attached to the component row that requested it', () => {
  assert.equal(typeof entities.assignComponentId, 'function')
  assert.deepEqual(entities.assignComponentId([
    { name: '氧化铝', id: null, ratio: 60 },
    { name: '水', id: null, ratio: 40 },
  ], 1, 'MP_000010'), [
    { name: '氧化铝', id: null, ratio: 60 },
    { name: '水', id: 'MP_000010', ratio: 40 },
  ])
})

test('recipe MP references resolve to the owning MC before creating an MR component', () => {
  assert.equal(typeof entities.findMaterialByReference, 'function')
  const materials = [
    { mc_id: 'MC_000001', component_list: [['氧化铝', 'MP_000010', '{}', 100]] },
    { mc_id: 'MC_000002', component_list: [['水', 'MP_000020', '{}', 100]] },
  ]
  assert.equal(entities.findMaterialByReference(materials, 'MP_000020')?.mc_id, 'MC_000002')
  assert.equal(entities.findMaterialByReference(materials, 'MC_000001')?.mc_id, 'MC_000001')
  assert.equal(entities.findMaterialByReference(materials, 'MP_MISSING'), null)
})
