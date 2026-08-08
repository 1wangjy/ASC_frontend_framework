# Frontend 模块清理与 5002 接入设计

## 目标

保留当前 3000 端口前端中的问答首页、文献管理和可运行的旧工作流，删除新门户中“知识图谱、数据平台、专业模型”三个独立模块及确认不可达的死亡代码；同时让开发环境中的 3000 前端统一访问 5002 后端。

## 保留范围

- `/` 问答首页及问答、证据、评价相关逻辑。
- `/documents` 文献管理及 PDF 文件库逻辑。
- `/process/:projectId`、`/simulation/:simulationId`、`/simulation/:simulationId/start`、`/report/:reportId`、`/interaction/:reportId` 工作流。
- 上述工作流依赖的 `src/api/graph.js`、项目上下文、Step1 至 Step5、GraphPanel 和报告/仿真逻辑。
- 文献管理中的“使用选中文献构建图谱”入口，因为它属于保留的实际工作流。

## 删除范围

删除以下门户路由和导航入口：

- `/knowledge`
- `/knowledge/explorer`
- `/data`
- `/models`

删除对应页面和专属实现：

- `src/views/KnowledgeView.vue`
- `src/views/KnowledgeExplorerView.vue`
- `src/views/DataPlatformView.vue`
- `src/views/ModelsView.vue`
- `src/features/knowledge/`
- `src/features/overview/`

同时删除已经确认不在入口、路由或活动组件依赖链上的旧文件：

- `src/views/Home.vue`
- `src/views/Process.vue`
- `src/components/ASCReportUploader.vue`
- `src/components/HistoricalDataImport.vue`
- `src/components/HistoryDatabase.vue`
- `src/components/PdfStorageSidebar.vue`
- `src/utils/ascPromptBuilder.js`
- `src/features/library/libraryData.js`
- 删除上述文件后仍无引用的 `src/assets/` 图片。

不因为名称中出现 graph、knowledge 或 model 就删除代码。问答 GraphRAG、项目选择、文献构图以及旧工作流仍需要图谱 API 和领域问答逻辑。

## 问答界面调整

- 从 `AscSidebar.vue` 移除“新建问答”按钮及 `new-chat` 事件。
- 从 `AscShell.vue` 移除只为侧栏按钮存在的 `startNewChat` 路由逻辑。
- `RecentConversationsPanel.vue` 默认标题由“示例问题”改为“历史问题”。
- 在右侧“历史问题”标题行加入“新建问答”按钮。
- 点击按钮由面板向 `AscQaView.vue` 发出事件，问答页复用现有 reset 行为清空当前答案、输入内容和问题引导，并回到新的空会话。
- 紧凑屏幕下，“历史问题”弹出面板内同样保留该按钮。

## 3000 到 5002 的连接方式

- Vite 开发服务器继续固定使用 3000。
- `/api` 开发代理目标从 `127.0.0.1:5001` 改为 `127.0.0.1:5002`。
- Axios 开发默认地址改为同源相对地址，让所有 `/api/...` 请求经过 Vite 代理。
- PDF 预览、PDF 下载和互动组件中的直接 URL 同样使用统一的环境变量；没有设置 `VITE_API_BASE_URL` 时使用相对地址，不再硬编码 5001。
- 生产环境仍可通过 `VITE_API_BASE_URL` 指定真实后端地址。
- 本次只统一连接地址，不扩大到尚未批准的后端接口协议重构。

## 测试与验收

- 先更新或新增源文件结构测试，验证导航只剩问答首页和文献管理、四个门户路由已移除、侧栏不再包含“新建问答”。
- 新增问答历史面板测试，验证“历史问题”和面板内“新建问答”事件。
- 新增开发配置测试，验证 3000 和 5002 配置以及代码中不再存在 `127.0.0.1:5001`。
- 删除仅测试已删除知识图谱浏览模块的测试文件。
- 运行全部 Node 测试，并区分本次新增失败与审查阶段已经存在的报告轮询、项目筛选失败。
- 运行 `npm run build`，以生产构建成功作为“前端仍可运行”的必要验收。
- 若 5002 后端正在运行，再请求 3000 的代理 API 做一次连通性检查；若未运行，明确报告未执行实时联调。

## 非目标

- 不删除 D:\WEB 下的 3001 前端或 5002 后端文件。
- 不删除旧工作流。
- 不修改后端代码。
- 不在本次任务中修复已知的报告状态请求方式和项目列表契约问题。
- 不提交或推送业务改动到远程仓库，除设计文档按工作流程单独记录外。
