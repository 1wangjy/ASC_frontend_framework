# 单一逻辑知识图谱构建流程设计

## 目标

前端将 Base Research 和 Professional Research 视为同一个知识图谱项目的两个内部阶段。只有 Professional Research 图谱完成，用户可见的“知识图谱构建”才算完成。

本次只修改 3000 端口前端，不修改 5002 后端，也不改变后端现有的两阶段接口契约。

## 后端边界

当前后端要求执行两次不同用途的 `POST /api/graph/build`：

1. `build_stage=base` 生成 Base 图谱和 `base_*.json` 元数据。
2. `build_stage=professional` 读取 Base 元数据并生成最终 Professional Research 图谱。

两次请求不是重复任务。前端保留这两个后端阶段，但不再将其展示为两个独立的用户项目。

## 用户可见项目

- Base 后端项目是逻辑项目的根记录。
- `base_project_id` 指向根记录的 Professional 后端项目是该逻辑项目的最终构建阶段。
- 左侧项目列表按上述关系聚合，只展示一张逻辑项目卡片。
- 卡片始终使用用户创建 Base 项目时填写的名称。
- Professional 请求的预创建和生成表单都携带派生名称，避免后端保存为 `Unnamed Project`。
- 右侧工作区可以在内部切换到当前后端记录，但不得让用户误以为创建了第二个知识图谱项目。

## 状态与操作

| 后端阶段 | 用户可见状态 | 可问答 | 下一步 |
| --- | --- | --- | --- |
| Base 本体或图谱处理中 | 正在构建基础图谱 | 否 | 等待 |
| Base 图谱完成，尚无 Professional 项目 | 基础阶段完成，等待 Professional Research | 否 | 上传或选择 Professional Research 文献 |
| Professional 本体或图谱处理中 | 正在构建最终图谱 | 否 | 等待 |
| Professional 图谱完成 | 知识图谱构建完成 | 是 | 图谱问答或继续环境搭建 |
| 任一当前阶段失败 | 构建失败 | 否 | 查看错误并重试 |

Base 项目的 `graph_completed` 不再被解释为整个逻辑项目完成，也不能开放“去问答”。只有关联 Professional 项目的 `graph_completed` 且具有 `project_id`、`graph_id` 时才开放图谱问答。

## 进度展示

- 删除左侧项目卡片上的百分比和进度条。
- 删除顶部“当前步骤 xx%”文本以及基于 30、58、68、95 等权重计算的图谱阶段百分比。
- 顶部五步导航保留离散状态：当前、已完成、待处理。
- Professional 图谱完成前，“图谱构建”始终是当前步骤。
- Professional 图谱完成后，“图谱构建”标记完成，并进入“环境搭建”。
- 后端返回的详细百分比仍可用于内部轮询和诊断日志，但不再作为面向用户的整体流程百分比。

## 数据流

1. 项目监控器读取后端项目列表与任务状态。
2. 前端以 `project_id` 和 `base_project_id` 建立 Base 根记录与 Professional 子记录的关联。
3. 每个根记录生成一个逻辑项目视图模型，状态优先取关联的最新 Professional 记录，否则取 Base 记录。
4. 项目列表和右侧顶部步骤条消费同一个逻辑项目状态，避免两套状态计算。
5. Professional 构建启动后，前端继续使用后端返回的 Professional `project_id` 请求详情和任务状态，但项目列表仍选中对应的逻辑根项目。

## 删除边界

逻辑项目可能对应多个后端记录。删除逻辑项目时，前端必须明确列出并删除关联的 Professional 记录和 Base 根记录；先删除子记录，再删除根记录。任一步失败都显示真实错误并刷新列表，不把残留记录静默隐藏。

## 错误处理

- 无法确认 Base/Professional 关联时，保留独立记录并显示真实名称，避免错误合并。
- Professional 构建失败时，Base 只能显示为“基础阶段完成”，不能伪装为最终完成。
- Professional 请求缺少名称时使用根项目名称派生默认值，但不得使用 `Unnamed Project` 作为前端默认名称。
- 项目列表或任务接口不可用时，保留最近一次同步结果并显示连接错误。

## 验证

- 模型测试覆盖 Base 单独存在、Professional 构建中、Professional 完成、失败和无法关联等情况。
- 组件测试确认项目卡不再渲染百分比或进度条。
- 路由测试确认选择聚合卡片能够打开当前后端阶段。
- 问答资格测试确认 Base 完成不能问答，Professional 完成才能问答。
- 请求测试确认 Professional 的 prepare JSON 和 generate FormData 使用一致名称。
- 回归测试确认仍然各执行一次 Base build 和一次 Professional build，不产生额外 `POST /api/graph/build`。
- 执行完整测试、生产构建和 `git diff --check`。

