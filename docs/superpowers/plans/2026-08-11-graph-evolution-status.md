# Graph Evolution Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用后端真实图谱和模拟状态同步“图谱演化”的名称、状态和进度。

**Architecture:** 在任务模型层新增一个纯函数，将图谱项目与同项目最新模拟历史合并为 `evolutionStatus` 和显示进度；全局监控器并行读取模拟历史，失败时安全回退。项目列表和任务弹窗只消费合并后的统一状态，不自行推断。

**Tech Stack:** Vue 3、JavaScript ES modules、Node.js test runner、Vite

## Global Constraints

- 只修改 `frontend`，不修改后端。
- 不生成固定三阶段百分比。
- 仅 `runner_status === 'completed'` 表示知识图谱演化完成。
- 不新增任何 POST 请求。

---

### Task 1: 图谱演化状态模型与监控器

**Files:**
- Modify: `src/features/tasks/graphTaskMonitorModel.js`
- Modify: `src/features/tasks/graphTaskMonitor.js`
- Modify: `tests/graphTaskMonitorModel.test.js`
- Modify: `tests/graphTaskMonitor.test.js`

**Interfaces:**
- Consumes: `getSimulationHistory(limit)` 返回的 `{ success, data }`。
- Produces: `mergeGraphEvolutionState(items, history)`，为任务增加 `evolutionStatus`、真实模拟进度和模拟标识。

- [ ] **Step 1: 写失败测试**

覆盖最新模拟选择、正常完成、运行轮次、失败、停止以及历史接口失败仍保持在线。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/graphTaskMonitorModel.test.js tests/graphTaskMonitor.test.js`

Expected: 因合并函数和历史依赖不存在而失败。

- [ ] **Step 3: 实现最小模型和监控器接线**

从 `src/api/simulation.js` 引入 `getSimulationHistory`，与项目列表并行读取；历史失败返回空集合，项目列表失败仍沿用现有离线逻辑。

- [ ] **Step 4: 运行聚焦测试并确认 GREEN**

Run: `node --test tests/graphTaskMonitorModel.test.js tests/graphTaskMonitor.test.js`

Expected: 全部通过。

### Task 2: 统一界面名称和状态文案

**Files:**
- Modify: `src/features/navigation/appNavigation.js`
- Modify: `src/features/projects/GraphProjectWorkspacePanel.vue`
- Modify: `src/features/projects/GraphProjectList.vue`
- Modify: `src/features/tasks/GlobalGraphTaskIndicator.vue`
- Modify: `tests/ascLabExperience.test.js`
- Modify: `tests/navigationCleanup.test.js`
- Modify: `tests/graphProjectWorkspace.test.js`
- Modify: `tests/globalGraphTaskIndicator.test.js`

**Interfaces:**
- Consumes: Task 1 生成的 `evolutionStatus` 和 `progress`。
- Produces: “图谱演化”“知识图谱演化项目”“图谱演化任务”及统一状态文案。

- [ ] **Step 1: 写失败的组件与导航测试**

断言导航、面板、项目卡和任务弹窗显示新名称，并且完成、运行、停止文案不同。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/graphProjectWorkspace.test.js tests/globalGraphTaskIndicator.test.js tests/navigationCleanup.test.js tests/ascLabExperience.test.js`

Expected: 旧文案导致断言失败。

- [ ] **Step 3: 最小修改组件文案**

组件优先显示 `evolutionStatus`，未提供时保持原图谱状态回退。

- [ ] **Step 4: 运行聚焦测试并确认 GREEN**

Run: `node --test tests/graphProjectWorkspace.test.js tests/globalGraphTaskIndicator.test.js tests/navigationCleanup.test.js tests/ascLabExperience.test.js`

Expected: 全部通过。

### Task 3: 完整验证与提交

**Files:**
- Verify only: all modified source and tests

- [ ] **Step 1: 运行全量测试**

Run: `node --test tests/*.test.js`

Expected: 0 failures。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: exit code 0。

- [ ] **Step 3: 检查差异和工作树**

Run: `git diff --check` and `git status --short`

Expected: 无空白错误，只包含本任务文件及既有未跟踪 `tmp/`。

- [ ] **Step 4: 提交**

Run: `git add <本计划列出的文件> && git commit -m "feat: track graph evolution status"`
