import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { findRenderedNode, mountSfcWithMemoryRouter } from './helpers/mountSfcWithMemoryRouter.js'

const MODULE = '/src/platform/agent/ToolEvidence.vue'

async function clickNode(node) {
  const handlers = Array.isArray(node?.props?.onClick) ? node.props.onClick : [node?.props?.onClick]
  for (const handler of handlers) if (typeof handler === 'function') {
    await handler({ stopPropagation() {}, preventDefault() {} })
  }
  await nextTick()
}

function findButton(root, text) {
  return findRenderedNode(root, node => node?.type === 'button' && renderedText(node).includes(text))
}

function findLink(root, href) {
  return findRenderedNode(root, node => node?.type === 'a' && node?.props?.href === href)
}

const KG_SEARCH_TOOL = {
  id: 'c1',
  name: 'kg_search',
  ok: true,
  status: 'ok',
  args: { query: '热震稳定性' },
  summary: '{"query":"热震稳定性"}',
  resultSummary: '2 subgraph(s), 3 verified path(s), 2 reference(s)',
  data: {
    qa_run_id: 'qa-1',
    counts: { subgraphs: 2, candidate_paths: 4, verified_paths: 3, references: 2, citation_bindings: 2 },
    references: [
      { title: 'Al2O3-SiC 抗热震', paper_id: 'P-1', doi: '10.1234/abc.def', quote: '添加 SiC 可提高抗热震性。' },
      { title: '刚玉骨料配比', paper_id: 'P-2', doi: '', quote: '刚玉骨料占比 61% 时体积密度最高。' }
    ],
    scope: { project_id: 'proj-9', graph_id: 'graph-7' }
  }
}

test('reference chips expand to the quoted evidence and link the source', async () => {
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { tool: KG_SEARCH_TOOL })
  const { root } = fixture
  try {
    assert.match(renderedText(root), /子图 2 · 路径 3 · 引用 2/)

    const first = findButton(root, 'Al2O3-SiC 抗热震')
    const second = findButton(root, '刚玉骨料配比')
    assert.ok(first && second, 'one chip per reference')
    assert.equal(first.props['aria-expanded'], false)
    assert.ok(!renderedText(root).includes('添加 SiC 可提高抗热震性。'), 'quotes stay collapsed by default')

    await clickNode(first)
    assert.equal(first.props['aria-expanded'], true)
    const panelId = first.props['aria-controls']
    const panel = findRenderedNode(root, node => node?.props?.id === panelId)
    assert.ok(panel, 'the expanded panel is addressable via aria-controls')
    assert.match(renderedText(panel), /添加 SiC 可提高抗热震性。/)
    assert.match(renderedText(panel), /P-1/)
    assert.equal(panel.props.role, 'region')

    const link = findLink(root, 'https://doi.org/10.1234/abc.def')
    assert.ok(link, 'a DOI reference must expose an external link')
    assert.equal(link.props.rel, 'noreferrer noopener')
    assert.equal(link.props.target, '_blank')

    // 手风琴：打开第二条时第一条收起，面板不会无限变长
    await clickNode(second)
    assert.equal(first.props['aria-expanded'], false)
    assert.equal(second.props['aria-expanded'], true)
    assert.match(renderedText(root), /刚玉骨料占比 61% 时体积密度最高。/)

    // 第二条没有 doi，就不该凭空造出链接
    assert.equal(
      findRenderedNode(root, node => node?.type === 'a' && String(node.props.href).includes('undefined')),
      null
    )
  } finally {
    await fixture.close()
  }
})

test('the graph scope expands to counts and explains when no nodes are included', async () => {
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { tool: KG_SEARCH_TOOL })
  const { root } = fixture
  try {
    const graphButton = findButton(root, '图谱 graph-7')
    assert.ok(graphButton, 'the graph scope is rendered as an expandable chip')
    assert.equal(graphButton.props['aria-expanded'], false)

    await clickNode(graphButton)
    assert.equal(graphButton.props['aria-expanded'], true)
    const panel = findRenderedNode(root, node => node?.props?.id === `agent-evidence-c1-graph`)
    assert.ok(panel)
    assert.equal(panel.props.role, 'region')
    assert.match(renderedText(panel), /项目 proj-9/)
    assert.match(renderedText(panel), /该工具只返回图谱范围与证据计数/)
  } finally {
    await fixture.close()
  }
})

test('kg_graph results expand to nodes, relations and the graph url', async () => {
  const tool = {
    id: 'c2',
    name: 'kg_graph',
    ok: true,
    status: 'ok',
    args: { graph_id: 'graph-7' },
    summary: '{"graph_id":"graph-7"}',
    resultSummary: '图谱 graph-7：128 节点 / 340 关系',
    data: {
      graph_id: 'graph-7',
      project_id: 'proj-9',
      url: 'https://kg.example/api/graph/data/graph-7',
      node_count: 128,
      edge_count: 340,
      matched_nodes: 40,
      returned_nodes: 2,
      returned_edges: 1,
      nodes_truncated: true,
      nodes: [
        { id: 'n1', name: '刚玉', type: 'Material' },
        { id: 'n2', name: '莫来石' }
      ],
      edges: [{ source: 'n1', target: 'n2', relation: 'REACTS_WITH' }]
    }
  }
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', { tool })
  const { root } = fixture
  try {
    assert.match(renderedText(root), /节点 128 \/ 关系 340 · 返回 2 节点 \/ 1 关系/)
    assert.ok(findLink(root, 'https://kg.example/api/graph/data/graph-7'), 'the graph service url is linked')

    await clickNode(findButton(root, '图谱 graph-7'))
    const panel = findRenderedNode(root, node => node?.props?.id === 'agent-evidence-c2-graph')
    const text = renderedText(panel)
    assert.match(text, /刚玉/)
    assert.match(text, /Material/)
    assert.match(text, /莫来石/)
    assert.match(text, /n1/)
    assert.match(text, /REACTS_WITH/)
    assert.match(text, /打开图谱服务 ↗/)
    assert.match(text, /128 节点 · 340 关系 · 命中 40 节点 · 已返回 2 节点 \/ 1 关系/)
  } finally {
    await fixture.close()
  }
})

test('tool results without evidence render nothing at all', async () => {
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', {
    tool: { id: 'c3', name: 'predict', ok: true, status: 'ok', data: { predictions: [{ bulk_density: 3.12 }] } }
  })
  try {
    // v-if 会留下注释占位节点，因此按“没有任何交互元素/证据文案”来断言
    assert.equal(findRenderedNode(fixture.root, node => node?.type === 'button'), null)
    assert.equal(findRenderedNode(fixture.root, node => node?.type === 'a'), null)
    assert.ok(!renderedText(fixture.root).includes('打开来源'))
  } finally {
    await fixture.close()
  }
})

test('web_browse exposes the fetched url as the source link', async () => {
  const fixture = await mountSfcWithMemoryRouter(MODULE, '/', {
    tool: {
      id: 'c4',
      name: 'web_browse',
      ok: true,
      status: 'ok',
      data: { url: 'https://en.wikipedia.org/wiki/Aluminium_oxide', untrusted: true, text: '…' }
    }
  })
  try {
    assert.ok(findLink(fixture.root, 'https://en.wikipedia.org/wiki/Aluminium_oxide'))
    assert.match(renderedText(fixture.root), /打开来源 ↗/)
  } finally {
    await fixture.close()
  }
})
