# 数据平台附件联调设计

## 目标

在不改变既有双后端边界的前提下，跑通数据平台文献附件的上传、预览、删除和连接检查。

运行边界保持为：

- `3000`：Vue 统一前端。
- `5000`：Python 知识图谱、模拟、报告和问答后端，本任务不修改。
- `3001`：Node.js 数据平台后端。
- `27017`：MongoDB，供 `3001` 的 GridFS 附件存储使用。

## 当前根因

1. 当前电脑没有 `mongod` 命令、MongoDB Windows 服务或 `27017` 监听，因此附件控制器无法初始化 GridFS。
2. `backend_impl/package.json` 的启动命令引用 `scripts/start-mongo.js`、`scripts/stop-mongo.js` 和 `scripts/init-db.js`，但仓库没有 `backend_impl/scripts/` 目录。
3. `/api/attachment/upload` 的路由使用 `multer.diskStorage()`，控制器却读取 `req.file.buffer` 写入 GridFS，两端存储模式不一致。
4. `/api/attachment/test` 注册在 `/:filename` 后面，可能被动态文件名路由提前匹配。

## 设计

### MongoDB 环境

保留同事交付的 MongoDB/GridFS 架构，不替换为 SQLite 或本地磁盘附件实现。MongoDB 作为独立运行依赖启动在 `127.0.0.1:27017`，数据库名继续使用现有 `MONGODB_URI` 配置。

仓库不自动下载、安装或静默管理 MongoDB。若本机未安装，应由开发环境显式安装并启动；联调前应检测依赖和端口并给出明确结果，不把连接失败误报为可用。

### 附件请求链路

保持前端及接口契约不变：

- `POST /api/attachment/upload`：接收 `file` 和 `litId`，使用内存上传，将 `file.buffer` 写入 GridFS，再把最终文件名写回数据平台文献记录。
- `GET /api/attachment/:filename`：从 GridFS 流式预览或下载附件。
- `DELETE /api/attachment/remove/:litId`：删除 GridFS 文件，并清空对应文献记录的附件字段。
- `GET /api/attachment/test`：在动态文件路由之前注册，返回真实 MongoDB/GridFS 可用状态。

接口路径、请求字段和成功响应形状不变，因此 `src/platform/api/attachment.js` 不需要重写。

### 启动行为

MongoDB 仍由开发环境独立启动。`3001` 启动时继续允许 SQLite 登录和 CRUD 功能工作；MongoDB 不可用时输出明确警告，并仅让附件接口返回 `503`，不能拖垮整个数据平台。

`package.json` 当前引用缺失脚本的问题属于已识别的独立启动风险，本任务不混入修复。完成附件链路验证时可继续使用当前有效的 `node src/index.js` 启动 `3001`。本任务不启动旧前端、不启动 `5000`，也不管理 `8000` 至 `8002` 模型服务。

## 错误处理

- MongoDB 不可用：附件接口返回明确的 `503`，但 SQLite 登录和 CRUD 接口保持可用。
- 上传缺少 `file` 或 `litId`：返回 `400`。
- 文件不存在：返回 `404`。
- GridFS 写入失败：不更新文献附件字段。
- GridFS 删除失败：不提前清空文献附件字段，避免产生假成功状态。

## 验证范围

1. 配置/控制器聚焦测试覆盖路由优先级、内存上传和失败状态。
2. `3001` 健康检查成功。
3. 使用测试文献执行一次真实上传、预览和删除闭环。
4. 前端构建通过。
5. 确认 `5000` 接口和源码未修改。

## 不在本任务范围

- 不同步 `3001` 平台文献与 `5000` 知识图谱文献库。
- 不修改知识图谱构建、报告或问答接口。
- 不处理模型服务 `8000` 至 `8002`。
- 不修复 `backend_impl/package.json` 中引用缺失启动脚本的问题。
- `.env`、SQLite 数据库和运行时附件目录的 Git 忽略规则作为下一项独立风险处理。
