# 知识请求超时修正（2026-10-12）

## 原失败

会话 `1f7cdece-812c-4686-aa22-3c3df92e0199`：首次 kg_search 180025 ms 超时，重试 116838 ms 后被整轮 300000 ms 上限中断。相近时间的服务端 HTTP 200 没有请求关联标识，不能证明 Agent 收到了完整响应或有效答案。

本地档案位于 `backend_impl/data/agent/integration/timeout-recheck-20261012/`：`failure-session.json`、`failure.sse`、`failure-audit.jsonl`。未删除原会话。

## 修正

- 单次请求超时返回 `knowledge_tool_timeout`；父请求取消返回 `knowledge_request_cancelled`；连接/正文读取错误返回 `knowledge_transport_error`。整轮超时和用户停止仍分别为 `turn_timeout`、`turn_stopped`。
- 读取响应正文也纳入单次超时处理，避免 HTTP 200 后正文超时被误报为工具异常。
- 每次请求记录本端 UUID、起始时间、等待响应头耗时、正文读取耗时、HTTP 状态和服务返回的 qa_run_id；请求头发送 x-request-id，若上游返回该头则保存。上游是否记录该 ID 仍需确认。
- 首次知识超时后，本轮不再自动调用 kg_search/rag_search，包括同批后续请求；read_evidence、search_history 等仍按预算开放。
- 发生过检索后，以该次耗时加 10 秒结束预留估计下一次预算；剩余时间不足时移除知识检索工具，并在执行入口拒绝忽略限制的调用。该估计不保证下次检索耗时。
- Agent 自然结束时原样发布已保留服务答案；正常成功后的多工具循环保留。
- 工具摘要、错误分类和请求计时持久化，前端历史恢复保留这些字段。旧历史无法补出当时未记录的计时。

## 验证

- 超时、重试、原答案和计时针对性测试 17 项通过。
- 最终后端 Agent 顺序回归 135 项通过（包括新增 DeepSeek 续答协议测试）。首次并行执行时已有会话边界测试失败，单独复查及顺序回归均通过；保留这个测试波动记录。
- 前端会话模型及历史入口 13 项通过，生产构建通过；保留既有 d3/axios 混合导入警告。
- 真实复测由 `scripts/agent-timeout-recheck.js --live` 执行：首个检索参数固定为原失败的 query、graph_id、topK=8；后续由真实默认模型决策。此测试不经过页面或 HTTP Agent 路由，不能替代浏览器验收。
- 真实帧写入 `recheck.jsonl`，结果写入 `recheck-report.json`；仅一个样本，不能据此报告稳定完成率、提速或完整费用。

## 实际复测结果

- 固定参数知识请求仍在 180012 ms 达到单次超时；`phase=response_headers`、`headers_ms=null`，说明本端尚未收到响应头。知识请求只发送一次，未自动重试。服务内部慢在哪个阶段仍需上游日志定位。
- 后续续答首次出现 DeepSeek HTTP 400：当前 thinking/tool 协议要求传回 `reasoning_content`。loop 原先丢弃此字段，固定首工具脚本也缺少模型标识。已修正：DeepSeek 当前工具轮次传回模型实际返回的 reasoning，仅保留在本轮协议消息中。
- 使用已记录的超时结果做 `--model-replay`，无新增知识请求：真实默认模型续答约 3.4 秒结束，没有协议错误，也没有重试知识服务。首个工具决策为固定构造，不算完整真实 Agent 工具选择验收。
- 本次没有取得成文答案，因此答案完成率不能宣称改善；知识等待的根因尚未解决。原会话与审计已留档，进程重启后旧 SSE 缓冲不可恢复，failure.sse 不保证包含完整原轮次。
