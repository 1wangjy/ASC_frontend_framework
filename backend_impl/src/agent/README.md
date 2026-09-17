# agent 模块（多轮对话 Agent）— 边界、协议、可插拔、与 pi 的融合

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
请求体：`{ messages:[{role,content}], sessionId?, resumeFromEventId?, context?:{projectId?,graphId?}, options?:{maxSteps?,allowTools?,maxTools?,maxOptimize?,webAllowlist?} }`
帧（每帧先 `id: <seq>`，后 `data: <json>`；另有 `: ping` 心跳，≥15s 一次）：
```
{"type":"message_delta","text":"..."}                 // 流式正文
{"type":"tool_call","id":"call_1","name":"predict","args":{...}}
{"type":"tool_result","id":"call_1","name":"predict","ok":true,"summary":"...","data":{...}}
{"type":"final","text":"..."}                         // 终稿
{"type":"error","message":"...","code":"turn_timeout"?}
{"type":"done","steps":N,"sessionId"?:...,"turnIndex"?:N}
```
其它端点：`GET /api/agent/tools`、会话 CRUD（§4）、`GET /api/agent/metrics`（§5）。
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
