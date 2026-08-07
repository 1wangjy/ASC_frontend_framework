# NEXUS 前端—后端功能对接状态

更新时间：2026-08-05

## 1. 对接原则

- 本次只修改 `frontend`，没有修改 `backend`。
- 接口路径、HTTP 方法和必填参数以 `backend/app/api/*.py` 为第一依据，`TECH_README.md` 用于理解业务语义。
- 前端不再调用不存在的 `POST /api/graph/launch`。
- 前端不生成 `project_id`、`graph_id`、`simulation_id`、`report_id` 或 `task_id`；这些资源 ID 均由后端响应产生。
- 新界面和旧五步流程都继续位于 `AscShell` 内。新界面负责入口和日常操作，原五步页面负责完整的建图、分析、报告、互动流程。

## 2. 页面与真实工作流

| 页面/入口 | 当前行为 | 后端依据 | 状态 |
| --- | --- | --- | --- |
| `/documents` 文献管理 | 上传、列表、预览、下载、删除；可多选后端文件并进入建图 | PDF Library 五个接口；把真实 `file_id` 作为 `pdf_library_file_ids` 交给本体生成 | 已接入 |
| `/knowledge` 知识图谱 | “进入知识图谱”跳转 `/process/new` | 不再调用不存在的 `/api/graph/launch` | 已接入 |
| `/knowledge/explorer` 图谱浏览 | 读取后端项目列表，选择带 `graph_id` 的项目并加载图数据 | 项目列表、图谱数据 | 已接入 |
| `/` 研究问答 | 只接受后端返回的真实 `project_id + graph_id`；没有图谱时引导去建图 | 项目列表、CoD 查询、Judge、Feedback | 已接入 |
| `/process/:projectId` | 本体准备/生成、图谱构建、任务和图数据轮询 | Graph API | 已接入 |
| `/simulation/:simulationId` | 分析工作台准备 | Simulation API | 已接入 |
| `/simulation/:simulationId/start` | 启动/停止 ASC-OASIS、查看运行详情 | Simulation API | 已接入 |
| `/report/:reportId` | 显示生成日志，并使用 `generate` 返回的真实 `task_id` POST 查询状态 | Report API | 已接入 |
| `/interaction/:reportId` | 报告问答、图谱 CoD 问答、评价、批量采访 | Report、GraphRAG、Simulation API | 已接入 |
| `/data`、`/models` | 保留当前外观 | 当前后端没有与这两个新页面一一对应的独立管理契约 | 界面保留，待后端 |

## 3. 图谱与问答接口

| 方法与路径 | 前端功能 | 当前状态 |
| --- | --- | --- |
| `POST /api/graph/ontology/prepare` | 预创建项目，先取得真实 `project_id` | 页面已调用 |
| `POST /api/graph/ontology/generate` | 上传本地 PDF 或提交 PDF Library ID，生成本体 | 页面已调用 |
| `POST /api/graph/build` | 启动图谱后台构建并取得 `task_id` | 页面已调用 |
| `GET /api/graph/task/<task_id>` | 轮询建图任务状态 | 页面已调用 |
| `GET /api/graph/data/<graph_id>` | 构建预览和完整图谱显示 | 页面已调用 |
| `GET /api/graph/project/<project_id>` | 恢复项目及取得上下游 ID | 页面已调用 |
| `GET /api/graph/project/list` | 问答、图谱浏览的项目来源 | 页面已调用 |
| `GET /api/graph/base-metadata` | 列出可复用 Base 元数据 | API 已封装，当前界面无独立入口 |
| `POST /api/graph/base-metadata/import` | 导入 Base Node JSON | 页面已调用 |
| `PATCH /api/graph/project/<project_id>/metadata/node/<node_id>` | 编辑节点元数据 | 页面已调用 |
| `PATCH /api/graph/project/<project_id>/metadata/edge/<edge_id>` | 编辑关系元数据 | API 已封装，当前界面无编辑入口 |
| `POST /api/graph/project/<project_id>/reset` | 保留本体并重置图谱构建状态 | API 已封装，当前界面无按钮 |
| `DELETE /api/graph/project/<project_id>` | 删除本地项目 | API 已封装，当前界面无按钮 |
| `DELETE /api/graph/delete/<graph_id>` | 删除 Zep 图谱 | API 已封装，当前界面无按钮 |
| `POST /api/graphrag/cod-query` | 图谱路径级问答 | 页面已调用 |
| `POST /api/graphrag/judge` | LLM-as-Judge 自动评价 | 页面已调用 |
| `POST /api/graphrag/feedback` | 保存人工/自动评价 | 页面已调用 |
| `GET /api/graphrag/feedback/dataset` | 导出反馈数据集 | API 已封装，当前界面无导出入口 |

## 4. 分析工作台接口

| 方法与路径 | 前端功能 | 当前状态 |
| --- | --- | --- |
| `POST /api/simulation/create` | 从已完成图谱创建工作台并取得 `simulation_id` | 页面已调用 |
| `POST /api/simulation/prepare` | 启动分析模块和配置生成 | 页面已调用 |
| `POST /api/simulation/prepare/status` | 轮询准备任务 | 页面已调用 |
| `GET /api/simulation/<simulation_id>` | 读取工作台及上下游 ID | 页面已调用 |
| `GET /api/simulation/<simulation_id>/profiles` | 获取已生成分析模块 | API 已封装，实时版本为当前页面主要入口 |
| `GET /api/simulation/<simulation_id>/profiles/realtime` | 实时显示分析模块 | 页面已调用 |
| `GET /api/simulation/<simulation_id>/config` | 获取分析配置 | 页面已调用 |
| `GET /api/simulation/<simulation_id>/config/realtime` | 实时显示生成中的配置 | 页面已调用 |
| `GET /api/simulation/list` | 列出工作台 | API 已封装，当前界面使用 history 入口 |
| `POST /api/simulation/start` | 启动 ASC-OASIS | 页面已调用 |
| `POST /api/simulation/stop` | 强制停止 | 页面已调用 |
| `POST /api/simulation/close-env` | 优雅关闭环境 | 页面已调用 |
| `POST /api/simulation/env-status` | 查询环境状态 | 页面已调用 |
| `GET /api/simulation/<simulation_id>/run-status` | 查询轮次和完成状态 | 页面已调用 |
| `GET /api/simulation/<simulation_id>/run-status/detail` | 查询完整动作时间线 | 页面已调用 |
| `GET /api/simulation/<simulation_id>/posts` | 获取工作台帖子 | API 已封装，当前新流程主要使用动作详情 |
| `GET /api/simulation/<simulation_id>/timeline` | 获取轮次时间线 | API 已封装，当前新流程主要使用动作详情 |
| `GET /api/simulation/<simulation_id>/agent-stats` | Agent 统计 | API 已封装，当前界面无独立统计入口 |
| `GET /api/simulation/<simulation_id>/actions` | 动作分页查询 | API 已封装，当前页面使用 run-status/detail |
| `POST /api/simulation/interview` | 采访单个 Agent | API 已封装，当前界面无单人按钮 |
| `POST /api/simulation/interview/batch` | 采访选中的多个 Agent | 页面已调用 |
| `POST /api/simulation/interview/all` | 采访全部 Agent | API 已封装，当前界面无全员按钮 |
| `GET /api/simulation/history` | 首页历史项目、图谱、报告关系 | 页面已调用 |

## 5. 报告接口

| 方法与路径 | 前端功能 | 当前状态 |
| --- | --- | --- |
| `POST /api/report/generate` | 启动报告生成并取得真实 `report_id + task_id` | 页面已调用 |
| `POST /api/report/generate/status` | 使用 `task_id` 查询 `processing/completed/failed` | 页面已调用；方法已按后端改为 POST |
| `GET /api/report/<report_id>` | 加载报告对象和上下游关系 | 页面已调用 |
| `GET /api/report/<report_id>/sections` | 获取已生成章节 | API 已封装；当前报告页通过增量日志构建相同视图 |
| `GET /api/report/<report_id>/agent-log` | 增量显示 Agent 日志 | 页面已调用 |
| `GET /api/report/<report_id>/console-log` | 增量显示控制台日志 | 页面已调用 |
| `GET /api/report/<report_id>/download` | 下载 Markdown | API 已封装，当前界面无正式下载按钮 |
| `POST /api/report/chat` | 携带报告上下文对话 | 页面已调用 |

## 6. PDF Library 接口

| 方法与路径 | 前端功能 | 当前状态 |
| --- | --- | --- |
| `POST /api/pdf-library/files` | 上传一个或多个 PDF | 页面已调用 |
| `GET /api/pdf-library/files` | 按当前用户列出、搜索、排序文件 | 页面已调用 |
| `GET /api/pdf-library/files/<file_id>/preview` | 浏览器预览 | 页面已调用 |
| `GET /api/pdf-library/files/<file_id>/download` | 下载 PDF | 页面已调用 |
| `DELETE /api/pdf-library/files/<file_id>` | 删除当前用户文件 | 页面已调用 |

## 7. 当前必须与后端沟通的缺口

| 前端需求 | 当前后端情况 | 建议后端契约 |
| --- | --- | --- |
| 文献 DOI、作者、正式发表年份、文献栏目类型、前三个领域关键词自动解析并持久化 | PDF Library 当前只负责文件上传/列表/预览/下载/删除，没有元数据解析字段和任务接口 | 上传后创建解析任务；列表返回 `doi`、`authors`、`publication_year`、`document_type`、`keywords`、`metadata_status` |
| DOI、BibTeX、CSV 导入 | 没有对应接口 | 增加批量导入和导入状态接口 |
| `/data` 数据平台管理功能 | 没有与当前页面直接对应的契约 | 先定义数据集列表、详情、上传、版本、删除权限 |
| `/models` 模型管理功能 | 没有与当前页面直接对应的契约 | 先定义模型列表、配置、启停、调用记录 |
| 项目级多用户隔离 | 项目列表在 README 中明确为当前未做项目级租户过滤 | 后端按登录用户/组织过滤，并统一鉴权 |

## 8. 本地验证主路径

1. 登录/设置本地用户标识后，在 `/documents` 上传 PDF。
2. 选中文献，点击“使用选中文献构建图谱”。
3. 在 `/process/new` 完成本体生成与图谱构建；所有 ID 等待后端返回。
4. 创建并准备工作台，启动 ASC-OASIS。
5. 生成报告；前端携带 `task_id` 到报告页并 POST 查询状态。
6. 报告完成后进入互动页，执行 Report Chat、CoD 查询、评价或批量采访。

