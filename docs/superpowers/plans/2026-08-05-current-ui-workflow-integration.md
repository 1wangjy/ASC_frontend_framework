# Current UI Workflow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留当前 ASC 新界面，并将文献、图谱入口和问答连接到仓库已有的后端五步工作流。

**Architecture:** 根级 `AscShell` 继续包裹所有路由；新页面作为一级入口，旧五步页面作为子工作流。页面只传递后端资源 ID，所有网络请求经过 `src/api`，不存在的接口改为前端路由行为。

**Tech Stack:** Vue 3、Vue Router 4、Axios、Vite、Node.js `node:test`

## Global Constraints

- 只修改 `frontend`，不修改 `backend`。
- 保留现有页面布局、class、颜色、间距和响应式规则。
- 后端契约以 `backend/app/api/*.py` 为准。
- 不生成 `file_id/project_id/graph_id/simulation_id/report_id/task_id/qa_run_id`。
- 不恢复或提交用户删除的 `docs/frontend-backend-api-contract.md`。
- 每项生产行为必须先有失败测试。

---

### Task 1: 恢复五步路由并保持统一外壳

**Files:**
- Modify: `src/config/ascRoutes.js`
- Modify: `src/components/navigation/AscSidebar.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: `workflowRouteDefinitions`，每个工作流路由带 `meta.navigationPath`。

- [ ] 写失败测试，断言 `/process/:projectId`、两个 simulation、report、interaction 路由及组件映射存在，并且图谱/问答导航映射正确。
- [ ] 运行 `node --test tests/ascLabExperience.test.js`，确认因工作流路由缺失而失败。
- [ ] 在 `ascRoutes.js` 增加五个已有页面路由，不删除六个新路由；路由顺序保证 `/simulation/:simulationId/start` 正确匹配。
- [ ] `AscSidebar.vue` 根据 `route.meta.navigationPath` 为工作流显示对应一级导航高亮。
- [ ] 运行定向测试并提交：`feat: restore backend workflow routes`。

### Task 2: 知识图谱入口改为真实工作流跳转

**Files:**
- Modify: `src/views/KnowledgeView.vue`
- Modify: `src/api/graph.js`
- Delete: `src/features/knowledge/knowledgeGraphLauncher.js`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/requestContracts.test.js`

**Interfaces:**
- Produces: “进入知识图谱”只执行 `router.push('/process/new')`。

- [ ] 写失败测试，要求知识图谱页直接跳转 `/process/new`，且 API 层不再导出 `launchKnowledgeGraph`。
- [ ] 运行测试，确认仍存在 `/api/graph/launch` 而失败。
- [ ] 删除 launch API 和重定向适配器；保留按钮文字、class 和加载保护外观所需最小状态。
- [ ] 运行测试并提交：`fix: route graph entry to existing workflow`。

### Task 3: 从文献管理传递真实 file_id

**Files:**
- Create: `src/features/library/libraryWorkflowModel.js`
- Create: `tests/libraryWorkflowModel.test.js`
- Modify: `src/features/library/DocumentTable.vue`
- Modify: `src/views/DocumentLibraryView.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Produces: `toggleSelectedDocumentId(ids, id)`、`reconcileSelectedDocumentIds(ids, documents)`、`buildPdfLibrarySelection(documents, ids)`。
- Consumes: `setPendingUpload(..., { pdfLibraryFileIds, pdfLibraryFiles })`。

- [ ] 写失败测试：多选不重复、刷新后移除已删除 ID、输出只包含后端真实 `fileId`。
- [ ] 运行 `node --test tests/libraryWorkflowModel.test.js`，确认模块缺失而失败。
- [ ] 实现纯模型；在表格复用现有复选框，点击复选框只切换多选，点击行仍打开详情。
- [ ] 顶部增加同风格“使用选中文献构建图谱”，无选择时 disabled；点击写入 pendingUpload 并跳转 `/process/new`。
- [ ] 运行模型、体验测试并提交：`feat: start graph workflow from selected pdf files`。

### Task 4: 问答页只接受后端资源 ID

**Files:**
- Modify: `src/views/AscQaView.vue`
- Modify: `src/features/projects/projectContextModel.js`
- Modify: `tests/projectContextModel.test.js`
- Modify: `tests/ascLabExperience.test.js`
- Delete: `.env.example`

**Interfaces:**
- Consumes: `listGraphProjects(projects)` 和后端返回的 `project_id/graph_id`。
- Produces: 无图谱时“去构建知识图谱”跳转 `/process/new`。

- [ ] 写失败测试，禁止 `configured:`、`VITE_DEFAULT_GRAPH_ID` 和正式预览入口，要求存在构图跳转。
- [ ] 运行测试并确认旧配置回退导致失败。
- [ ] 删除配置回退函数和环境文件；视图恢复直接过滤后端项目列表；移除 `/?preview=answer` 正式入口。
- [ ] 保留真实回答的 Judge/Feedback 保护；运行测试并提交：`fix: require backend graph ids for qa`。

### Task 5: 补齐现有后端 API 封装

**Files:**
- Modify: `src/api/requestContracts.js`
- Modify: `src/api/graph.js`
- Modify: `src/api/simulation.js`
- Modify: `src/api/report.js`
- Modify: `tests/requestContracts.test.js`

**Interfaces:**
- Produces: 图谱 edge/reset/delete、报告 sections/download、simulation interview 单个/批量/全部封装。

- [ ] 写请求构造失败测试，逐项断言真实 HTTP 方法、路径参数编码和 snake_case data。
- [ ] 运行测试，确认构造函数缺失而失败。
- [ ] 在 `requestContracts.js` 实现纯请求对象，在对应 API 文件中通过统一 `service` 调用。
- [ ] 运行契约测试并提交：`feat: complete existing backend api wrappers`。

### Task 6: 全链路验证与沟通表

**Files:**
- Create: `docs/frontend-backend-integration-status.md`

**Interfaces:**
- Produces: 页面功能、API、前端状态、后端缺口四列表。

- [ ] 运行 `node --test tests/*.test.js`，要求 0 失败。
- [ ] 运行 `npm run build`，要求退出码 0。
- [ ] 运行 `git diff --check`，检查只包含本阶段文件和用户原有删除。
- [ ] 根据后端路由与实际前端调用写状态表，明确 `/api/graph/launch` 已移除、PDF 元数据解析仍缺后端接口。
- [ ] 提交：`docs: record frontend backend integration status`。
