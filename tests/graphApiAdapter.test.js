import test from 'node:test'
import assert from 'node:assert/strict'

import { adaptGraphForExplorer } from '../src/features/knowledge/graphApiAdapter.js'

test('normalizes backend nodes and filters relations with missing endpoints', () => {
  const adapted = adaptGraphForExplorer({
    nodes: [
      {
        uuid: 'n1',
        name_zh: '碳化硅',
        entity_type: '材料',
        aliases: ['SiC'],
        evidence_count: 3,
        x: 120,
        y: 80
      },
      {
        id: 'n2',
        display_name: '抗热震性',
        attributes: { entity_type: '性能', aliases: ['热震稳定性'] }
      }
    ],
    edges: [
      {
        uuid: 'e1',
        source_node_uuid: 'n1',
        target_node_uuid: 'n2',
        relation_type: '影响'
      },
      {
        uuid: 'dangling',
        source_node_uuid: 'n1',
        target_node_uuid: 'missing'
      }
    ]
  })

  assert.equal(adapted.nodes.length, 2)
  assert.deepEqual(adapted.nodes[0], {
    nodeId: 'n1',
    label: '碳化硅',
    type: '材料',
    aliases: ['SiC'],
    relationshipCount: 1,
    evidenceCount: 3,
    x: 120,
    y: 80
  })
  assert.equal(adapted.nodes[1].relationshipCount, 1)
  assert.ok(Number.isFinite(adapted.nodes[1].x))
  assert.ok(Number.isFinite(adapted.nodes[1].y))
  assert.deepEqual(adapted.edges, [{
    edgeId: 'e1',
    source: 'n1',
    target: 'n2',
    label: '影响'
  }])
})

test('accepts an axios backend envelope and object endpoints', () => {
  const adapted = adaptGraphForExplorer({
    data: {
      success: true,
      data: {
        nodes: [
          { node_id: 'source', name: '源节点' },
          { node_id: 'target', name: '目标节点' }
        ],
        edges: [{ id: 'edge', source: { node_id: 'source' }, target: { id: 'target' }, name: '连接' }]
      }
    }
  })

  assert.equal(adapted.nodes.length, 2)
  assert.equal(adapted.edges[0].source, 'source')
  assert.equal(adapted.edges[0].target, 'target')
})
