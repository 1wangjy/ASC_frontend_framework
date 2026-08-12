# Simulation Route Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图谱项目从其他页面返回时恢复到后端最新模拟阶段，并禁止组件重挂载自动重启模拟。

**Architecture:** 新增纯路由解析函数把 monitor 的最新 simulation 状态映射为准确路由；Step3 通过只读 run-status 恢复状态，只在明确未启动时执行首次启动。

**Tech Stack:** Vue 3、Vue Router、Node test、Vite。

## Global Constraints

- 只修改 3000 前端。
- 不修改或调用 5002/3001 写操作进行验证。
- 后端状态优先于前端缓存。

### Task 1: 后端状态派生恢复路由

**Files:**
- Modify: `src/features/navigation/graphWorkflowSession.js`
- Modify: `src/features/projects/GraphProjectWorkspacePanel.vue`
- Modify: `src/layouts/AscShell.vue`
- Test: `tests/graphWorkflowSession.test.js`

- [ ] 写失败测试：运行中/终态恢复到 SimulationRun，环境阶段恢复到 Simulation。
- [ ] 运行测试并确认因缺少解析函数失败。
- [ ] 实现纯解析函数并接入两个“查看进度”入口。
- [ ] 运行测试确认通过。

### Task 2: 模拟页只恢复、不重启

**Files:**
- Create: `src/features/simulation/simulationRunResumeModel.js`
- Modify: `src/components/Step3Simulation.vue`
- Test: `tests/simulationRunResume.test.js`

- [ ] 写失败测试：running/completed/stopped/failed 映射为恢复动作，not_started 才允许启动。
- [ ] 运行测试并确认模块缺失失败。
- [ ] 实现状态解析并在组件挂载时先 GET 后决定恢复或首次启动。
- [ ] 移除 `force: true`。
- [ ] 运行聚焦测试、相关回归和生产构建。
