# agent 模块（多轮对话 Agent）— 边界、协议、可插拔、与 pi 的融合

## 当前开发要求（2026-10-08）

2026-10-09 工具测试更新：已盘点 9 个注册工具，选定离线回归 52 项通过；固定工具验收 11 项通过、1 项预测服务待验收，明确区分真实 API、本地片段/历史读取与拒绝检查。知识/文献检索单次 103.951/41.737 秒，服务答案及 16 条引用原样保留。3 页 PPT、原始返回与逐项结果见 [TOOL-TEST-RESULTS.md](./TOOL-TEST-RESULTS.md)。本轮未做回答质量优化，未宣称所有工具已完成真实部署。

**最新口径覆盖下文历史草稿阶段（2026-10-10 修正）**：暂不改进答案可靠性。默认 `AGENT_ANSWER_MODE=knowledge_service`，Agent 负责选择工具、历史与追问条件；`kg_search` 返回答案后仍观察工具结果、按需继续调用，不立即结束，不强制调用全部工具。结束时原样发布保留的服务答案与引用，不让模型改写草稿。旧草稿门禁作为 `evidence_draft` 运维回退保留；质量对照实验暂停。范围/权限/预算/超时仍启用。真实验证及兼容边界见 [SERVICE-ANSWER-INTEGRATION.md](./SERVICE-ANSWER-INTEGRATION.md)。

最新交付以 `D:/shixi/中关村学院/ASC-Agent实施方案（Git基线版）.md` 第 1–5 节为准，第 6 节提供详细记录索引：①重点工具测试与 2–3 页 PPT；②两个 Tab UI、流式执行块、模型/本地配置与历史管理入口；③配合李铭豪联调知识 API 等待状态和速度；④确认 CoT/ToT 决策、可用 subagent 状态/公开摘要并测试多模态。各项完成状态以主文档为准，旧测试日志和待办仅供回查。前端仅按这些任务的必要文件实施。

用户后续将开发范围扩大为整个 `backend_impl/`。Agent 核心继续在 `src/agent/`，可按需修改同一后端的配置、服务、存储及 `test/`，详细修改边界见同目录 `AGENTS.md`。

实施目标：按新 Git 基线实施方案，将当前 Git 项目已有知识检索封装为工具，由主 Agent 驱动现有“智能会话”（`/research?mode=multi`）；保留已有工具，通过 API 使用知识图谱，补多轮条件状态、历史检索和证据校验，并在 `provider.js` 接入微调模型。主输入已默认接 Agent，兼容入口保留原知识对话；浏览器完整验收尚未完成，独立 Beta 可用不能代替主入口验收。

当前保留 Git 基线 7 个工具，新增 `search_history` 与 `read_evidence`，共 9 个工具；知识图谱继续经 API 访问，不迁移本地图谱文件。带 `sessionId` 的 stream 从服务端恢复历史、维护多轮条件。已增加 API 返回片段登记与引用完整性关卡；整篇原文读取、逐结论支持度核验仍待补齐。

微调模型接入需要推理 API 地址、实际模型名称、鉴权方式，以及 OpenAI 兼容的 `tools/tool_calls` 和 SSE。适配器已支持 `AGENT_LLM_API_URL`、`AGENT_LLM_API_KEY`、`AGENT_LLM_AUTH_MODE` 和 `AGENT_LLM_MODEL`，保留原 LLM 配置回退；额外模型通过 `AGENT_MODELS_FILE` 服务端允许列表选择。已有权重目录不等于已有推理 API；本地微调尚未部署验收。

最新验证：100 项后端 Agent 回归、78 项前端 Agent 回归通过，普通前端回归另有 2 项真实服务测试默认跳过；构建通过。新增可见执行状态卡、历史深链接与输入框裁切修复；动态提示剩余额度，耗尽后移除对应工具 schema，保留原硬限制。预算拒绝单独展示并在新历史记录保存；旧记录不改写。历史范围守卫后两轮档案 `primary-composer-1791444270547.json` 为首问 incomplete、追问待核验草稿，不能当作两轮科研问答成功；预算优化后另行真实复测。两个云端模型短连接详情见 `MODEL-INTEGRATION.md`；实际耗时、复测档案、全仓遗留差异及浏览器验收边界见 `UI-INTEGRATION.md`。

基线检查：2026-10-08 安装后端依赖后，原有 49 项测试通过 48 项；唯一失败为 Windows 不支持 POSIX 0600 权限位检查。该断言现仅在支持 POSIX 的平台执行，Windows ACL 需独立配置。增加多轮状态与历史工具后，67 项 Agent 离线测试全部通过（新增 18 项）；包括本地 HTTP/SSE 连续追问和模拟模型工具循环，不代表真实模型或知识图谱服务已联调。真实完成率、耗时、token 与成本待实测，不使用旧 Python 项目指标。

预算优化后的实际组件＋真实 API 两轮已完成：档案 `primary-composer-1791447147987.json`，耗时 140631/182512 ms，工具请求 5/4 次，预算拒绝和其他工具失败均为 0，两轮仍为支持度未核验草稿。只读历史恢复通过；进程记录 48450 token，不包含知识服务内部用量与费用。一次样本不能证明稳定完成率、检索提速或成本下降，详细边界见 `UI-INTEGRATION.md`。

依赖初次安装使用 `npm ci --ignore-scripts --no-audit --no-fund --cache D:/shixi/中关村学院/.npm-cache`，依赖在本后端 `node_modules/`。当时跳过原生脚本仅用于独立 Agent 测试；后续已补齐本机 sqlite3/bcrypt 并启动完整平台验证登录，见 `UI-INTEGRATION.md`。新环境不能只凭 ignore-scripts 安装就认为平台原生模块可用。

### 第一阶段：多轮状态与历史检索（2026-10-08）

- `conversation.js`：读取已保存的当前主题历史，最多向模型传入 39 条历史消息和本轮问题；客户端重复发送完整历史不会被重复保存，也不会覆盖后端历史。
- 温度和气氛以用户原话保存，并处理明确的修改/取消。不是通用科学条件解析器；比较、范围、否定不能直接当作一个数值。各字段原话只用于该维度，其他维度以最新修改为准。
- `context.resetTopic: true` 或明确“换个话题”等表述清空本轮旧主题上下文与条件，不删除已保存消息。更换项目/图谱同时重置讨论，避免旧范围残留。
- `researchState` 随每轮消息保存；`GET /api/agent/sessions/:id` 可查看该字段。断线恢复继续沿用原 SSE 协议。
- `search_history {query, limit?}`：当前会话、当前主题的关键词检索，默认 5 条、最多 10 条、每条最多 1000 字。工具不接受其他会话 ID，不直接访问文件。返回 `untrusted: true`、`usableAsEvidence: false`；历史回答不能当作科学证据。
- 旧会话兼容读取，条件仅从旧用户消息重建，不从模型回答提取；不带 `sessionId` 的旧请求继续使用客户端消息，但无法检索持久化历史。
- 限制：关键词检索不是语义检索；隐含主题变化、复杂条件仍需后续适配。现有会话路由尚无用户归属鉴权，这一阶段未解决多用户隔离，不能用于开放多用户部署。

验收命令：在 `backend_impl/` 执行 `node --test test/agent*.test.js`。
下一阶段的证据工作见下节；之后再接微调模型和现有智能会话入口。

### 第二阶段：API 证据登记与引用完整性检查（2026-10-08）

数据流：`kg_search/rag_search → references → 本轮 EvidenceStore → read_evidence → 草稿引用检查 → final/会话保存`。

- `evidence.js` 为 API 返回的片段建立内容和范围敏感的稳定 ID。保存来源、页码/片段 ID、原始片段、请求范围、取得接口与 qa_run_id。来源文档版本缺失时保留 null；片段 hash 不冒充文档版本。
- 原文只取 API `references.original_quote` 或 `evidence_chunk.text`；`final_answer`、路径概括、历史回答不登记为原文。现有生成答案与引用摘要仍保留，但明确属于 API 的生成结果/报告信息。
- `read_evidence {evidence_id}` 读取当前轮登记的完整返回片段，不能凭路径或 URL 读取任意文件，不能读取其他轮的 ID。未接入整篇文献接口；通过本地知识服务代码核对了字段契约，当前部署的真实 API 响应仍待联调。
- 片段完整保存，单条最多 8000 字、每轮最多 20 条/60000 字。超限片段明确从登记结果省略，并通过 `omitted_references` 报告；不截断后伪称完整原文。模型摘要可截断，完整片段留在会话的 assistant.evidence 中。
- 若 API 携带可识别的 synthetic_bridge/not_source_fact/requires_human_calibration 或 unsupported 复核标记，标为不可引用；缺少这些标记不意味着关系正确。项目/图谱不符同样不可引用。
- 格式 `[ev_实际返回的24位十六进制ID]`。发生知识检索后，最终草稿缺少本轮引用、引用虚构/不合范围/不可引用时，正文替换成明确的证据不足提示。引用合格也仅发布为“待核验草稿”，`semantic_support_verified:false`。
- final 新增 `citations`、`answer_check`；会话保存同一检查结果、引用与完整 API 片段，方便复查。默认已有事件类型保持不变。
- 为避免先泄漏后拦截，message_delta 先在服务端缓冲，检查后发送正文；推理/工具/心跳事件仍持续发送。每次模型响应的正文上限 12000 字；超限安全结束。前端尚未实现独立“校验中”提示。
- 未发生知识检索且未引用证据 ID 的普通会话标为 `not_checked`，不声称已验证。预测、优化和网页结果未纳入本阶段科学引用关卡。引用存在不证明结论受支持，也未实现逐结论条件对齐、因果检查或模型辅助核验。

验收：新增 `test/agentEvidence.test.js` 17 项离线测试；总计 84 项 Agent 测试全部通过。包括本地 HTTP/SSE 的检索、按 ID 读取、回答检查与持久化闭环；知识服务和模型均为模拟，真实效果/成本待实测。

执行顺序：必要接口检查 → 一个真实问题＋一次追问的 Agent 后端闭环 → 两个 Tab UI 与管理入口 → CoT/ToT 确认与多模态验收 → 系统效果评测和 2–3 页 PPT。开发中持续做模块回归；完整链路可用后再做批量效果评测。支持度与条件核验随实际失败完善；协作事项未确认前不移除模式控件。

### 独立 Agent 本地联调入口

`src/agent/server.js`、`scripts/start-agent.js` 提供只挂载 Agent 路由的本机联调服务，绑定 `127.0.0.1`，默认端口 3001。可先验证 Agent，不依赖平台 sqlite3/bcrypt 原生模块；它不替代 `src/index.js` 的全平台启动入口。

配置优先级：显式 provider 参数 → `AGENT_LLM_API_URL/AGENT_LLM_API_KEY/AGENT_LLM_MODEL` → 兼容的 `LLM_API_URL/LLM_API_KEY`，并兼容已有记录里的 `LLM_BASE_URL/LLM_MODEL_NAME`。`AGENT_ENV_FILE` 可指定现有本地配置文件，无需复制密钥。`AGENT_LLM_AUTH_MODE=none` 显式支持无鉴权本地端点；默认 bearer。新增 `AGENT_LLM_MAX_TOKENS`，默认 2048，最大 8192，覆盖流式与非流式请求。

在 `backend_impl/` 执行 `node scripts/start-agent.js`，健康检查为 `GET /api/agent/health`，仅返回配置状态、模型名和输出预算。`.env.example` 已列出新增配置，密钥只填本地配置。

`scripts/agent-smoke.js` 调用实际 `/api/agent/stream`，创建一个会话并连续提问两次。必须明确配置 `AGENT_SMOKE_PROJECT_ID` 或 `AGENT_SMOKE_GRAPH_ID`，并核对图谱目录；不自动选首个项目。`--check-only` 只做配置/目录检查，不发模型请求。结果保存到 `data/agent/integration/`；带合法引用的完成标为 `draft_chain_completed_support_unverified`，不当作科学支持度已验证。

当前机器已找到 `D:/shixi/中关村学院/AI4Sci-NEXUS-ASC-Development-Domain-backup/.env` 的既有模型配置、知识服务虚拟环境与运行项目副本。本轮通过 API 确认范围 `proj_65ac6094e268 / nexus_2bdcb8bbccb04ea5`；新 Agent 仍通过 API 使用知识，不读取该服务图谱文件。该本机服务不代表已经对接李铭豪的新部署或微调模型。

新增配置/鉴权/启动、大检索结果可读性、检索预算及收尾/截断回归后，94 项 Agent 离线测试通过。真实链路结果以 integration 目录实际档案为准，详见 [真实联调记录](./INTEGRATION.md)。

最后一步预留为无工具收尾，工具预算用尽后也仅允许整理已有结果，不增加工具配额。上游 `finish_reason:length` 或无工具阶段仍要求工具时标为 incomplete，不发布为已完成草稿。

修复后同一真实问题＋追问已通过后端链路联调：首问 194714 ms、追问 211938 ms，两轮引用完整性通过并保存研究条件。档案 `data/agent/integration/smoke-1791437515380.json`；仅是待核验草稿完成，原文支持度和最终前端入口尚未验收。Agent 进程记录 74621 token，不包含知识服务内部调用或完整费用。

前端主入口已接线：`/research?mode=multi` 默认嵌入 Agent，传入项目/图谱范围；原知识对话保留为兼容入口，深度研究原流程保留。增加检查状态、引用片段及历史恢复展示。65 项前端 Agent 测试通过；真实服务历史回看测试另行显式执行通过；构建通过，浏览器视觉与新提问交互仍待验收。详见 [前端联调记录](./UI-INTEGRATION.md)。

需要网页登录时使用完整平台入口 `npm start`，不要用不含登录路由的 `agent:start` 替代。当前已安装 sqlite3 原生依赖、首次初始化本机 SQLite 并接通原登录。完整平台同样加载现有配置引用，默认只绑定 127.0.0.1；与独立 Agent 入口不能同时占用 3001。完整入口健康检查 `/health`。

本机 `.env` 已保存上述既有配置文件的引用路径、知识 API 和经 API 确认的测试范围；未复制密钥。启动脚本先加载本后端配置，再加载引用文件，已有显式配置优先。`AGENT_MAX_RETRIEVAL_CALLS` 默认每轮 2 次（服务端允许 1–4），避免长时间检索占满整轮预算；超过上限时返回已取得的证据 ID，供模型读取并组织回答。工具目录预览最多 5 条、路径与生成摘要限幅，完整片段仍留在 EvidenceStore；超出模型上下文的兜底也保持合法 JSON 并注明截断。

模块位置：`backend_impl/src/agent/**`（后端） + `src/platform/agent/**`（前端独立组件）。
挂载：`backend_impl/src/index.js` 一行 `app.use('/api/agent', agentRoutes.router)`（删除即摘除）。
**权限硬约束**：deny-by-default 工具白名单；**不存在** file/shell/db 工具；agent **不能**读取
`./private`、`backend_impl/data`、sqlite、`_code`、`.env`。私有数据仅经**标准 API**受控暴露。

## 1. 后端模块
| 文件 | 职责 |
|---|---|
| `loop.js` | agent loop：system prompt + 消息 → LLM → `tool_calls` → 执行 → 观察 → 继续；产出事件帧；含 step/tool/optimize 配额与 turn 超时 |
| `provider.js` | **可替换** LLM 适配（OpenAI 兼容 chat/completions，支持 tools/流式/usage） |
| `policy.js` | 白名单解析、参数 schema（JSON-Schema-lite）校验、私有主机/IP 与 web 域名守卫、审计行、配额裁决 |
| `audit.js` | 工具调用 NDJSON 落盘（`${AGENT_AUDIT_DIR||backend_impl/data/agent}/audit-YYYY-MM-DD.jsonl`，0600，仅摘要） |
| `route.js` | `GET /api/agent/tools`、`POST /api/agent/stream`（SSE）、会话 CRUD、`GET /api/agent/metrics` |
| `tools/` | 工具注册表（见 §3） |

## 2. 事件协议（SSE over POST /api/agent/stream）
请求体：`{ messages:[{role,content}], modelId?, sessionId?, resumeFromEventId?, context?:{projectId?,graphId?}, options?:{maxSteps?,allowTools?,maxTools?,maxOptimize?,webAllowlist?} }`
帧（每帧先 `id: <seq>`，后 `data: <json>`；另有 `: ping` 心跳，≥15s 一次）：
```
{"type":"message_delta","text":"..."}                 // 流式正文
{"type":"tool_call","id":"call_1","name":"predict","args":{...}}
{"type":"tool_result","id":"call_1","name":"predict","ok":true,"summary":"...","data":{...}}
{"type":"final","text":"..."}                         // 终稿
{"type":"error","message":"...","code":"turn_timeout"?}
{"type":"done","steps":N,"sessionId"?:...,"turnIndex"?:N}
```
其它端点：`GET /api/agent/tools`、`GET /api/agent/models`、会话 CRUD（§4）、`GET /api/agent/metrics`（§5）。模型事件 `model_selected {modelId, model}` 返回本轮实际选择，配置与本地部署边界见 `MODEL-INTEGRATION.md`。
中断：客户端 `AbortController`（前端“停止”）；服务端 `req.on('close')` 即终止本轮。

## 3. 工具契约（可插拔）
每个工具模块导出：`{ name, description, parameters(JSON Schema), validate(rawArgs)->internal, execute(args, ctx)->{ok,summary,data} }`。
注册：`tools/index.js` 明列（顺序即“目录顺序”）；`ctx` 含 `{ projectId, graphId, webAllowlist, signal, sessionId, allowed }`。
现有工具（7）：`kg_list`（发现图谱）、`kg_graph`（按 graph 读节点/关系，限幅）、`kg_search`（GraphRAG 问答，只读）、`rag_search`（同源检索式证据）、`predict`（标准 API `/api/v1/predict/simple`）、`recipe_optimize`（标准 API `/api/model2/optimize`，预算封顶）、`web_browse`（域名白名单/https/禁内网/不可信内容标记）。
新增工具：加一个 `tools/xxx.js` + 在 `tools/index.js` 注册（并加测试）。**禁止**在此注册 file/shell/db 类工具（有回归测试守护）。

## 4. 会话（T3）
`POST /api/agent/sessions {title?}` → `{sessionId,...}`；`GET /api/agent/sessions?limit=`；`GET /api/agent/sessions/:id`；`DELETE /api/agent/sessions/:id`。
存储：`${AGENT_SESSION_DIR||backend_impl/data/agent/sessions}/<id>.json`（原子写 tmp+rename；失败仅告警）。`stream` 带 `sessionId` 即把该轮追加到会话。

## 5. 可观测性（T9）
`GET /api/agent/metrics` → `{turns, toolCalls, toolErrors, tokens:{prompt,completion,total}, avgTurnMs, tools:{<name>:{calls,errors,avgMs}}}`。
tokens 取上游 `usage`（缺失则 0 并注明）。审计 NDJSON 提供逐调用细节。

## 6. 与 pi（earendil-works/pi）的融合路径（T10）
pi 包：`ai`(统一多 provider) · `agent`(loop+工具调用+状态) · `coding-agent`(CLI) · `protocol`/`server`/`client` · `telemetry` · `chord`。
映射与迁移：
| 本模块 | pi 对应 | 融合方式 |
|---|---|---|
| `provider.js` | `packages/ai` | 保持本模块契约，内部可换 pi-ai；或反之把本 provider 注册为 pi provider |
| `loop.js` | `packages/agent` | 事件/步骤语义对齐（tool_call/result/state）；可替换为 pi agent-core 驱动 |
| `route.js`(SSE)/会话 | `packages/protocol` + `server`/`client` | 事件协议可平滑映射为 pi protocol 消息；会话存储可换 pi session-backends |
| `metrics.js` | `packages/telemetry` | 采用其 contract/schema（vendor-neutral）上报 |
**注意**：pi 明确**不含**内置权限系统（需容器化/沙箱）。本模块的权限模型（白名单/仅标准 API/私有数据隔离/审计/配额）**必须保留**，迁移到 pi 时以外层策略包裹 pi 工具集。

## 7. 配置（.env）
`AGENT_LLM_MODEL=deepseek-flash` · `AGENT_KG_BASE_URL` · `AGENT_WEB_ALLOWLIST` · `AGENT_RECIPE_OPT_BASE_URL`/`_MAX_BUDGET`/`_MAX_CALLS` · `AGENT_AUDIT_DIR` · `AGENT_SESSION_DIR` · `AGENT_TURN_TIMEOUT_MS` · `AGENT_MAX_STEPS` · `PREDICT_BASE_URL`。

## 8. 测试
后端：`cd backend_impl && node --test test/agent*.test.js`（policy/私有数据不变量、web 守卫、kg_graph 限幅、审计配额、会话/指标/超时/续传）。
前端：`node --test tests/agent*.test.js`（SSE 解析、会话状态、工具授权映射、引用解析、指标格式化）。

## 9. 小规模评测试点（2026-10-08）

`node scripts/agent-evaluate.js` 从完整真实 API 归档中提取普通问题与条件追问，另运行空结果/服务不可用两个固定离线案例；不新增收费调用、不直接读取外部图谱、不修改生产会话。评测方法与5项结论/引用抽查见 `data/agent/evaluation/2026-10-08/评测说明.md`，结果为 `pilot-results.json`，3页汇报在同目录 `output/`。新增 `test/agentEvaluation.test.js` 3项，完整后端Agent回归103项通过。

引用完整性不等于语义支持，夹具安全结束不等于真实模型回答正确；本试点不统计科研正确率、有效回答率或费用。抽查发现机制外推、跨小节气氛误归属和未经实测的能力承诺，下一阶段固定原文、单因素修正并复测。该报告不替代所有重点工具充分实测、真实异常、领域专家复核、本地微调模型或多模态验收。

## 10. 固定证据的草稿对照

`node scripts/agent-draft-ab.js` 仅冻结已有API档案，不收费；加 `--live` 运行12次真实模型请求（两题×基准/候选×3次），无工具与自动重试，不改生产会话。候选 `draftBoundaries.js` 尚未接入正式loop.js；两组只改变system追加约束，原文、模型、temperature和输出预算相同。`draftReplay.js`处理固定输入和引用完整性，不能认证语义支持。

2026-10-08档案：`data/agent/evaluation/draft-ab-1791448864175/固定证据对照结果.md`。候选存在1次截断及新错误，未证明整体改善，暂不推广；逐份复核为开发复核而非领域专家金标准。新增3项回归，全部后端Agent回归106项通过，未修改前端或知识服务。
