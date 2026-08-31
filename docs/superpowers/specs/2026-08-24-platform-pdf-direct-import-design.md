# 数据平台 PDF 直接导入设计

## 目标

在数据平台“文献库管理”中增加单篇 PDF 直接导入流程。用户无需先填写完整元数据；系统使用文件名建立最小 literature 记录，将 PDF 上传到 3001 的 GridFS，尝试读取 PDF 自带的标准 metadata，再用实际解析结果更新记录。导入后的记录继续支持预览和手动编辑。

本设计不修改 `/documents`、5001、图谱流程、模型、LLM、Embedding 或用户系统。

## 方案

采用前端编排现有 3001 API 的方式，不新增一站式后端导入接口：

1. 用户点击“导入 PDF”并选择单个 `.pdf` 文件。
2. 前端验证文件扩展名和 MIME 类型。
3. 调用附件健康检查，确认 MongoDB/GridFS 可用。
4. 以去掉 `.pdf` 后缀的文件名作为 fallback title，创建最小 literature 记录；其他未知字段保持为空，`entry_type` 默认 `journal`。
5. 使用返回的 `lit_id` 调用现有 `POST /api/attachment/upload`。
6. 上传成功后，从本地 PDF 读取标准 Document Info 中明确存在的 `Title` 和 `Author`。
7. 若解析到可信字段，则通过现有 literature 更新接口保存；否则保留 fallback title。
8. 刷新列表，用户可以预览 PDF，并继续手动编辑所有已支持字段，包括将 `entry_type` 改为 `patent`。

## 组件边界

### 页面

`DataManagerView.vue` 只负责按钮、单文件选择、进度文案、刷新和用户提示。“导入 PDF”是主要入口，原“手动新增”保留为次要入口。

页面参考旧侧边栏文献管理的主操作、忙碌状态和成功/失败反馈，但不复用其 5001 `/api/pdf-library/*` 调用，也不迁移批量导入、筛选、分页或构建图谱。

### 导入服务

新增独立的前端导入服务，负责按顺序调用健康检查、literature 创建、附件上传、metadata 解析、literature 更新和失败回滚。服务返回明确的完整成功或降级成功结果，避免页面组件承担事务编排。

### Metadata 工具

新增无依赖的轻量 PDF metadata 工具：

- 验证 `%PDF-` 文件头。
- 使用文件名生成 fallback title。
- 只读取标准 Document Info 中实际存在且能可靠解码的 `Title` 和 `Author`。
- 不进行 OCR、正文文本抽取、LLM 推断、DOI 在线查询或字段猜测。
- 不将 PDF 创建时间当作发表年份，也不将 Subject 或 Keywords 自动映射到摘要等字段。

无法解析 metadata 是正常降级状态，不阻塞 PDF 导入。

### 3001 附件接口

继续使用现有 GridFS 架构和端点。附件路由/controller 增加基础 PDF 校验：文件扩展名、MIME 类型和 `%PDF-` 文件头。非法文件返回 400，不写入 GridFS。

附件健康检查需让前端可靠判断 GridFS 是否可用。MongoDB 不可用时，普通 literature CRUD 仍然可用。

## 一致性与错误处理

- 文件前端校验失败：不调用后端。
- MongoDB/GridFS 预检失败：不创建 literature，提示附件服务不可用。
- literature 创建失败：停止导入。
- literature 创建成功但 PDF 上传失败：删除本次临时 literature；若回滚也失败，报告导入失败并提示需要人工清理，不显示成功。
- PDF 上传成功但 metadata 解析失败：保留 PDF 和 literature，返回降级成功。
- PDF 上传成功但 metadata 更新失败：保留 PDF 和 literature，返回降级成功。

单次导入期间禁用导入按钮，状态依次显示“上传中”“解析中”“导入完成”或“PDF 已导入，可稍后补充文献信息”。

## 验证

最小测试覆盖：

- 导入入口不会要求先填写完整表单。
- MongoDB 不可用时不创建 literature。
- 成功流程按创建、上传、解析、更新的顺序执行。
- filename fallback title 正确。
- 上传失败会回滚临时 literature。
- metadata 解析或更新失败不会删除已上传 PDF。
- 非 PDF 被前端和后端拒绝。
- 导入后的记录仍能预览并手动编辑。
- 相关回归测试和 frontend build 通过。

如果 27017 不可用，真实 GridFS 上传和预览标记为 `BLOCKED_BY_MONGODB`，不安装或模拟 MongoDB。
