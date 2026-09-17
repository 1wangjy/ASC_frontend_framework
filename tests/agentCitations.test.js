import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_QUOTE_CHARS,
  MAX_REFERENCES,
  doiToUrl,
  evidenceCountsLabel,
  extractEvidence,
  extractGraph,
  extractReferences,
  safeHttpUrl
} from '../src/platform/agent/citations.js'

const KG_SEARCH = {
  qa_run_id: 'qa-1',
  question: '热震稳定性',
  counts: { subgraphs: 2, candidate_paths: 4, verified_paths: 3, references: 2, citation_bindings: 2 },
  references: [
    { title: 'Al2O3-SiC 抗热震', paper_id: 'P-1', doi: '10.1234/abc.def', quote: '  添加 SiC 可提高抗热震性。\n' },
    { title: '刚玉骨料配比', paper_id: 'P-2', doi: '', quote: '刚玉骨料占比 61% 时体积密度最高。' }
  ],
  scope: { project_id: 'proj-9', graph_id: 'graph-7' }
}

const KG_GRAPH = {
  graph_id: 'graph-7',
  project_id: 'proj-9',
  node_count: 128,
  edge_count: 340,
  matched_nodes: 40,
  returned_nodes: 2,
  returned_edges: 1,
  nodes_truncated: true,
  edges_truncated: false,
  nodes: [
    { id: 'n1', name: '刚玉', type: 'Material' },
    { id: 'n2', name: '莫来石' }
  ],
  edges: [{ source: 'n1', target: 'n2', relation: 'REACTS_WITH' }]
}

test('kg_search/rag_search results expose references with quotes, sources and counts', () => {
  const evidence = extractEvidence({ name: 'kg_search', ok: true, data: KG_SEARCH })

  assert.equal(evidence.countsLabel, '子图 2 · 路径 3 · 引用 2')
  assert.deepEqual(evidence.references, [
    {
      id: 'ref-0',
      title: 'Al2O3-SiC 抗热震',
      source: 'P-1',
      quote: '添加 SiC 可提高抗热震性。',
      href: 'https://doi.org/10.1234/abc.def'
    },
    {
      id: 'ref-1',
      title: '刚玉骨料配比',
      source: 'P-2',
      quote: '刚玉骨料占比 61% 时体积密度最高。',
      href: ''
    }
  ])
  assert.equal(evidence.graph.graphId, 'graph-7')
  assert.equal(evidence.graph.projectId, 'proj-9')
  assert.deepEqual(evidence.graph.nodes, [])
  assert.deepEqual(evidence.graph.edges, [])
  assert.equal(evidence.sourceUrl, '')
})

test('kg_graph results expose bounded node/edge lists and graph counts', () => {
  const evidence = extractEvidence({ name: 'kg_graph', ok: true, data: KG_GRAPH })

  assert.equal(evidence.countsLabel, '节点 128 / 关系 340 · 返回 2 节点 / 1 关系')
  assert.deepEqual(evidence.graph.nodes.map(node => node.name), ['刚玉', '莫来石'])
  assert.equal(evidence.graph.nodes[0].type, 'Material')
  assert.equal(evidence.graph.nodes[1].type, '')
  assert.deepEqual(evidence.graph.edges[0], {
    index: 0,
    source: 'n1',
    target: 'n2',
    relation: 'REACTS_WITH'
  })
  assert.equal(evidence.graph.nodesTruncated, true)
  assert.equal(evidence.graph.edgesTruncated, false)
  assert.deepEqual(evidence.references, [])
})

test('reference extraction is tolerant: alternates keys, dedupe, bounds', () => {
  assert.deepEqual(extractReferences(null), [])
  assert.deepEqual(extractReferences({ citations: [{ title: 'A', quote: 'q' }] }).map(item => item.title), ['A'])
  assert.deepEqual(extractReferences({ sources: [{ document_title: 'D', original_quote: 'q' }] }).map(item => item.source), ['D'])
  // 裸字符串引用也能用（无标题、只有引文）
  assert.deepEqual(extractReferences({ references: ['只有引文'] })[0].quote, '只有引文')

  const duplicated = extractReferences({
    references: [
      { title: 'same', quote: 'q' },
      { title: 'same', quote: 'q' }
    ]
  })
  assert.equal(duplicated.length, 1)

  const bounded = extractReferences({
    references: Array.from({ length: 30 }, (_, index) => ({ title: `T${index}`, quote: 'x'.repeat(600) }))
  })
  assert.equal(bounded.length, MAX_REFERENCES)
  assert.equal(bounded[0].quote.length, MAX_QUOTE_CHARS)
  assert.ok(bounded[0].quote.endsWith('…'))
})

test('url handling only accepts http(s) and real DOIs', () => {
  assert.equal(doiToUrl('10.1234/abc.def'), 'https://doi.org/10.1234/abc.def')
  assert.equal(doiToUrl('https://doi.org/10.1234/abc.def'), 'https://doi.org/10.1234/abc.def')
  assert.equal(doiToUrl('doi: 10.1234/abc.def'), 'https://doi.org/10.1234/abc.def')
  assert.equal(doiToUrl('not-a-doi'), '')
  assert.equal(safeHttpUrl('https://example.org/a?b=1'), 'https://example.org/a?b=1')
  assert.equal(safeHttpUrl('javascript:alert(1)'), '')
  assert.equal(safeHttpUrl('/local/path'), '')
})

test('web_browse results carry a source url, other shapes yield no evidence', () => {
  const evidence = extractEvidence({
    name: 'web_browse',
    ok: true,
    data: { url: 'https://en.wikipedia.org/wiki/Aluminium_oxide', untrusted: true, text: '…' }
  })
  assert.equal(evidence.sourceUrl, 'https://en.wikipedia.org/wiki/Aluminium_oxide')
  assert.equal(evidence.countsLabel, '')
  assert.equal(evidence.graph, null)
  assert.deepEqual(evidence.references, [])

  assert.equal(extractEvidence({ name: 'predict', ok: true, data: { predictions: [1] } }), null)
  assert.equal(extractEvidence({ name: 'predict', ok: false }), null)
  assert.equal(extractEvidence(null), null)
})

test('evidenceCountsLabel formats what is present and omits what is not', () => {
  assert.equal(evidenceCountsLabel(null), '')
  assert.equal(
    evidenceCountsLabel({ subgraphs: 1, paths: null, references: null, nodes: null, edges: null }),
    '子图 1'
  )
  assert.equal(
    evidenceCountsLabel({ subgraphs: null, paths: null, references: null, nodes: 0, edges: 0, returnedNodes: null, returnedEdges: null }),
    '节点 0 / 关系 0'
  )
  assert.equal(extractGraph({}), null)
})
