import test from 'node:test'
import assert from 'node:assert/strict'

import {
  baseGraphExportFilename,
  buildBaseGraphExport
} from '../src/utils/baseGraphMetadata.js'

test('buildBaseGraphExport contains only the four requested fields per node', () => {
  const exported = buildBaseGraphExport({
    graph_id: 'graph-1',
    nodes: [{
      uuid: 'node-1',
      name: '碳化硅',
      entity_type: 'RawMaterialRatio',
      summary: 'ASC 体系中的抗氧化组分',
      node_weight: 0.82,
      attributes: { source: 'survey' }
    }]
  }, { project_id: 'proj-1' })

  assert.equal(exported.source_project_id, 'proj-1')
  assert.equal(exported.source_graph_id, 'graph-1')
  assert.equal(exported.metadata_schema, 'nexus4material.base_node_metadata.v1')
  assert.equal(exported.node_count, 1)
  assert.deepEqual(Object.keys(exported.nodes[0]), [
    'entity_name',
    'entity_type',
    'entity_summary',
    'weight'
  ])
  assert.equal(exported.nodes[0].entity_name, '碳化硅')
  assert.equal(exported.nodes[0].entity_type, 'RawMaterialRatio')
  assert.equal(exported.nodes[0].entity_summary, 'ASC 体系中的抗氧化组分')
  assert.equal(exported.nodes[0].weight, 0.82)
  assert.equal('edges' in exported, false)
})

test('baseGraphExportFilename sanitizes project ids', () => {
  assert.equal(baseGraphExportFilename('proj 1/2'), 'base_node_metadata_proj_1_2.json')
})
