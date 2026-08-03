export const graphNodes = [
  {
    nodeId: 'material:sic',
    label: 'SiC',
    type: '原料',
    aliases: ['碳化硅'],
    x: 250,
    y: 180,
    relationshipCount: 6,
    evidenceCount: 32
  },
  {
    nodeId: 'material:alumina',
    label: 'Al₂O₃',
    type: '原料',
    aliases: ['氧化铝', '刚玉'],
    x: 100,
    y: 92,
    relationshipCount: 4,
    evidenceCount: 41
  },
  {
    nodeId: 'phase:carbon',
    label: 'C 相',
    type: '物相',
    aliases: ['碳相', '石墨'],
    x: 400,
    y: 86,
    relationshipCount: 5,
    evidenceCount: 27
  },
  {
    nodeId: 'reaction:sic-oxidation',
    label: 'SiC 氧化',
    type: '反应',
    aliases: ['碳化硅氧化'],
    x: 430,
    y: 225,
    relationshipCount: 3,
    evidenceCount: 18
  },
  {
    nodeId: 'performance:thermal-shock',
    label: '热震稳定性',
    type: '性能',
    aliases: ['抗热震性', '热冲击'],
    x: 250,
    y: 355,
    relationshipCount: 7,
    evidenceCount: 46
  },
  {
    nodeId: 'mechanism:slag-corrosion',
    label: '渣蚀机理',
    type: '机理',
    aliases: ['熔渣侵蚀', '渣铁侵蚀'],
    x: 530,
    y: 365,
    relationshipCount: 4,
    evidenceCount: 21
  },
  {
    nodeId: 'performance:strength',
    label: '残余强度',
    type: '性能',
    aliases: ['强度保持率'],
    x: 95,
    y: 340,
    relationshipCount: 4,
    evidenceCount: 24
  },
  {
    nodeId: 'process:particle-grading',
    label: '颗粒级配',
    type: '工艺',
    aliases: ['粒度分布', '级配设计'],
    x: 610,
    y: 125,
    relationshipCount: 3,
    evidenceCount: 16
  }
]

export const graphEdges = [
  { edgeId: 'edge:sic-alumina', source: 'material:sic', target: 'material:alumina', label: '组成协同' },
  { edgeId: 'edge:sic-carbon', source: 'material:sic', target: 'phase:carbon', label: '复相组成' },
  { edgeId: 'edge:sic-oxidation', source: 'material:sic', target: 'reaction:sic-oxidation', label: '发生反应' },
  { edgeId: 'edge:sic-thermal', source: 'material:sic', target: 'performance:thermal-shock', label: '影响' },
  { edgeId: 'edge:sic-strength', source: 'material:sic', target: 'performance:strength', label: '影响' },
  { edgeId: 'edge:sic-grading', source: 'material:sic', target: 'process:particle-grading', label: '受控于' },
  { edgeId: 'edge:carbon-oxidation', source: 'phase:carbon', target: 'reaction:sic-oxidation', label: '耦合反应' },
  { edgeId: 'edge:oxidation-corrosion', source: 'reaction:sic-oxidation', target: 'mechanism:slag-corrosion', label: '促进' },
  { edgeId: 'edge:thermal-strength', source: 'performance:thermal-shock', target: 'performance:strength', label: '评价指标' },
  { edgeId: 'edge:grading-strength', source: 'process:particle-grading', target: 'performance:strength', label: '调控' }
]
