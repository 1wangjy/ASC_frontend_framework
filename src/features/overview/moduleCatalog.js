export const moduleCatalog = {
  knowledge: {
    title: '知识图谱',
    description: '组织耐火材料组成、工艺、物相、性能与服役环境之间的可追溯关系。',
    status: '图谱结构预览',
    items: [
      {
        title: '材料体系',
        subtitle: 'Al₂O₃-SiC-C 与碳结合耐火材料',
        description: '以材料牌号、原料组成和颗粒级配作为图谱入口。',
        details: ['原料与添加剂', '配方比例', '材料牌号', '生产批次']
      },
      {
        title: '物相与反应',
        subtitle: '高温反应、氧化与保护相',
        description: '表达升温和服役过程中的物相转变及反应路径。',
        details: ['物相组成', '界面反应', '氧化路径', '保护层形成']
      },
      {
        title: '性能关系',
        subtitle: '结构—性能—工况关联',
        description: '将实验指标与微观结构、工艺参数和失效模式关联。',
        details: ['热震稳定性', '抗侵蚀性', '残余强度', '失效模式']
      }
    ]
  },
  data: {
    title: '数据平台',
    description: '统一管理配方、实验、表征、工况和仿真数据，为问答与专业模型提供输入。',
    status: '数据目录预览',
    items: [
      {
        title: '配方与工艺',
        subtitle: '原料、比例、成型及热处理',
        description: '建立可检索的配方版本和工艺条件记录。',
        details: ['原料批次', '颗粒级配', '混炼与成型', '烧成制度']
      },
      {
        title: '实验与表征',
        subtitle: '性能指标和显微结构',
        description: '管理标准化检测结果与材料表征附件。',
        details: ['物理性能', '高温性能', 'XRD/SEM', '热震与侵蚀']
      },
      {
        title: '服役与仿真',
        subtitle: '现场工况和计算任务',
        description: '连接真实服役记录、边界条件与仿真输出。',
        details: ['温度与压力', '介质组成', '服役周期', '计算结果']
      }
    ]
  },
  models: {
    title: '专业模型',
    description: '面向耐火材料领域任务管理模型能力、适用范围和运行方式。',
    status: '模型目录预览',
    items: [
      {
        title: 'ASC 领域问答模型',
        subtitle: '材料知识问答与证据生成',
        description: '结合专业术语、本体和文献索引回答材料问题。',
        details: ['术语识别', '文献引用', '证据评估', '结构化回答']
      },
      {
        title: '配方性能预测',
        subtitle: '组成与工艺条件映射',
        description: '为配方筛选和性能趋势分析提供模型入口。',
        details: ['特征配置', '模型选择', '预测区间', '结果解释']
      },
      {
        title: '失效机理分析',
        subtitle: '侵蚀、氧化与热震路径',
        description: '融合图谱和实验记录组织失效原因与验证建议。',
        details: ['机理路径', '证据对齐', '风险因素', '验证建议']
      }
    ]
  }
}
