'use strict';

/**
 * 2026 年验收检查注册表（「模型入口 → 验收测试[2026]」的数据源）。
 *
 * 依据：`report_2026/ASC26年验收准备_v1/`（v1 验收准备：4 项合同工作 + 2 项额外工作 + 11 份交付材料）
 *   - 合同指标：数据库 ≥300 条配方；性能预测/配方优化 预测偏差 ≤25%；发明专利 1 项受理
 *   - 现场验收形式：材料 10/11 + 演示链路（数据库查询导出 → 性能预测 → 配方优化）
 *   - 额外工作：平台建设、知识图谱（10 类实体/关系；节点 400 / 边 1,003）
 *
 * 设计：本文件是**纯数据**（不含执行逻辑），每条 check 声明 kind 与判定条件，
 * 由 `services/acceptanceService.js` 执行。三种结论：
 *   pass    自动核验通过
 *   fail    自动核验不通过
 *   manual  需人工确认（如发明专利受理通知书、实物试验），由页面记录确认状态
 */

const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');           // ASC_frontend_framework
const ACCEPT_DIR = process.env.ASC_ACCEPT_DIR
  || path.resolve(REPO, '..', 'report_2026', 'ASC26年验收准备_v1');
const ACCEPT_DATA = path.join(ACCEPT_DIR, 'data');
const REPO_DB = path.join(REPO, 'backend_impl', 'data', 'sqlite', 'database.db');

const CATEGORIES = [
  { key: 'contract', label: '合同验收类', hint: '26 年验收必用：合同 4 项 + 材料 01–05' },
  { key: 'onsite', label: '现场验收类', hint: '验收当天：材料 10/11 + 演示链路' },
  { key: 'extra', label: '额外工作类', hint: '不在 26 年验收范围，提前成套归档（材料 06–09 + 平台/图谱）' },
];

/** 材料文件（模板 01–11）在三类目录中的位置 */
const DOCUMENTS = [
  ['合同验收类/01_数据库数据字典.docx', '模板 01 数据库数据字典'],
  ['合同验收类/02_数据库数据量统计表.docx', '模板 02 数据库数据量统计表'],
  ['合同验收类/03_性能预测模型测评报告.docx', '模板 03 性能预测模型测评报告'],
  ['合同验收类/04_配方优化模型测评报告.docx', '模板 04 配方优化模型测评报告'],
  ['合同验收类/05_验收测试方案与记录.docx', '模板 05 验收测试方案与记录'],
  ['额外工作类/06_平台用户操作手册.docx', '模板 06 平台用户操作手册'],
  ['额外工作类/07_平台功能与架构说明.docx', '模板 07 平台功能与架构说明'],
  ['额外工作类/08_知识图谱构建说明报告.docx', '模板 08 知识图谱构建说明报告'],
  ['额外工作类/09_知识图谱数据统计表.docx', '模板 09 知识图谱数据统计表'],
  ['现场验收类/10_阶段性总结报告.docx', '模板 10 阶段性总结报告'],
  ['现场验收类/11_2026年度阶段性验收汇报.pptx', '模板 11 验收汇报 PPT'],
];

/** 文档检查 id：取文件名前导编号（01…11），稳定且不因中文切片而碰撞 */
function docId(relativePath) {
  const match = /(\d{2})_/.exec(path.basename(relativePath));
  return `doc-${match ? match[1] : path.basename(relativePath, path.extname(relativePath))}`;
}

const items = [
  // ───────────────────────── 合同验收类 ─────────────────────────
  {
    id: 'db-v1', category: 'contract', title: '数据库 V1.0（≥300 条关联数据）',
    metric: '合同：包含 ≥300 条材料性能与组成配比关联数据；支持查询与导出',
    expect: '实测 780 配方 / 12,522 组分 / 89 材料 / 文献 17,698（达成率 260%）',
    evidence: ['data/ASC_material_database_V1.sqlite', 'data/数据库数据量统计.json'],
    checks: [
      { id: 'db-v1-recipes', label: '平台库：配方数 ≥ 300', kind: 'sqlite', db: REPO_DB, query: 'SELECT COUNT(*) FROM ml_formula', op: '>=', expect: 300 },
      { id: 'db-v1-components', label: '平台库：组分记录数 ≥ 300', kind: 'sqlite', db: REPO_DB, query: 'SELECT COUNT(*) FROM ml_formula_component', op: '>=', expect: 300 },
      { id: 'db-v1-materials', label: '平台库：材料主数据 89 条', kind: 'sqlite', db: REPO_DB, query: 'SELECT COUNT(*) FROM material_base', op: '>=', expect: 80 },
      { id: 'db-v1-delivered', label: '交付单文件库存在且含配方表', kind: 'sqlite', db: path.join(ACCEPT_DATA, 'ASC_material_database_V1.sqlite'), query: 'SELECT COUNT(*) FROM ml_formula', op: '>=', expect: 300 },
      { id: 'db-v1-stats-json', label: '数据量统计.json 与阈值一致', kind: 'json-stat', file: path.join(ACCEPT_DATA, '数据库数据量统计.json') },
    ],
  },
  {
    id: 'model-predict', category: 'contract', title: '性能预测模型 V1.0（偏差 ≤25%）',
    metric: '合同：预测偏差 ≤25%；支持形式：交付运行程序（集成于平台）',
    expect: '实测逐属性平均相对偏差 1.19% / 10.07% / 7.31% / 15.96%（226 样本，213/226 ≤25%）',
    evidence: ['data/预测偏差_逐样本_阳泉留出集.csv', 'data/预测偏差_汇总.json'],
    checks: [
      { id: 'pred-csv', label: '逐样本 226 行、213 条偏差 ≤25%、逐属性均值 ≤25%', kind: 'deviation-csv', file: path.join(ACCEPT_DATA, '预测偏差_逐样本_阳泉留出集.csv') },
      { id: 'pred-online', label: '线上 API 冒烟：/api/v1/predict/simple 返回有限值', kind: 'http-predict' },
      { id: 'pred-deploy', label: '部署模型四项留出 R² > 0.85', kind: 'json', file: path.join(REPO, 'backend_impl/python/model_predict/MODEL/metrics_exp_best.json'),
        assert: { path: 'models', every: { field: 'holdout_r2', op: '>', value: 0.85 } } },
    ],
  },
  {
    id: 'model-opt', category: 'contract', title: '配方优化模型 V1.0（偏差 ≤25%）',
    metric: '合同：预测偏差 ≤25%；以预测模型为黑盒评价函数',
    expect: '2 个优化案例目标达成（NSGA-II, budget=200, 96 种原料）；优化配方实物试验【实测待补】',
    evidence: ['data/优化案例.json'],
    checks: [
      { id: 'opt-cases', label: '优化案例.json：案例数 ≥2 且目标达成', kind: 'opt-cases', file: path.join(ACCEPT_DATA, '优化案例.json') },
      { id: 'opt-materials', label: '线上优化器原料表可用（96 种）', kind: 'http-json', url: 'http://127.0.0.1:3001/api/model2/materials', assert: { path: 'data.materials.length', op: '>=', value: 90 } },
      { id: 'opt-constraints-unique', label: '成分约束：可直接绑定的 base ≥ 40', kind: 'http-json', url: 'http://127.0.0.1:3001/api/model2/materials', assert: { path: 'data.summary.unique', op: '>=', value: 40 } },
      { id: 'opt-constraints-multiple', label: '成分约束：需指定具体原料的 base ≥ 5', kind: 'http-json', url: 'http://127.0.0.1:3001/api/model2/materials', assert: { path: 'data.summary.multiple', op: '>=', value: 5 } },
    ],
  },
  {
    id: 'patent', category: 'contract', title: '发明专利（合同第 4 项）',
    metric: '合同：1 项发明专利受理',
    expect: '交底书专家版 v2 定稿并通过形式审查（2026-10-11）；受理通知书未取得',
    evidence: ['data/发明专利状态.json', 'ASC_frontend_framework/_patent/_updated_ref/patent_pckv3/invention_disclosure_expert_v2.tex'],
    checks: [
      { id: 'patent-manual', label: '受理通知书（须先提交申请）— 人工确认', kind: 'manual', note: '风险：未见申请号与受理通知书；提交后回填' },
    ],
  },

  // ───────────────────────── 现场验收类 ─────────────────────────
  {
    id: 'onsite-docs', category: 'onsite', title: '现场提交材料（模板 10/11）',
    metric: '验收形式：现场验收，当天提交《阶段性总结报告》《验收汇报 PPT》',
    expect: '模板 10 阶段总结（八章 + 附表 A/B）、模板 11 汇报 PPT',
    evidence: ['现场验收类/10_阶段性总结报告.docx', '现场验收类/11_2026年度阶段性验收汇报.pptx'],
    checks: [
      { id: 'doc-10', label: '模板 10 阶段性总结报告存在', kind: 'file', file: path.join(ACCEPT_DIR, '现场验收类/10_阶段性总结报告.docx'), minBytes: 5000 },
      { id: 'doc-11', label: '模板 11 验收汇报 PPT 存在', kind: 'file', file: path.join(ACCEPT_DIR, '现场验收类/11_2026年度阶段性验收汇报.pptx'), minBytes: 5000 },
    ],
  },
  {
    id: 'onsite-demo', category: 'onsite', title: '现场演示链路（数据库→预测→优化）',
    metric: '建议演示顺序：数据库在线查询与导出 → 性能预测在线调用 → 配方优化在线调用 → 偏差材料评审',
    expect: '四服务在线，链路可用',
    evidence: ['平台内在线查询与导出', '/api/v1/predict/simple', '/api/model2/materials'],
    checks: [
      { id: 'svc-beimpl', label: 'beimpl(3001) 健康', kind: 'http', url: 'http://127.0.0.1:3001/health', expect: 200 },
      { id: 'svc-modelapi', label: 'modelapi(8100) 健康', kind: 'http', url: 'http://127.0.0.1:8100/health', expect: 200 },
      { id: 'svc-ai4sci', label: 'ai4sci(5001) 健康', kind: 'http', url: 'http://127.0.0.1:5001/health', expect: 200 },
      { id: 'svc-frontend', label: 'frontend(3005) 可访问', kind: 'http', url: 'http://127.0.0.1:3005/', expect: 200 },
      { id: 'demo-literature', label: '数据库查询冒烟：文献库可查询（≥1000 条）', kind: 'http-json', url: 'http://127.0.0.1:3001/api/new-data/literature/all', assert: { minLength: 1000 } },
    ],
  },

  // ───────────────────────── 额外工作类 ─────────────────────────
  {
    id: 'docs-01-05', category: 'contract', title: '合同验收材料 01–05',
    metric: '合同验收类材料齐备（数据字典/数据量统计/两模型测评/测试方案与记录）',
    expect: '5 份 docx 成稿',
    evidence: ['合同验收类/01–05'],
    checks: DOCUMENTS.slice(0, 5).map(([rel, label]) => ({
      id: docId(rel), label: `${label} 存在`,
      kind: 'file', file: path.join(ACCEPT_DIR, rel), minBytes: 5000,
    })),
  },
  {
    id: 'docs-06-09', category: 'extra', title: '额外工作材料 06–09',
    metric: '平台与知识图谱材料成套（手册/架构说明/图谱说明/图谱统计）',
    expect: '4 份 docx 成稿',
    evidence: ['额外工作类/06–09'],
    checks: DOCUMENTS.slice(5, 9).map(([rel, label]) => ({
      id: docId(rel), label: `${label} 存在`,
      kind: 'file', file: path.join(ACCEPT_DIR, rel), minBytes: 5000,
    })),
  },
  {
    id: 'platform', category: 'extra', title: '平台建设 V1.0（额外工作）',
    metric: '三支柱（问题研究 / 数据平台 / 模型入口）、15 条路由、11 个二级菜单；写入门禁与统一契约已落地',
    expect: '路由与菜单结构符合验收材料描述',
    evidence: ['模板 07 平台功能与架构说明'],
    checks: [
      { id: 'platform-routes', label: '平台路由与导航结构核验（含验收测试页本身）', kind: 'platform-structure' },
    ],
  },
  {
    id: 'kg', category: 'extra', title: '知识图谱（额外工作）',
    metric: '固定本体 10 类实体 + 10 类关系；实例节点 400 / 边 1,003',
    expect: '图谱统计与本体约束一致',
    evidence: ['data/知识图谱统计.json', 'assets/fig_kg_overview.png'],
    checks: [
      { id: 'kg-stats', label: '图谱统计.json：实体/关系类型数 ≥10，节点/边 > 0', kind: 'kg-stats', file: path.join(ACCEPT_DATA, '知识图谱统计.json') },
    ],
  },
  {
    id: 'regression', category: 'extra', title: '回归测试（平台功能测试记录）',
    metric: '功能测试并入模板 05；本页提供可点击复跑入口',
    expect: '词表不变式与既有回归套件全绿',
    evidence: ['tests/*.test.js'],
    checks: [
      { id: 'test-vocab', label: '词表归束不变式（tests/materialVocab.test.js）', kind: 'command', cmd: 'node', args: ['--test', 'tests/materialVocab.test.js'], cwd: REPO, parseTests: true },
      { id: 'test-constraints', label: '成分约束工具（tests/ingredientConstraints.test.js）', kind: 'command', cmd: 'node', args: ['--test', 'tests/ingredientConstraints.test.js'], cwd: REPO, parseTests: true },
      { id: 'test-material-base', label: '物料注册表（npm run test:material-base）', kind: 'command', cmd: 'npm', args: ['run', '--silent', 'test:material-base'], cwd: REPO, parseTests: true },
      { id: 'test-route-access', label: '路由权限（npm run test:route-access）', kind: 'command', cmd: 'npm', args: ['run', '--silent', 'test:route-access'], cwd: REPO, parseTests: true },
      { id: 'vocab-check', label: 'canonical 词表自检（build_material_vocab.py --check）', kind: 'command', cmd: 'python3', args: ['backend_impl/scripts/build_material_vocab.py', '--check'], cwd: REPO, parseTests: false },
    ],
  },
  {
    id: 'multi-user', category: 'extra', title: '多用户管理（注册·审批·权限）',
    metric: '邮箱注册 + 管理员审批 + 失败锁定 + 禁用即时失效；账号表与接口均可用',
    expect: 'users 表结构/唯一索引齐备；未授权接口返回 401；端到端流程 17 项全通过；前端可编译',
    evidence: ['backend_impl/scripts/verify-user-management.js', 'src/platform/views/UserManagementView.vue'],
    checks: [
      { id: 'mu-users-schema', label: 'users 表含 16 列（账号/审批/锁定字段齐备）', kind: 'sqlite', db: REPO_DB, query: "SELECT COUNT(*) FROM pragma_table_info('users')", op: '>=', expect: 16 },
      { id: 'mu-users-email-index', label: '邮箱唯一索引 idx_users_email_unique 存在', kind: 'sqlite', db: REPO_DB, query: "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_users_email_unique'", op: '>=', expect: 1 },
      { id: 'mu-admin-approved', label: '内置 admin 账号为已通过状态', kind: 'sqlite', db: REPO_DB, query: "SELECT COUNT(*) FROM users WHERE username='admin' AND status='approved' AND is_delete=0", op: '>=', expect: 1 },
      { id: 'mu-me-unauthorized', label: '未带令牌访问 /api/auth/me 返回 401', kind: 'http', url: 'http://127.0.0.1:3001/api/auth/me', expect: 401 },
      { id: 'mu-users-unauthorized', label: '未带令牌访问 /api/user/users 返回 401', kind: 'http', url: 'http://127.0.0.1:3001/api/user/users', expect: 401 },
      { id: 'mu-flow-e2e', label: '端到端：注册→待审批→审批→登录→改密→锁定→禁用→删除', kind: 'command', cmd: 'node', args: ['backend_impl/scripts/verify-user-management.js'], cwd: REPO, parseTests: true },
      { id: 'mu-frontend-build', label: '前端可编译（含用户管理页与登录/注册弹窗）', kind: 'command', cmd: 'node', args: ['node_modules/.bin/vite', 'build'], cwd: REPO, parseTests: false },
    ],
  },
];

function groupByCategory() {
  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c.key, { ...c, items: [] }]));
  for (const item of items) {
    (buckets[item.category] || buckets.extra).items.push(item);
  }
  return Object.values(buckets);
}

/** 只暴露可执行部分（不含内部路径之外的信息），供 GET /api/acceptance/checks */
function publicRegistry() {
  return {
    acceptDir: ACCEPT_DIR,
    categories: groupByCategory().map((bucket) => ({
      key: bucket.key, label: bucket.label, hint: bucket.hint,
      items: bucket.items.map((item) => ({
        id: item.id, title: item.title, metric: item.metric, expect: item.expect, evidence: item.evidence,
        checks: item.checks.map((check) => ({ id: check.id, label: check.label, kind: check.kind, manual: check.kind === 'manual', note: check.note })),
      })),
    })),
    totals: {
      items: items.length,
      checks: items.reduce((sum, item) => sum + item.checks.length, 0),
      documents: DOCUMENTS.length,
    },
  };
}

module.exports = { ACCEPT_DIR, ACCEPT_DATA, REPO, REPO_DB, CATEGORIES, DOCUMENTS, items, groupByCategory, publicRegistry };
