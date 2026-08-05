# 现有 ASC 界面与后端五步工作流接入设计

日期：2026-08-05

## 目标

保留当前 `AscShell`、一级导航和六个新页面的视觉外观，同时恢复仓库已经存在的五步工作流页面。所有网络请求严格使用 `backend/app/api` 已注册的路由和 `frontend/src/api` 封装；后端没有的能力只保留禁用界面或列入缺口，不创建假接口。

## 契约优先级

1. `backend/app/api/*.py` 的路由装饰器、HTTP 方法和参数校验；
2. 根目录 `TECH_README.md` 的业务语义和资源关系；
3. 当前界面到后端能力的产品映射。

当 README 与代码不一致时，以后端代码为准，并记录沟通项。

## 路由结构

保留当前入口：

- `/`：问答首页；
- `/documents`：文献管理；
- `/knowledge`：知识图谱入口；
- `/knowledge/explorer`：已完成图谱查看；
- `/data`：数据平台；
- `/models`：专业模型。

恢复已有工作流页面：

- `/process/:projectId` → `MainView.vue`；
- `/simulation/:simulationId` → `SimulationView.vue`；
- `/simulation/:simulationId/start` → `SimulationRunView.vue`；
- `/report/:reportId` → `ReportView.vue`；
- `/interaction/:reportId` → `InteractionView.vue`。

所有路由继续由根级 `AscShell` 包裹。工作流路由通过 `meta.navigationPath` 映射侧栏高亮，不增加第二套侧栏。

## 入口连接

### 文献管理

保留表格、详情、上传、预览、下载和删除。复用现有复选框外观支持多选，顶部增加同风格“使用选中文献构建图谱”按钮。点击后把后端返回的真实 `file_id` 写入 `pendingUpload.pdfLibraryFileIds`，再跳转 `/process/new`。

### 知识图谱入口

“进入知识图谱”不调用网络，直接跳转 `/process/new`。删除不存在于后端的 `/api/graph/launch` 封装和相关重定向逻辑。

### 问答首页

项目与图谱 ID 只来自 `GET /api/graph/project/list`。删除 `VITE_DEFAULT_GRAPH_ID`、合成 `configured:*` 项目 ID 和正式页面中的回答预览入口。没有图谱时保留现有提示区域，提供“去构建知识图谱”并跳转 `/process/new`。真实 CoD 回答、引用、Judge 和 Feedback 继续沿用现有实现。

## API 封装边界

补齐后端已存在但当前 API 文件缺少的封装：

- 图谱关系编辑、项目重置/删除、远端图谱删除；
- 报告章节、下载地址；
- simulation 单个、批量和全部 Interview。

不在组件里创建 Axios 实例，不增加后端不存在的路径。

## 资源 ID

`file_id`、`project_id`、`graph_id`、`simulation_id`、`report_id`、`task_id`、`qa_run_id` 全部由后端响应或路由恢复。前端只保存、选择和传递，不生成业务 ID，不猜测最新资源。

## 验证

- 路由契约测试覆盖新入口与五步页面；
- 文献选择模型测试覆盖真实 `file_id` 传递；
- API 契约测试覆盖路径、方法和 snake_case；
- 全量运行 `node --test tests/*.test.js`；
- 运行 `npm run build`；
- 后端未运行时验证路由页面仍能显示局部错误状态，不破坏外壳。

## 明确不做

- 不修改后端；
- 不解析 PDF DOI、作者或发表年份；
- 不实现后端没有的 `/api/graph/launch`；
- 不重写旧五步组件的视觉设计；
- 不把演示数据当成真实业务数据。
