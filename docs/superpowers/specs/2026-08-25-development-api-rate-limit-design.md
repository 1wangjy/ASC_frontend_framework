# 3001 开发环境 API 限流设计

## 目标

开发联调期间取消 3001 的全局 `/api/*` 请求次数限制，避免前端正常操作触发 `429 Too Many Requests`；生产环境继续保留现有的每 IP、15 分钟 100 次限制。

## 最小设计

- `backend_impl/src/index.js` 仅在 `NODE_ENV=production` 时挂载现有 `apiLimiter`。
- `NODE_ENV=development`（以及未设置该变量的本地启动）不挂载限流中间件。
- `backend_impl/.env.example` 明确说明：development 不限流，production 启用现有限流。
- 不修改任何业务路由、MongoDB、SQLite、前端或 5001 Python 服务。

## 验证

- 使用临时端口启动 `NODE_ENV=development` 的 3001，连续请求 `/api/*` 超过 100 次，确认不出现 429。
- 确认 `/health` 和至少一个现有业务接口仍可响应。
- 不干扰用户当前运行在 3001 的实例；完成后由用户正常重启该实例使配置生效。

