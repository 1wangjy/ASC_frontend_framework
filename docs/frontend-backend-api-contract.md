# 前端—后端 API 对接表

更新时间：2026-08-04

本文以当前 `frontend/src/api` 和当前 `backend/app/api` 为准，不再以旧版 `TECH_README.md` 的页面路由为准。

## 先看结论

- 新版问答页 `/` 已接入项目列表、CoD GraphRAG 问答、人工反馈和 LLM Judge。
- 新版文献页 `/documents` 已接入 PDF 列表、上传、预览、下载和删除。
- 新版图谱浏览页 `/knowledge/explorer` 已接入项目列表和图谱数据。
- 图谱入口页 `/knowledge` 仍调用 `POST /api/graph/launch`，但当前后端没有这个路由，因此该入口仍会提示失败；这是已知的后端待办，本次按约定没有伪造或绕过。
- `/data`、`/models` 目前仍是说明页面，后端没有与这两个新版页面一一对应的专用业务接口。

## 通用约定

| 项目 | 当前约定 |
|---|---|
| 后端地址 | `VITE_API_BASE_URL`；未配置时为 `http://127.0.0.1:5001` |
| HTTP 客户端 | `src/api/index.js` 中唯一 Axios 实例 |
| 本地用户 | Axios 请求自动发送 `X-NEXUS-USER`；默认 `local-asc-analyst` |
| PDF 预览/下载 | 浏览器新窗口不能经过 Axios 拦截器，因此 URL 使用 `?user=<用户ID>`；后端同时支持该查询参数 |
| 当前项目 | 浏览器只在 `localStorage` 保存 `nexus_active_project_id`，不缓存后端项目或图谱数据 |
| CoD 查询范围 | 必须明确发送 `project_id` 或 `graph_id`；新版页面同时发送两者，不使用“自动取最新图谱” |

状态含义：

- **已对齐并接入新版页面**：当前六个新版路由中的页面正在调用。
- **已对齐但仅旧页面使用**：接口与后端一致，但只有仓库中未启用的旧流程页面在调用。
- **已对齐但当前未调用**：前端封装和后端路由一致，但当前没有页面调用。
- **前后端方法已修正**：本次已修正旧的请求方法或参数。
- **后端待实现**：前端存在调用，但当前后端没有对应路由。

## 知识图谱与 GraphRAG

后端实现位置：`backend/app/api/graph.py`、`backend/app/api/graphrag.py`。

| 方法与路径 | 前端函数 | 对应功能 | 当前状态 | 重要参数或限制 |
|---|---|---|---|---|
| `POST /api/graph/launch` | `launchKnowledgeGraph` | 从新版图谱入口进入图谱页面 | **后端待实现** | 当前 Flask 路由不存在，实际返回 404；本次未修改 |
| `POST /api/graph/ontology/prepare` | `prepareOntologyProject` | 预创建本体生成项目 | 已对齐但仅旧页面使用 | 旧 `MainView` 使用 |
| `POST /api/graph/ontology/generate` | `generateOntology` | 上传文件并生成本体 | 已对齐但仅旧页面使用 | `multipart/form-data`；会调用 LLM |
| `POST /api/graph/build` | `buildGraph` | 根据项目构建知识图谱 | 已对齐但仅旧页面使用 | 长任务；需要项目参数及外部服务配置 |
| `GET /api/graph/base-metadata` | `listBaseMetadata` | 列出 Base 元数据 | 已对齐但当前未调用 | 返回可导入的 `base_*.json` 元数据 |
| `POST /api/graph/base-metadata/import` | `importBaseMetadata` | 导入 Base Node 元数据 | 已对齐但仅旧页面使用 | `multipart/form-data` |
| `PATCH /api/graph/project/:projectId/metadata/node/:nodeId` | `updateGraphNodeMetadata` | 编辑节点名称、类型、摘要和权重 | 已对齐但仅旧页面使用 | 节点 ID 会 URL 编码 |
| `GET /api/graph/task/:taskId` | `getTaskStatus` | 查询图谱长任务状态 | 已对齐但仅旧页面使用 | 用于旧构建流程轮询 |
| `GET /api/graph/data/:graphId` | `getGraphData` | 获取节点和关系 | **已对齐并接入新版页面** | `/knowledge/explorer` 使用；前端会补坐标并过滤悬空关系 |
| `GET /api/graph/project/:projectId` | `getProject` | 获取单个项目详情 | 已对齐但仅旧页面使用 | 多个旧流程页面使用 |
| `GET /api/graph/project/list` | `listProjects` | 获取当前用户的项目列表 | **已对齐并接入新版页面** | `/` 与 `/knowledge/explorer` 共用；只选择有 `graph_id` 的项目 |
| `POST /api/graphrag/cod-query` | `codGraphRAGQuery` | 基于指定图谱进行 CoD GraphRAG 问答 | **已对齐并接入新版页面** | 新版问答发送 `question`、`project_id`、`graph_id`、`reasoning_mode`；可能调用 LLM/Zep |
| `POST /api/graphrag/feedback` | `submitQAFeedback` | 保存人工或 LLM 评价到 Feedback Memory | **已对齐并接入新版页面** | 后端强制要求四个 1–5 分字段；新版人工二选一评价已映射为有效分数 |
| `POST /api/graphrag/judge` | `judgeQAWithLLM` | 使用 LLM Judge 评价当前回答 | **已对齐并接入新版页面** | 发送真实 `qa_run_id`、问题、答案和原始 QA 结果；会调用 LLM |
| `GET /api/graphrag/feedback/dataset` | `getQAFeedbackDataset` | 导出反馈记忆数据集 | 已对齐但当前未调用 | 可传 `limit`、`quality_band` |

## PDF 文献库

后端实现位置：`backend/app/api/pdf_library.py`。

| 方法与路径 | 前端函数 | 对应功能 | 当前状态 | 重要参数或限制 |
|---|---|---|---|---|
| `GET /api/pdf-library/files` | `listPdfFiles` | 拉取当前用户 PDF 列表 | **已对齐并接入新版页面** | `/documents` 打开时调用；支持 `search`、`category`、排序参数 |
| `POST /api/pdf-library/files` | `uploadPdfFiles` | 上传一个或多个 PDF | **已对齐并接入新版页面** | 每个文件以 `files` 字段上传；可带 `category`、`description` |
| `GET /api/pdf-library/files/:fileId/preview` | `getPdfPreviewUrl` | 浏览器在线预览 PDF | **已对齐并接入新版页面** | 新窗口使用 `?user=` 传本地用户 |
| `GET /api/pdf-library/files/:fileId/download` | `getPdfDownloadUrl` | 下载原始 PDF | **已对齐并接入新版页面** | 新窗口使用 `?user=` 传本地用户 |
| `DELETE /api/pdf-library/files/:fileId` | `deletePdfFile` | 删除当前用户的 PDF | **已对齐并接入新版页面** | 页面先弹出不可撤销确认框 |

当前后端 PDF 记录只有文件级元数据，例如文件名、分类、说明、大小和上传时间，没有论文标题、作者、DOI、期刊、摘要解析结果等学术元数据。因此新版文献表会如实显示文件信息，不会再填入静态论文数据。DOI 导入和 BibTeX/CSV 批量导入也没有后端接口，页面按钮已禁用并标记“待后端”。

## 报告

后端实现位置：`backend/app/api/report.py`。当前新版六个路由没有报告工作流，以下接口主要供仓库中的旧流程组件使用。

| 方法与路径 | 前端函数 | 对应功能 | 当前状态 | 重要参数或限制 |
|---|---|---|---|---|
| `POST /api/report/generate` | `generateReport` | 启动报告生成 | 已对齐但仅旧页面使用 | 发送 `simulation_id`；可能调用 LLM |
| `POST /api/report/generate/status` | `getReportStatus` | 按任务或模拟 ID 查询报告生成状态 | **前后端方法已修正** | 本次从错误的 GET + `report_id` 改为 POST JSON；发送 `task_id` 或 `simulation_id` |
| `GET /api/report/:reportId/agent-log` | `getAgentLog` | 增量读取 Agent 日志 | 已对齐但仅旧页面使用 | 查询参数 `from_line` |
| `GET /api/report/:reportId/console-log` | `getConsoleLog` | 增量读取控制台日志 | 已对齐但仅旧页面使用 | 查询参数 `from_line` |
| `GET /api/report/:reportId` | `getReport` | 获取报告详情 | 已对齐但仅旧页面使用 | 旧报告与交互页面使用 |
| `POST /api/report/chat` | `chatWithReport` | 与 Report Agent 对话 | 已对齐但仅旧页面使用 | 发送 `simulation_id`、`message`、可选历史；会调用 LLM |

## Simulation / 旧分析工作台

后端实现位置：`backend/app/api/simulation.py`。这些接口都能在当前后端找到，但当前新版 `/data` 与 `/models` 没有接入旧 Simulation 页面。

| 方法与路径 | 前端函数 | 对应功能 | 当前状态 | 重要参数或限制 |
|---|---|---|---|---|
| `POST /api/simulation/create` | `createSimulation` | 创建分析工作台实例 | 已对齐但仅旧页面使用 | 发送 `project_id`、可选 `graph_id` |
| `POST /api/simulation/prepare` | `prepareSimulation` | 异步准备分析环境 | 已对齐但仅旧页面使用 | 可能生成画像并调用 LLM |
| `POST /api/simulation/prepare/status` | `getPrepareStatus` | 查询准备任务状态 | 已对齐但仅旧页面使用 | JSON 中发送 `task_id` 或 `simulation_id` |
| `GET /api/simulation/:simulationId` | `getSimulation` | 获取分析实例详情 | 已对齐但仅旧页面使用 | — |
| `GET /api/simulation/:simulationId/profiles` | `getSimulationProfiles` | 获取已生成 Agent 画像 | 已对齐但当前未调用 | 查询参数 `platform` |
| `GET /api/simulation/:simulationId/profiles/realtime` | `getSimulationProfilesRealtime` | 实时读取生成中的 Agent 画像 | 已对齐但仅旧页面使用 | 查询参数 `platform` |
| `GET /api/simulation/:simulationId/config` | `getSimulationConfig` | 获取分析环境配置 | 已对齐但仅旧页面使用 | — |
| `GET /api/simulation/:simulationId/config/realtime` | `getSimulationConfigRealtime` | 实时读取生成中的配置 | 已对齐但仅旧页面使用 | — |
| `GET /api/simulation/list` | `listSimulations` | 列出分析实例 | 已对齐但当前未调用 | 可按 `project_id` 筛选 |
| `POST /api/simulation/start` | `startSimulation` | 启动模拟运行 | 已对齐但仅旧页面使用 | 发送 `simulation_id`、轮数等 |
| `POST /api/simulation/stop` | `stopSimulation` | 停止模拟运行 | 已对齐但仅旧页面使用 | 发送 `simulation_id` |
| `GET /api/simulation/:simulationId/run-status` | `getRunStatus` | 获取简要运行状态 | 已对齐但仅旧页面使用 | — |
| `GET /api/simulation/:simulationId/run-status/detail` | `getRunStatusDetail` | 获取运行状态和最近动作 | 已对齐但仅旧页面使用 | — |
| `GET /api/simulation/:simulationId/posts` | `getSimulationPosts` | 获取模拟帖子 | 已对齐但当前未调用 | `platform`、`limit`、`offset` |
| `GET /api/simulation/:simulationId/timeline` | `getSimulationTimeline` | 按轮次获取时间线 | 已对齐但当前未调用 | `start_round`、可选 `end_round` |
| `GET /api/simulation/:simulationId/agent-stats` | `getAgentStats` | 获取 Agent 统计 | 已对齐但当前未调用 | — |
| `GET /api/simulation/:simulationId/actions` | `getSimulationActions` | 获取动作历史 | 已对齐但当前未调用 | 支持分页、平台、Agent、轮次筛选 |
| `POST /api/simulation/close-env` | `closeSimulationEnv` | 优雅关闭模拟环境 | 已对齐但仅旧页面使用 | 发送 `simulation_id`、可选超时 |
| `POST /api/simulation/env-status` | `getEnvStatus` | 查询模拟环境进程状态 | 已对齐但仅旧页面使用 | 发送 `simulation_id` |
| `POST /api/simulation/interview/batch` | `interviewAgents` | 批量采访 Agent | 已对齐但仅旧页面使用 | 发送采访数组；可能调用 LLM |
| `GET /api/simulation/history` | `getSimulationHistory` | 获取持久化分析历史 | 已对齐但仅旧页面使用 | 查询参数 `limit` |

## 新版页面实际请求顺序

### 问答页 `/`

1. `GET /api/graph/project/list`
2. 选择带 `graph_id` 的项目，并只在浏览器记住 `project_id`
3. `POST /api/graphrag/cod-query`
4. 可选：`POST /api/graphrag/judge`
5. 可选：`POST /api/graphrag/feedback`

### 文献页 `/documents`

1. `GET /api/pdf-library/files`
2. 上传时：`POST /api/pdf-library/files`，成功后重新 GET
3. 预览或下载时：打开对应 GET URL
4. 删除时：确认后 `DELETE /api/pdf-library/files/:fileId`，成功后重新 GET

### 图谱浏览页 `/knowledge/explorer`

1. `GET /api/graph/project/list`
2. 选择带 `graph_id` 的项目
3. `GET /api/graph/data/:graphId`
