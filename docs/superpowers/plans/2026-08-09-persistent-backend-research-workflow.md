# Persistent Backend Research Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 3000 前端在所有页面持续展示 5002 的真实图谱构建状态，完成后安全进入指定图谱问答，并调整“新建问答”和示例问题面板，同时保留仿真、报告和深度互动。

**Architecture:** `AscShell` 持有一个应用级图谱任务监控器。监控器轮询稳定可用的项目列表，并只对带 `graph_build_task_id` 的构建中项目查询单任务状态；纯模型负责归一化和排序，展示组件不发请求。`MainView` 继续作为唯一图谱详情页，完成后不再强制跳转；问答页监听图谱完成版本并重新从后端加载可用项目。

**Tech Stack:** Vue 3 Composition API、Vue Router 4、Axios、Vite 7、Node.js `node:test`、CSS

## Global Constraints

- 开发前端固定运行在 `http://localhost:3000`，Vite 将同源 `/api` 代理到 `http://127.0.0.1:5002`。
- 不修改 `D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main` 下的 3001 前端或 5002 后端文件。
- 不依赖 `GET /api/graph/tasks`；该接口已在 2026-08-09 实测为 HTTP 500。
- 后端项目、任务和图谱数据是唯一权威来源；浏览器存储只能保存可选偏好。
- 顶级导航只保留“问答首页”和“文献管理”。
- 保留仿真、报告和深度互动现有路由与调用链。
- 静态问题只能命名为“示例问题”，不能显示为后端“历史问题”。
- 每项实现遵循失败测试、最小实现、通过测试、独立提交的顺序。

---

## File Structure

**Create**

- `src/features/tasks/graphTaskMonitorModel.js`：归一化项目/任务响应、生成统一任务条目、排序和计算轮询间隔。
- `src/features/tasks/graphTaskMonitor.js`：应用级监控器、轮询生命周期、断线恢复、完成版本通知。
- `src/features/tasks/GlobalGraphTaskIndicator.vue`：全局任务入口和弹出列表，只负责展示与发出操作事件。
- `tests/graphTaskMonitorModel.test.js`：纯模型的状态映射、排序、进度和间隔测试。
- `tests/graphTaskMonitor.test.js`：注入假 API 与调度器，验证轮询、重连、防旧响应和完成通知。
- `tests/globalGraphTaskIndicator.test.js`：组件文本、操作可见性、响应式入口和无假进度契约。

**Modify**

- `src/api/pdfLibrary.js`：安全读取用户 ID，避免存储异常阻断预览/下载。
- `src/layouts/AscShell.vue`：启动唯一监控器、渲染全局入口并处理路由跳转。
- `src/features/projects/graphQaNavigation.js`：支持完成图谱加载后保持当前页面，而不是必须立刻导航。
- `src/views/MainView.vue`：图谱完成后保留完成态，提供显式“去图谱问答”按钮。
- `src/views/AscQaView.vue`：监听完成版本和路由项目变化，重新请求 5002 项目列表。
- `src/features/qa/RecentConversationsPanel.vue`：移动新建按钮并改为真实的示例问题文案。
- `tests/apiRuntime.test.js`：覆盖浏览器存储被拒绝时的 PDF URL。
- `tests/graphQaNavigation.test.js`：覆盖“完成但不自动跳转”。
- `tests/navigationCleanup.test.js`：覆盖新建按钮顺序与示例问题命名。
- `tests/ascLabExperience.test.js`：补充全局任务入口、问答刷新和高级路由保留的源码契约。

---

### Task 1: Normalize Backend Project and Task State

**Files:**

- Create: `src/features/tasks/graphTaskMonitorModel.js`
- Test: `tests/graphTaskMonitorModel.test.js`

**Interfaces:**

- Consumes: 后端 `listProjects()` 响应，以及以 `task_id` 为键的单任务响应 `Map<string, object>`。
- Produces:
  - `unwrapGraphProjects(response): object[]`
  - `normalizeGraphTaskItems(projects, taskById): GraphTaskItem[]`
  - `selectVisibleGraphTasks(items, maxRecent = 3): GraphTaskItem[]`
  - `getGraphMonitorDelay(items, options): number`
- `GraphTaskItem` 固定字段：`id`、`projectId`、`graphId`、`taskId`、`name`、`status`、`stage`、`progress`、`message`、`updatedAt`、`active`、`canOpenQa`。

- [ ] **Step 1: Write failing normalization tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGraphMonitorDelay,
  normalizeGraphTaskItems,
  selectVisibleGraphTasks,
  unwrapGraphProjects
} from '../src/features/tasks/graphTaskMonitorModel.js'

test('unwraps the backend project envelope', () => {
  assert.deepEqual(
    unwrapGraphProjects({ success: true, data: [{ project_id: 'p1' }] }),
    [{ project_id: 'p1' }]
  )
})

test('uses project ontology progress and graph task progress without inventing values', () => {
  const projects = [
    {
      project_id: 'ontology-project',
      project_name: '本体项目',
      status: 'ontology_generating',
      ontology_progress: { progress: 31, message: '抽取实体' },
      updated_at: '2026-08-09T10:00:00Z'
    },
    {
      project_id: 'graph-project',
      project_name: '图谱项目',
      status: 'graph_building',
      graph_build_task_id: 'task-1',
      updated_at: '2026-08-09T11:00:00Z'
    }
  ]
  const taskById = new Map([
    ['task-1', { status: 'running', progress: 68, message: '写入关系' }]
  ])

  const result = normalizeGraphTaskItems(projects, taskById)

  assert.deepEqual(result.map(item => [item.projectId, item.status, item.progress]), [
    ['graph-project', 'graph_building', 68],
    ['ontology-project', 'ontology_generating', 31]
  ])
  assert.equal(result[0].message, '写入关系')
})

test('marks only completed projects with both ids as available for QA', () => {
  const result = normalizeGraphTaskItems([
    { project_id: 'ready', graph_id: 'g1', status: 'graph_completed' },
    { project_id: 'missing-graph', graph_id: '', status: 'graph_completed' }
  ])

  assert.equal(result.find(item => item.projectId === 'ready').canOpenQa, true)
  assert.equal(result.find(item => item.projectId === 'missing-graph').canOpenQa, false)
})

test('surfaces a failed graph task without waiting for the project list to catch up', () => {
  const result = normalizeGraphTaskItems([
    { project_id: 'p1', status: 'graph_building', graph_build_task_id: 't1' }
  ], new Map([
    ['t1', { status: 'failed', error: '图谱写入失败' }]
  ]))

  assert.equal(result[0].status, 'failed')
  assert.equal(result[0].active, false)
  assert.equal(result[0].message, '图谱写入失败')
})

test('keeps all active tasks and at most three recent terminal tasks', () => {
  const items = [
    { id: 'a', active: true, updatedAt: 5 },
    { id: 'b', active: false, updatedAt: 4 },
    { id: 'c', active: false, updatedAt: 3 },
    { id: 'd', active: false, updatedAt: 2 },
    { id: 'e', active: false, updatedAt: 1 }
  ]
  assert.deepEqual(selectVisibleGraphTasks(items).map(item => item.id), ['a', 'b', 'c', 'd'])
})

test('polls active work quickly and idle state slowly', () => {
  assert.equal(getGraphMonitorDelay([{ active: true }]), 1500)
  assert.equal(getGraphMonitorDelay([{ active: false }]), 12000)
})
```

- [ ] **Step 2: Run the model test and verify RED**

Run:

```powershell
node --test tests/graphTaskMonitorModel.test.js
```

Expected: FAIL because `graphTaskMonitorModel.js` does not exist.

- [ ] **Step 3: Implement the pure normalization model**

Implement status mapping with these exact rules:

```js
const ACTIVE_STATUSES = new Set(['ontology_generating', 'graph_building'])

export function unwrapGraphProjects(response = []) {
  if (Array.isArray(response)) return response
  return Array.isArray(response?.data) ? response.data : []
}

function numericProgress(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0
}

export function normalizeGraphTaskItems(projects = [], taskById = new Map()) {
  return unwrapGraphProjects(projects)
    .filter(project => String(project?.project_id || '').trim())
    .map(project => {
      const taskId = String(project.graph_build_task_id || '').trim()
      const task = taskId ? taskById.get(taskId) : null
      const projectStatus = String(project.status || 'created')
      const status = projectStatus === 'graph_building' && task?.status === 'failed'
        ? 'failed'
        : projectStatus
      const ontology = project.ontology_progress || {}
      const progress = status === 'graph_completed'
        ? 100
        : numericProgress(status === 'graph_building' ? task?.progress : ontology.progress)
      return {
        id: taskId || `project:${project.project_id}`,
        projectId: String(project.project_id).trim(),
        graphId: String(project.graph_id || '').trim(),
        taskId,
        name: project.project_name || project.name || project.project_id,
        status,
        stage: project.graph_build_stage || (status.startsWith('ontology_') ? 'ontology' : 'base'),
        progress,
        message: task?.error || task?.message || ontology.message || project.error || '',
        updatedAt: Date.parse(project.updated_at || project.created_at || '') || 0,
        active: ACTIVE_STATUSES.has(status),
        canOpenQa: status === 'graph_completed' && Boolean(project.project_id && project.graph_id)
      }
    })
    .sort((left, right) => Number(right.active) - Number(left.active) || right.updatedAt - left.updatedAt)
}

export function selectVisibleGraphTasks(items = [], maxRecent = 3) {
  const active = items.filter(item => item.active)
  const terminal = items.filter(item => !item.active).slice(0, maxRecent)
  return [...active, ...terminal]
}

export function getGraphMonitorDelay(items = [], { activeMs = 1500, idleMs = 12000 } = {}) {
  return items.some(item => item.active) ? activeMs : idleMs
}
```

- [ ] **Step 4: Run the model tests and verify GREEN**

Run: `node --test tests/graphTaskMonitorModel.test.js`

Expected: 6 tests PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/features/tasks/graphTaskMonitorModel.js tests/graphTaskMonitorModel.test.js
git commit -m "feat: normalize backend graph task state"
```

---

### Task 2: Build the Persistent Polling Controller

**Files:**

- Create: `src/features/tasks/graphTaskMonitor.js`
- Test: `tests/graphTaskMonitor.test.js`

**Interfaces:**

- Consumes: `listProjects({ limit: 50 })` and `getTaskStatus(taskId)` from `src/api/graph.js`; Task 1 model functions.
- Produces:
  - `createGraphTaskMonitor(dependencies): { state, start, stop, refresh }`
  - `useGraphTaskMonitor(): { state, start, stop, refresh }`
- `state.connection` is one of `idle | connecting | online | reconnecting | offline`.
- `state.completedRevision` increments only when an already observed project changes from not-ready to `canOpenQa === true`.

- [ ] **Step 1: Write failing controller tests with injected services and scheduler**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGraphTaskMonitor } from '../src/features/tasks/graphTaskMonitor.js'

test('builds one snapshot from project list and per-project active task status', async () => {
  const calls = []
  const monitor = createGraphTaskMonitor({
    listProjects: async () => ({
      success: true,
      data: [{
        project_id: 'p1', status: 'graph_building', graph_build_task_id: 't1'
      }]
    }),
    getTaskStatus: async taskId => {
      calls.push(taskId)
      return { success: true, data: { task_id: taskId, status: 'running', progress: 42 } }
    },
    schedule: () => 1,
    cancelSchedule: () => {}
  })

  await monitor.refresh()

  assert.deepEqual(calls, ['t1'])
  assert.equal(monitor.state.items[0].progress, 42)
  assert.equal(monitor.state.connection, 'online')
})

test('keeps the last snapshot and reports offline when refresh fails', async () => {
  let fail = false
  const monitor = createGraphTaskMonitor({
    listProjects: async () => {
      if (fail) throw new Error('Network Error')
      return { success: true, data: [{ project_id: 'p1', status: 'ontology_generating' }] }
    },
    getTaskStatus: async () => ({ success: true, data: {} }),
    schedule: () => 1,
    cancelSchedule: () => {}
  })

  await monitor.refresh()
  fail = true
  await monitor.refresh()

  assert.equal(monitor.state.items[0].projectId, 'p1')
  assert.equal(monitor.state.connection, 'offline')
  assert.match(monitor.state.error, /Network Error/)
})

test('increments completion revision only after an observed transition', async () => {
  let project = { project_id: 'p1', status: 'graph_building', graph_build_task_id: 't1' }
  const monitor = createGraphTaskMonitor({
    listProjects: async () => ({ success: true, data: [project] }),
    getTaskStatus: async () => ({ success: true, data: { progress: 90 } }),
    schedule: () => 1,
    cancelSchedule: () => {}
  })

  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 0)
  project = { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
  await monitor.refresh()
  assert.equal(monitor.state.completedRevision, 1)
})

test('ignores an older request that resolves after a newer refresh', async () => {
  let resolveFirst
  let call = 0
  const monitor = createGraphTaskMonitor({
    listProjects: () => {
      call += 1
      if (call === 1) return new Promise(resolve => { resolveFirst = resolve })
      return Promise.resolve({ success: true, data: [{ project_id: 'new', status: 'created' }] })
    },
    getTaskStatus: async () => ({ success: true, data: {} }),
    schedule: () => 1,
    cancelSchedule: () => {}
  })

  const first = monitor.refresh()
  await monitor.refresh()
  resolveFirst({ success: true, data: [{ project_id: 'old', status: 'created' }] })
  await first

  assert.equal(monitor.state.items[0].projectId, 'new')
})
```

- [ ] **Step 2: Run controller tests and verify RED**

Run: `node --test tests/graphTaskMonitor.test.js`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the controller with one dynamic timer**

Use a Vue `reactive` state and dependency injection. The refresh algorithm must be:

```js
const response = await listProjects({ limit: 50 })
const projects = unwrapGraphProjects(response)
const activeTaskIds = [...new Set(
  projects
    .filter(project => project.status === 'graph_building')
    .map(project => String(project.graph_build_task_id || '').trim())
    .filter(Boolean)
)]
const taskResults = await Promise.allSettled(
  activeTaskIds.map(async taskId => [taskId, await getTaskStatus(taskId)])
)
const taskById = new Map(
  taskResults
    .filter(result => result.status === 'fulfilled' && result.value[1]?.success)
    .map(result => [result.value[0], result.value[1].data])
)
const nextItems = normalizeGraphTaskItems(projects, taskById)
```

Controller requirements:

- `start()` is idempotent, registers `focus`, `online`, and `visibilitychange`, then immediately refreshes.
- `stop()` removes listeners, clears the timer, increments the request sequence, and sets `state.running = false`.
- A refresh sequence number prevents late responses overwriting a later snapshot.
- Each schedule clears the previous timeout before setting another.
- Successful refresh sets `connection = 'online'`, clears the error and resets failures.
- Failed refresh preserves `items`, sets `connection = 'offline'`, increments failures, and schedules `min(15000, 1500 * 2 ** (failures - 1))`.
- `focus` and `online` immediately call `refresh()`.
- Hidden documents do not use the 1500 ms active interval; schedule 12000 ms until visible again.
- The singleton returned by `useGraphTaskMonitor()` uses the existing `listProjects` and `getTaskStatus` imports; it never imports or calls a list-all-tasks endpoint.

- [ ] **Step 4: Run focused monitor tests**

Run:

```powershell
node --test tests/graphTaskMonitorModel.test.js tests/graphTaskMonitor.test.js
```

Expected: all tests PASS with no open timer handles.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/features/tasks/graphTaskMonitor.js tests/graphTaskMonitor.test.js
git commit -m "feat: monitor graph work across routes"
```

---

### Task 3: Add the Global Task Indicator to the Persistent Shell

**Files:**

- Create: `src/features/tasks/GlobalGraphTaskIndicator.vue`
- Modify: `src/layouts/AscShell.vue`
- Test: `tests/globalGraphTaskIndicator.test.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**

- Consumes: Task 2 `monitor.state`, `monitor.start()`, `monitor.stop()`, `monitor.refresh()`.
- Produces component events:
  - `refresh`
  - `view-project` with `projectId: string`
  - `open-qa` with the full normalized `GraphTaskItem`

- [ ] **Step 1: Write failing render and shell contract tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderSfc } from './helpers/renderSfc.js'

test('renders real task status and only offers QA for a completed scoped graph', async () => {
  const html = await renderSfc('/src/features/tasks/GlobalGraphTaskIndicator.vue', {
    items: [{
      id: 't1', projectId: 'p1', graphId: 'g1', name: 'ASC 图谱',
      status: 'graph_completed', stage: 'base', progress: 100,
      message: '任务完成', active: false, canOpenQa: true
    }],
    connection: 'online',
    lastSyncedAt: Date.now()
  })

  assert.match(html, /图谱任务/)
  assert.match(html, /ASC 图谱/)
  assert.match(html, /100%/)
  assert.match(html, /查看进度/)
  assert.match(html, /去问答/)
})

test('shell owns exactly one persistent graph monitor lifecycle', async () => {
  const shell = await readFile(new URL('../src/layouts/AscShell.vue', import.meta.url), 'utf8')
  assert.match(shell, /useGraphTaskMonitor/)
  assert.match(shell, /onMounted\(monitor\.start\)/)
  assert.match(shell, /onUnmounted\(monitor\.stop\)/)
  assert.match(shell, /GlobalGraphTaskIndicator/)
})
```

- [ ] **Step 2: Run the component tests and verify RED**

Run: `node --test tests/globalGraphTaskIndicator.test.js`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the display-only indicator**

The component must:

- use `selectVisibleGraphTasks(props.items)` for the displayed list;
- show `正在构建 N 项` when active work exists, `图谱任务` otherwise;
- map statuses to Chinese copy: `created -> 准备中`、`ontology_generating -> 生成本体`、`ontology_generated -> 等待构建`、`graph_building -> 构建图谱`、`graph_completed -> 已完成`、`failed -> 失败`;
- display the numeric progress received from the model without CSS animation that changes the number;
- mark cached values as `连接已断开，上次状态` when `connection === 'offline'`;
- emit `view-project` for every item and `open-qa` only when `item.canOpenQa`;
- close on Escape and restore focus to its trigger;
- render as a bottom-right floating chip on desktop and below the 56 px mobile header on widths up to 760 px.

- [ ] **Step 4: Wire the component into `AscShell`**

Add these handlers:

```js
const monitor = useGraphTaskMonitor()

function viewProject(projectId) {
  router.push({ name: 'Process', params: { projectId } })
}

async function openProjectQa(item) {
  await navigateGraphProjectToQa({
    project: { project_id: item.projectId, graph_id: item.graphId },
    browser: globalThis,
    navigate: qaRoute => router.push(qaRoute)
  })
}

onMounted(monitor.start)
onUnmounted(monitor.stop)
```

Pass `monitor.state.items`, `connection`, and `lastSyncedAt` as props. Bind the three component events to `monitor.refresh`, `viewProject`, and `openProjectQa`.

- [ ] **Step 5: Run focused UI tests and build**

Run:

```powershell
node --test tests/globalGraphTaskIndicator.test.js tests/ascLabExperience.test.js
npm run build
```

Expected: tests PASS and Vite build exits 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/features/tasks/GlobalGraphTaskIndicator.vue src/layouts/AscShell.vue tests/globalGraphTaskIndicator.test.js tests/ascLabExperience.test.js
git commit -m "feat: show graph progress across pages"
```

---

### Task 4: Stop Forced Completion Navigation and Add an Explicit QA Action

**Files:**

- Modify: `src/features/projects/graphQaNavigation.js`
- Modify: `src/views/MainView.vue`
- Modify: `tests/graphQaNavigation.test.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**

- Consumes: existing `completeTaskGraphForQa()` and `completeMissingTaskGraphForQa()` completion gates.
- Produces: optional `navigateWhenReady: boolean`, default `true`; when `false`, final project and graph must still be fetched and validated, but no route change occurs.

- [ ] **Step 1: Write the failing no-forced-navigation test**

```js
test('can finalize a completed graph without forcing QA navigation', async () => {
  const { completeTaskGraphForQa } = await import('../src/features/projects/graphQaNavigation.js')
  const calls = []
  const result = await completeTaskGraphForQa({
    projectId: 'p1',
    getProject: async () => ({
      success: true,
      data: { project_id: 'p1', graph_id: 'g1', status: 'graph_completed' }
    }),
    loadGraph: async () => { calls.push('loadGraph'); return true },
    onReady: async () => { calls.push('onReady') },
    navigate: async () => { calls.push('navigate'); return true },
    navigateWhenReady: false
  })

  assert.equal(result.status, 'success')
  assert.deepEqual(calls, ['loadGraph', 'onReady'])
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/graphQaNavigation.test.js`

Expected: FAIL because navigation still runs.

- [ ] **Step 3: Implement the optional navigation gate**

In `completeGraphForQa`, after `onReady(project)` succeeds and before checking `navigate`, add:

```js
if (navigateWhenReady === false) {
  return { status: 'success', project, route }
}
```

Destructure `navigateWhenReady = true` from the options so all existing callers and tests keep their current behavior.

- [ ] **Step 4: Update `MainView` to stay on the completed workflow page**

For both normal task completion and missing-task recovery:

- pass `navigateWhenReady: false` to the completion helper;
- keep `loadGraph` and `applyCompletedGraphState` unchanged;
- do not pass `navigate: openCompletedGraphInQa` from automatic polling;
- add computed `canOpenCompletedGraphQa` that requires `projectData.project_id`, `projectData.graph_id`, and `projectData.status === 'graph_completed'`;
- render a header button named “去图谱问答” only when that computed is true;
- the button explicitly calls `openCompletedGraphInQa(projectData)`.

Required template excerpt:

```vue
<button
  v-if="canOpenCompletedGraphQa"
  class="qa-entry-button"
  type="button"
  @click="openCompletedGraphInQa(projectData)"
>
  去图谱问答
</button>
```

- [ ] **Step 5: Run completion and experience tests**

Run:

```powershell
node --test tests/graphQaNavigation.test.js tests/ascLabExperience.test.js
npm run build
```

Expected: all focused tests PASS; build exits 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/features/projects/graphQaNavigation.js src/views/MainView.vue tests/graphQaNavigation.test.js tests/ascLabExperience.test.js
git commit -m "fix: keep completed graph workflow visible"
```

---

### Task 5: Refresh QA Scope from Completed Tasks and Route Changes

**Files:**

- Modify: `src/views/AscQaView.vue`
- Modify: `tests/graphScopedQaFlow.test.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**

- Consumes: Task 2 `useGraphTaskMonitor().state.completedRevision` and the existing `loadProjects({ requireManualSelection? })`.
- Produces: no new public API; QA project options refresh from 5002 whenever a graph becomes ready or `route.query.projectId` changes.

- [ ] **Step 1: Write failing source-contract tests**

```js
test('refreshes backend graph choices after global completion and QA route scope changes', async () => {
  const view = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  assert.match(view, /useGraphTaskMonitor/)
  assert.match(view, /completedRevision/)
  assert.match(view, /route\.query\.projectId/)
  assert.match(view, /loadProjects/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js`

Expected: FAIL because `AscQaView` does not consume the global completion revision.

- [ ] **Step 3: Add completion and route watchers**

Import and initialize the singleton without starting a second poller:

```js
import { useGraphTaskMonitor } from '../features/tasks/graphTaskMonitor.js'

const graphTaskMonitor = useGraphTaskMonitor()
```

Add two watchers:

```js
watch(
  () => graphTaskMonitor.state.completedRevision,
  (current, previous) => {
    if (current > previous) loadProjects()
  }
)

watch(
  () => route.query.projectId,
  (current, previous) => {
    if (current !== previous) loadProjects()
  }
)
```

Do not call `graphTaskMonitor.start()` from `AscQaView`; `AscShell` remains the only lifecycle owner. Keep invalid-scope manual selection behavior intact: if `scopeSelectionRequired` is true, `loadProjects()` must still avoid automatic fallback.

- [ ] **Step 4: Run QA scope tests**

Run:

```powershell
node --test tests/graphScopedQaFlow.test.js tests/qaApiAdapter.test.js tests/projectContextModel.test.js tests/ascLabExperience.test.js
```

Expected: all tests PASS, including invalid graph deletion/mismatch cases.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/views/AscQaView.vue tests/graphScopedQaFlow.test.js tests/ascLabExperience.test.js
git commit -m "feat: refresh QA projects after graph completion"
```

---

### Task 6: Move New Chat Above the Truthfully Named Example List

**Files:**

- Modify: `src/features/qa/RecentConversationsPanel.vue`
- Modify: `tests/navigationCleanup.test.js`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**

- Consumes: existing `conversations` prop and `new-chat`/`select` events.
- Produces: unchanged event API; changed visual order and user-facing copy only.

- [ ] **Step 1: Replace the old navigation test with order and copy assertions**

```js
test('renders new chat above the truthfully named example list', async () => {
  const html = await renderSfc('/src/features/qa/RecentConversationsPanel.vue', {
    conversations: recentConversations
  })

  assert.match(html, /示例问题/)
  assert.match(html, /新建问答/)
  assert.doesNotMatch(html, /历史问题|查看更多历史|收起历史/)
  assert.ok(html.indexOf('新建问答') < html.indexOf('示例问题'))
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/navigationCleanup.test.js`

Expected: FAIL because the current default is “历史问题” and the button follows the summary.

- [ ] **Step 3: Reorder markup and update copy**

Inside `.recent-conversations__content`, render `.recent-conversations__new` before `.recent-conversations__heading`. Set the prop default to `示例问题`. Change the expansion button to:

```vue
<span>{{ expanded ? '收起示例' : '查看更多示例' }}</span>
```

Keep the compact mobile toggle, Escape behavior, `new-chat` event, selection event, and existing list truncation unchanged. Adjust margins so the button is visually separated from the heading rather than nested inside it.

- [ ] **Step 4: Run navigation and render tests**

Run:

```powershell
node --test tests/navigationCleanup.test.js tests/ascLabExperience.test.js
npm run build
```

Expected: tests PASS; build exits 0.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/features/qa/RecentConversationsPanel.vue tests/navigationCleanup.test.js tests/ascLabExperience.test.js
git commit -m "fix: clarify QA example panel hierarchy"
```

---

### Task 7: Make PDF Resource URLs Storage-Safe

**Files:**

- Modify: `src/api/pdfLibrary.js`
- Modify: `tests/apiRuntime.test.js`

**Interfaces:**

- Consumes: `readBrowserStorageItem(key, browser?)` from `src/utils/browserStorage.js`.
- Produces: unchanged `getPdfPreviewUrl(fileId)` and `getPdfDownloadUrl(fileId)` return strings.

- [ ] **Step 1: Add the failing denied-storage test**

```js
test('builds PDF URLs even when the browser denies local storage', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  })

  try {
    const pdfLibrary = await import('../src/api/pdfLibrary.js')
    assert.equal(
      pdfLibrary.getPdfPreviewUrl('paper-1'),
      '/api/pdf-library/files/paper-1/preview?user=local-asc-analyst'
    )
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/apiRuntime.test.js`

Expected: FAIL with `SecurityError` from direct `localStorage.getItem`.

- [ ] **Step 3: Use the existing safe reader**

Modify `src/api/pdfLibrary.js`:

```js
import { readBrowserStorageItem } from '../utils/browserStorage.js'

function currentUserId() {
  return encodeURIComponent(readBrowserStorageItem('nexus_user_id') || 'local-asc-analyst')
}
```

Use `currentUserId()` in both URL builders. Do not change their paths or query parameter name.

- [ ] **Step 4: Run storage and API tests**

Run:

```powershell
node --test tests/apiRuntime.test.js tests/projectContextModel.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 7**

```powershell
git add src/api/pdfLibrary.js tests/apiRuntime.test.js
git commit -m "fix: keep PDF URLs working without storage"
```

---

### Task 8: Full Regression and Real 3000-to-5002 Verification

**Files:**

- Modify only if evidence reveals a frontend defect: files from Tasks 1-7 and their matching tests.
- Do not modify: `D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main\backend\**`
- Do not modify: the 3001 frontend under `D:\WEB\VScode\yuan ma\桌面\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend\**`

**Interfaces:**

- Consumes: completed frontend implementation and the already running 5002 backend.
- Produces: verified build, full test result, live proxy evidence, and browser workflow evidence.

- [ ] **Step 1: Run the complete automated suite**

```powershell
node --test tests/*.test.js
npm run build
git diff --check
```

Expected: every Node test PASS, Vite build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 2: Start or reuse the 3000 frontend without changing its configured port**

```powershell
npm run dev
```

Expected: Vite reports `http://localhost:3000`. If port 3000 is already owned by this same workspace, reuse that instance; `strictPort` must prevent silently switching to another port.

- [ ] **Step 3: Verify the live Vite proxy reaches the stable 5002 endpoint**

```powershell
$headers = @{ 'X-NEXUS-USER' = 'local-asc-analyst' }
$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/graph/project/list?limit=5' -Headers $headers -TimeoutSec 10
$response.StatusCode
```

Expected: `200`. The implementation must not use `/api/graph/tasks` because the current backend returns 500 for that route.

- [ ] **Step 4: Exercise the route-persistence browser flow against real 5002**

Perform this sequence with browser network inspection open:

1. Open `http://localhost:3000/documents`.
2. Select an existing backend PDF and choose “使用选中文献构建图谱”.
3. Start the graph workflow and record its `project_id` and `graph_build_task_id` from real responses.
4. Navigate to `/` while the task is active.
5. Confirm the global indicator continues to issue `GET /api/graph/project/list` and `GET /api/graph/task/:taskId`, and its progress matches the response.
6. Refresh `/`; confirm the same backend project is reconstructed without a duplicate POST.
7. Click “查看进度”; confirm the route is `/process/:projectId`.
8. When complete, confirm no surprise route change occurs and “去问答” appears.
9. Click “去问答”; confirm `/` contains `?projectId=<the real project id>` and the selector chooses that project.
10. Submit one question and verify the real `/api/graphrag/cod-query` payload contains exactly that `project_id` and its real `graph_id`.

Expected: all observations match the live 5002 responses; no mocked progress or fallback graph answer is displayed.

- [ ] **Step 5: Verify reconnect behavior without changing backend files**

Temporarily stop only the running 5002 process, observe the global indicator change to “连接已断开，上次状态”, then restart the same configured backend. Confirm project polling recovers and the indicator returns online. If the backend restart loses an in-memory task, verify the UI uses the persisted project status and does not claim the lost task is still running.

- [ ] **Step 6: Regress the retained advanced routes**

Open the existing simulation, simulation-run, report, and interaction routes using real IDs already available in the backend. Confirm each page loads and its API calls still go through `http://localhost:3000/api/...` to 5002. No top-level navigation entry is added for these routes.

- [ ] **Step 7: Confirm external trees were not modified**

```powershell
git status --short
git diff --name-only HEAD~7..HEAD
```

Expected: only the 3000 frontend files listed in Tasks 1-7 appear. The 3001 frontend and 5002 backend are outside this Git diff and remain untouched.

- [ ] **Step 8: Commit any verification-only frontend correction, then re-run the full gate**

If the live flow exposed a frontend defect, add only its failing regression test and matching minimal frontend fix, commit with a focused `fix:` message, then repeat Steps 1, 3, and 4. If no defect appears, do not create an empty commit.

Final gate:

```powershell
node --test tests/*.test.js
npm run build
git diff --check
git status --short --branch
```

Expected: all tests PASS, build exits 0, diff check is empty, and the worktree is clean.
