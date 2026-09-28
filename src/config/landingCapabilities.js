/**
 * 首页「平台能力」卡片数据源 —— 卡片保持极简：状态 + 标题 + 一句短提示（≤ 24 字）。
 * 与平台真实模块一一对应；route 必须能在 ascRoutes 中解析到真实路由（单测兜底，避免死链）。
 */
export const landingCapabilities = [
  {
    icon: '📚',
    title: '文献库管理',
    status: '已上线',
    route: { path: '/platform/data', query: { tab: 'literature' } },
    hint: '17,698 条 · 四类 · DOI 去重',
  },
  {
    icon: '🧭',
    title: '数据平台',
    status: '已上线',
    route: { path: '/platform/data', query: { tab: 'parse' } },
    hint: '六张主表 · 解析与管理',
  },
  {
    icon: '🕸️',
    title: '知识图谱',
    status: '已上线',
    route: { path: '/process' },
    hint: '图谱构建 · 证据推理 · 报告',
  },
  {
    icon: '💬',
    title: '问题研究',
    status: '已上线',
    route: { path: '/research', query: { mode: 'multi' } },
    hint: '智能会话 · 深度研究',
  },
  {
    icon: '📈',
    title: '性能预测',
    status: '已上线',
    route: { path: '/platform/model1' },
    hint: '4 项属性 · 7 组来源权重',
  },
  {
    icon: '⚗️',
    title: '配方优化',
    status: '已上线',
    route: { path: '/platform/model2' },
    hint: '按目标指标反推配方',
  },
  {
    icon: '🎨',
    title: '仿真重建',
    status: '已上线',
    route: { path: '/platform/model4' },
    hint: '结构 + 温度场 → 3D',
  },
  {
    icon: '🌡️',
    title: '服役预测',
    status: '建设中',
    route: { path: '/platform/model3' },
    hint: '工况 → 服役性能评估',
  },
]
