import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildQaAnswerDetails,
  normalizeBackendAnswerText
} from '../src/features/qa/qaAnswerDetailsModel.js'

const mixedBackendAnswer = [
  '<div class="cod-direct-answer-block">',
  '<div class="direct-answer-block-title">CoD 直接回答</div>',
  '<i>CoD 路径回答<c>R1</c></i>',
  '</div>',
  '<div class="omd-direct-answer-block">',
  '<div class="direct-answer-block-title omd">OMD 本体增强直接回答</div>',
  '<span class="omd-gain-label">OMD 本体融合到直接回答</span>：真实本体结论。',
  '<div class="omd-reasoning-scaffold"><strong>ToT 多分支辅助推理</strong><p>先选最高质量路径，再比较其余候选。</p><ol><li><strong>主路径 T1</strong>：SiC → SiO2 → 抗氧化性能</li><li>备选路径 T2：孔隙连通 → 氧扩散</li></ol></div>',
  '<p>因此直接结论同时包含本体、路径和风险边界。</p>',
  '<div class="qa-metric-grid"><button class="qa-metric-chip">置信度 95%</button></div>',
  '</div>'
].join('')

test('maps the real answer, detailed derivation and ToT route into four answer detail modules', () => {
  const details = buildQaAnswerDetails({
    cod_direct_answer: mixedBackendAnswer,
    logic_chain_derivation: '问题目标：高温抗氧化\n\n推导主线：SiC -> SiO2 -> 封孔',
    reasoning_route: {
      selected_mode: 'tot',
      reason: 'KG 子图存在多条候选机制路径',
      selected_path_ids: ['path-a', 'path-b']
    },
    routed_reasoning_paths: [
      { path_id: 'path-a', natural_language_path: 'SiC -> SiO2 -> 抗氧化' },
      { path_id: 'path-b', natural_language_path: '抗氧化剂 -> 液相 -> 封孔' }
    ]
  })

  assert.deepEqual(details.map(item => item.id), ['cod', 'omd', 'logic', 'reasoning'])
  assert.equal(details[0].content, '*CoD 路径回答<c>R1</c>*')
  assert.doesNotMatch(details[0].content, /<div|CoD 直接回答<\/div>/)
  assert.equal(details[1].omd.lead, 'OMD 本体融合到直接回答：真实本体结论。')
  assert.deepEqual(details[1].omd.scaffold, {
    title: 'ToT 多分支辅助推理',
    summary: '先选最高质量路径，再比较其余候选。',
    items: [
      '**主路径 T1**：SiC → SiO2 → 抗氧化性能',
      '备选路径 T2：孔隙连通 → 氧扩散'
    ]
  })
  assert.equal(details[1].omd.tail, '因此直接结论同时包含本体、路径和风险边界。')
  assert.doesNotMatch(JSON.stringify(details[1]), /置信度 95%|qa-metric-grid/)
  assert.equal(details[2].content, '问题目标：高温抗氧化\n\n推导主线：SiC -> SiO2 -> 封孔')
  assert.equal(details[3].trace.mode, 'tot')
  assert.equal(details[3].trace.modeLabel, 'ToT')
  assert.equal(details[3].trace.reason, 'KG 子图存在多条候选机制路径')
  assert.deepEqual(details[3].trace.selectedPathIds, ['path-a', 'path-b'])
  assert.deepEqual(details[3].trace.paths.map(path => ({ id: path.id, nodes: path.nodes })), [
    { id: 'path-a', nodes: ['SiC', 'SiO2', '抗氧化'] },
    { id: 'path-b', nodes: ['抗氧化剂', '液相', '封孔'] }
  ])
})

test('prefers the dedicated ontology answer and hides modules with no real data', () => {
  const details = buildQaAnswerDetails({
    llm_cod_direct_answer: '只有主回答',
    ontology_direct_answer_gain: '<strong>独立 OMD 结论</strong>'
  })

  assert.deepEqual(details, [{
    id: 'omd',
    label: 'OMD 本体增强',
    content: '**独立 OMD 结论**'
  }])
  assert.deepEqual(buildQaAnswerDetails({ llm_cod_direct_answer: '只有主回答' }), [])
})

test('prefers the complete embedded OMD block when the flat gain field would discard its scaffold', () => {
  const [omd] = buildQaAnswerDetails({
    cod_direct_answer: [
      '<div class="omd-direct-answer-block">',
      '<div class="direct-answer-block-title omd">OMD 本体增强直接回答</div>',
      '<p>完整 OMD 主回答</p>',
      '<div class="omd-reasoning-scaffold"><strong>ToT 多分支辅助推理</strong><ol><li>真实路径 T1</li></ol></div>',
      '<p>完整 OMD 补充说明</p>',
      '</div>'
    ].join(''),
    ontology_direct_answer_gain: '只有扁平 OMD 摘要'
  })

  assert.equal(omd.content, '完整 OMD 主回答\n\n完整 OMD 补充说明')
  assert.equal(omd.omd.scaffold.title, 'ToT 多分支辅助推理')
  assert.deepEqual(omd.omd.scaffold.items, ['真实路径 T1'])
  assert.doesNotMatch(JSON.stringify(omd), /只有扁平 OMD 摘要/)
})

test('normalizes supported backend HTML without exposing raw block tags', () => {
  const normalized = normalizeBackendAnswerText(
    '<p>第一段<c>R2</c></p><ol><li><strong>条件 A</strong></li><li>条件 B</li></ol>'
  )

  assert.equal(normalized, '第一段<c>R2</c>\n- **条件 A**\n- 条件 B')
  assert.doesNotMatch(normalized, /<p>|<ol>|<li>/)
})

test('keeps real CoT node and relation data without synthesizing missing paths', () => {
  const [reasoning] = buildQaAnswerDetails({
    reasoning_route: {
      selected_mode: 'cot',
      reason: '候选路径收敛为一条主链'
    },
    routed_reasoning_paths: [{
      path_id: 'cot-main',
      path_type: 'mechanism_path',
      nodes: [{ name: 'SiC 氧化' }, { name: 'SiO2 保护层' }, { name: '抗氧化性能' }],
      edges: [{ relation: '生成' }, { name: '提升' }]
    }]
  })

  assert.equal(reasoning.id, 'reasoning')
  assert.equal(reasoning.trace.modeLabel, 'CoT')
  assert.deepEqual(reasoning.trace.paths[0], {
    id: 'cot-main',
    type: 'mechanism_path',
    naturalLanguagePath: '',
    nodes: ['SiC 氧化', 'SiO2 保护层', '抗氧化性能'],
    relations: ['生成', '提升']
  })

  const routeOnly = buildQaAnswerDetails({
    reasoning_route: { selected_mode: 'tot', reason: '真实路由存在，但本次未返回路径' }
  })
  assert.deepEqual(routeOnly[0].trace.paths, [])
})

test('groups real ToT paths into route families instead of exposing a flat card list', () => {
  const [reasoning] = buildQaAnswerDetails({
    reasoning_route: {
      requested_mode: 'auto',
      selected_mode: 'tot',
      reason: 'Auto selected ToT because the retrieved KG subgraph is multi-branch or semantically exploratory.',
      selected_path_ids: ['path_001', 'path_002'],
      structural_metrics: {
        node_count: 6,
        relation_count: 5
      }
    },
    routed_reasoning_paths: [
      {
        path_id: 'path_001',
        path_type: 'evidence_chain',
        initial_score: 0.9384,
        natural_language_path: 'SiC 氧化 -> SiO2 保护层 -> 抗氧化性能',
        nodes: [
          { name: 'SiC 氧化' },
          { name: 'SiO2 保护层' },
          { name: '抗氧化性能' }
        ],
        edges: [
          { relation: '生成', fact: 'SiC 氧化形成 SiO2 富集层' },
          { relation: '提升', fact: '保护层降低氧扩散' }
        ],
        evidence: [{ quote: '氧化后形成连续 SiO2 保护层。' }]
      },
      {
        path_id: 'path_002',
        path_type: 'risk_chain',
        initial_score: 0.812,
        natural_language_path: '孔隙连通 -> 氧扩散通道 -> 抗氧化性能下降',
        nodes: [
          { name: '孔隙连通' },
          { name: '氧扩散通道' },
          { name: '抗氧化性能下降' }
        ],
        edges: [
          { relation: '促进', fact: '连通孔促进氧进入材料内部' },
          { relation: '削弱', fact: '氧扩散削弱抗氧化性能' }
        ],
        contradiction_hints: ['致密化条件下该风险下降']
      }
    ]
  })

  assert.equal(reasoning.trace.routeLabel, 'Auto → ToT')
  assert.equal(reasoning.trace.rootLabel, '6 个节点 · 5 条关系')
  assert.equal(reasoning.trace.reason, 'KG 子图包含多条分支或探索性语义，因此自动选择 ToT。')
  assert.equal(reasoning.trace.families.length, 2)
  assert.deepEqual(reasoning.trace.families.map(family => family.label), [
    'SiO2 保护层 / 氧扩散调控',
    '风险 / 权衡路线'
  ])
  assert.deepEqual(reasoning.trace.families.flatMap(family => family.branches).map(branch => ({
    id: branch.id,
    role: branch.role,
    score: branch.score,
    facts: branch.facts,
    evidence: branch.evidence
  })), [
    {
      id: 'path_001',
      role: '主路径',
      score: '93.84%',
      facts: ['SiC 氧化形成 SiO2 富集层', '保护层降低氧扩散'],
      evidence: ['氧化后形成连续 SiO2 保护层。']
    },
    {
      id: 'path_002',
      role: '候选路径',
      score: '81.20%',
      facts: ['连通孔促进氧进入材料内部', '氧扩散削弱抗氧化性能'],
      evidence: []
    }
  ])
})

test('builds the original shared-node reasoning topology from real routed paths', () => {
  const [reasoning] = buildQaAnswerDetails({
    reasoning_route: {
      requested_mode: 'auto',
      selected_mode: 'tot',
      selected_path_ids: ['path_001'],
      structural_metrics: { node_count: 4, relation_count: 4 }
    },
    routed_reasoning_paths: [
      {
        path_id: 'path_001',
        initial_score: 0.96,
        nodes: [
          { name: 'SiC' },
          { name: 'SiO2 保护层' },
          { name: '抗氧化性能' }
        ],
        edges: [
          { relation: '氧化生成' },
          { relation: '提升' }
        ]
      },
      {
        path_id: 'path_002',
        initial_score: 0.84,
        nodes: [
          { name: 'SiC' },
          { name: '孔隙封闭' },
          { name: '抗氧化性能' }
        ],
        edges: [
          { relation: '促进' },
          { relation: '改善' }
        ]
      }
    ]
  })

  const topology = reasoning.trace.topology
  assert.equal(topology.branches.length, 2)
  assert.deepEqual(topology.branches.map(branch => ({
    id: branch.id,
    selected: branch.selected,
    score: branch.score
  })), [
    { id: 'path_001', selected: true, score: '96.00%' },
    { id: 'path_002', selected: false, score: '84.00%' }
  ])
  assert.equal(topology.nodes.filter(node => node.label === 'SiC').length, 1)
  assert.equal(topology.nodes.find(node => node.label === 'SiC').branchIds.length, 2)
  assert.equal(topology.nodes.filter(node => node.label === '抗氧化性能').length, 1)
  assert.equal(topology.nodes.find(node => node.label === '抗氧化性能').branchIds.length, 2)
  assert.deepEqual(topology.edges.map(edge => edge.relation), [
    '氧化生成',
    '提升',
    '促进',
    '改善'
  ])
  assert.deepEqual(topology.edges.map(edge => edge.branchIds), [
    ['path_001'],
    ['path_001'],
    ['path_002'],
    ['path_002']
  ])
})

test('structures detailed derivation and does not expose serialized ontology objects', () => {
  const [logic] = buildQaAnswerDetails({
    logic_chain_derivation: [
      '推理组织：ToT 多分支比较。',
      '路径选择：进入回答的路径为 path001, path002。',
      '推导主线：从问题实体与性能目标出发，检查成分→结构→性能方向。',
      "本体约束：目标对象为 {'canonical': '抗氧化性能', 'ontology_id': '抗氧化性能'}、{'canonical': 'SiC', 'ontology_id': 'SiC'}，优先检查路径模板 composition-to-property。",
      'CoD 生成的逻辑链：',
      '机制链：成分变化 → 物相变化 → 传输通道改变 → 性能响应。',
      '结论边界：该回答应按成分-工艺-结构-性能链条理解。',
      '证据状态：hypothesis-level。',
      'ToT 分支组织：',
      '- 主路径 T1：SiC → SiO2 保护层 → 抗氧化性能；用于解释核心结论。',
      '- 候选路径 T2：孔隙连通 → 氧扩散；用于补充风险边界。'
    ].join('\n')
  })

  assert.equal(logic.id, 'logic')
  assert.deepEqual(logic.derivation.ontologyTerms, ['抗氧化性能', 'SiC'])
  assert.deepEqual(logic.derivation.sections.map(section => section.label), [
    '推理组织',
    '路径选择',
    '推导主线',
    '本体约束',
    '机制链',
    '结论边界',
    '证据状态',
    'ToT 分支组织'
  ])
  assert.deepEqual(logic.derivation.sections.at(-1).items, [
    '主路径 T1：SiC → SiO2 保护层 → 抗氧化性能；用于解释核心结论。',
    '候选路径 T2：孔隙连通 → 氧扩散；用于补充风险边界。'
  ])
  assert.doesNotMatch(JSON.stringify(logic.derivation), /canonical|ontology_id|\{'/)
  assert.match(logic.derivation.sections.find(section => section.label === '本体约束').content, /composition-to-property/)
})
