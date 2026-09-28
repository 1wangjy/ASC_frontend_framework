/**
 * 首页「平台能力」卡片数据源。
 * 与平台真实模块一一对应：status 反映当前实现状态，facts 只写已实现/已实测的能力，
 * route 必须能在 src/config/ascRoutes.js 中解析到真实路由（由单测兜底，避免死链）。
 */
export const landingCapabilities = [
  {
    icon: '📚',
    title: '文献库管理',
    status: '已上线',
    route: { path: '/platform/data', query: { tab: 'literature' } },
    desc: '多源文献合并、去重与附件管理，沉淀领域知识基座。',
    facts: [
      '17,698 条文献，按 期刊论文 / 会议论文 / 专利 / 书籍 分类',
      'DOI 优先合并与有效性校验，支持 PDF 附件与图谱选题',
    ],
  },
  {
    icon: '🧭',
    title: '数据平台 · 解析与管理',
    status: '已上线',
    route: { path: '/platform/data', query: { tab: 'parse' } },
    desc: '配方与工况解析、结构化数据管理与 ML 数据集准备。',
    facts: [
      '原料 / 配方 / 物性 / 测试 / 工况 / 服役 六张主表',
      '配方·工况·服役·重建四类解析与数据导入导出',
    ],
  },
  {
    icon: '🕸️',
    title: '知识图谱与报告',
    status: '已上线',
    route: { path: '/process' },
    desc: '从选文献到图谱构建、证据推理与报告沉淀的完整链路。',
    facts: [
      '图谱项目工作区：实体与关系抽取、图谱生命周期与版本管理',
      '证据推理 → 报告中心 → 问答与证据评估',
    ],
  },
  {
    icon: '💬',
    title: '问题研究',
    status: '已上线',
    route: { path: '/research', query: { mode: 'multi' } },
    desc: '面向配方、工艺、结构与性能的研究型问答。',
    facts: ['智能会话与深度研究两条路径', '结论附可追溯证据，可回流到报告'],
  },
  {
    icon: '📈',
    title: '性能预测',
    status: '已上线',
    route: { path: '/platform/model1' },
    desc: '提交配方组成与工艺参数，预测烧成后的材料性能。',
    facts: [
      '体积密度 / 常温抗折强度 / 常温耐压强度 / 线变化率 四项属性',
      '7 组来源权重可切换，工况环 + 雷达对比；阳泉模型体积密度 test R² 0.94',
    ],
  },
  {
    icon: '⚗️',
    title: '配方优化',
    status: '已上线',
    route: { path: '/platform/model2' },
    desc: '给定目标测试指标，反向搜索配方组成。',
    facts: [
      '采样预算与约束搜索（3~20 种原料、配比 0.5%~40%）',
      '优化轨迹与收敛状态实时流式呈现',
    ],
  },
  {
    icon: '🎨',
    title: '仿真重建',
    status: '已上线',
    route: { path: '/platform/model4' },
    desc: '由结构拓扑与温度测点重构三维温度场。',
    facts: [
      '支持 .stl / .obj 结构文件 + 温度点文件（.csv / .json）',
      '3D 交互可视化与温度统计',
    ],
  },
  {
    icon: '🌡️',
    title: '服役预测',
    status: '建设中',
    route: { path: '/platform/model3' },
    desc: '由工况指标生成环境嵌入，评估服役性能。',
    facts: ['规划中：工况指标 → 环境嵌入 → 服役性能评估', '当前版本尚未开放，敬请期待'],
  },
]
