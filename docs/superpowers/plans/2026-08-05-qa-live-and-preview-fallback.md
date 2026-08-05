# QA Live And Preview Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让智能问答页自动使用后端返回或本地配置的真实图谱，并在没有图谱时提供明确标记、不会写入后端的回答页面预览。

**Architecture:** 项目上下文模型负责把后端项目列表与本地环境配置归一化为同一种可选项目；问答状态模型负责区分 `live` 与 `preview` 回答来源；Vue 页面只协调加载、路由和事件，回答与证据组件依据来源控制提示和评估能力。所有真实 CoD、Judge 和反馈请求继续使用现有 API 适配器。

**Tech Stack:** Vue 3 Composition API、Vue Router、Vite、Node.js `node:test`

## Global Constraints

- 只修改 `frontend`，不修改后端代码。
- 保留现有页面布局、问答组件位置和样式体系。
- 不允许预览回答调用 CoD、Judge 或反馈接口。
- 不启用 `allow_latest_fallback`，不把演示回答伪装成后端结果。
- 后端项目列表中的真实图谱优先于 `VITE_DEFAULT_GRAPH_ID`。
- 不改动或恢复用户当前删除的 `docs/frontend-backend-api-contract.md`。

---

### Task 1: 图谱上下文自动发现与配置回退

**Files:**
- Modify: `src/features/projects/projectContextModel.js`
- Modify: `src/features/qa/qaApiAdapter.js`
- Modify: `tests/projectContextModel.test.js`
- Modify: `tests/qaApiAdapter.test.js`
- Create: `.env.example`

**Interfaces:**
- Consumes: 后端项目数组与 `{ graphId, projectId }` 本地配置。
- Produces: `resolveQuestionProjects(projects, config)`；配置项目带 `context_source: 'environment'`，只有真实值才进入 CoD 请求负载。

- [ ] **Step 1: 写图谱配置回退的失败测试**

```js
test('uses a configured graph only when the backend has no usable graph project', () => {
  assert.deepEqual(resolveQuestionProjects([], {
    graphId: 'graph-local',
    projectId: ''
  }), [{
    project_id: 'configured:graph-local',
    graph_id: 'graph-local',
    project_name: '本地配置图谱',
    context_source: 'environment',
    omit_project_id_from_query: true
  }])
})
```

- [ ] **Step 2: 运行测试并确认因函数尚不存在而失败**

Run: `node --test tests/projectContextModel.test.js`

Expected: FAIL，提示 `resolveQuestionProjects` 未导出或不是函数。

- [ ] **Step 3: 实现最小配置回退逻辑**

```js
export function resolveQuestionProjects(projects = [], config = {}) {
  const backendProjects = listGraphProjects(projects)
  if (backendProjects.length) return backendProjects

  const graphId = String(config.graphId ?? '').trim()
  if (!graphId) return []
  const projectId = String(config.projectId ?? '').trim()
  return [{
    project_id: projectId || `configured:${graphId}`,
    graph_id: graphId,
    project_name: '本地配置图谱',
    context_source: 'environment',
    omit_project_id_from_query: !projectId
  }]
}
```

- [ ] **Step 4: 写并验证 CoD 负载不发送合成项目 ID 的失败测试**

```js
test('omits the synthetic project id for graph-only local configuration', () => {
  assert.deepEqual(buildCodQueryPayload({
    question: 'Q',
    project: {
      project_id: 'configured:g1',
      graph_id: 'g1',
      omit_project_id_from_query: true
    }
  }), {
    question: 'Q',
    graph_id: 'g1',
    reasoning_mode: 'auto'
  })
})
```

Run: `node --test tests/qaApiAdapter.test.js`

Expected: FAIL，实际负载仍包含 `project_id`。

- [ ] **Step 5: 仅在值真实存在时写入上下文 ID**

```js
const projectId = String(project?.project_id ?? '').trim()
const graphId = String(project?.graph_id ?? '').trim()
if (projectId && !project?.omit_project_id_from_query) payload.project_id = projectId
if (graphId) payload.graph_id = graphId
```

- [ ] **Step 6: 运行两组测试并添加环境变量示例**

Run: `node --test tests/projectContextModel.test.js tests/qaApiAdapter.test.js`

Expected: PASS。

`.env.example` 内容：

```dotenv
# 可选：后端项目列表暂时没有可用图谱时，用于本地联调
VITE_DEFAULT_GRAPH_ID=
VITE_DEFAULT_PROJECT_ID=
```

- [ ] **Step 7: 提交 Task 1**

```powershell
git add -- src/features/projects/projectContextModel.js src/features/qa/qaApiAdapter.js tests/projectContextModel.test.js tests/qaApiAdapter.test.js .env.example
git commit -m "feat: add configured graph fallback for qa"
```

### Task 2: 预览回答状态与评估隔离

**Files:**
- Modify: `src/features/qa/qaDemoModel.js`
- Modify: `tests/qaApiAdapter.test.js`

**Interfaces:**
- Consumes: `submitQuestion(createQaState(), PREVIEW_QUESTION)` 产生的 loading 状态。
- Produces: `PREVIEW_QUESTION`、`completePreviewAnswer(state)`、`answerSource: null | 'live' | 'preview'`、`canEvaluateAnswer(state)`。

- [ ] **Step 1: 写预览来源和评估隔离的失败测试**

```js
test('marks preview answers and keeps backend identifiers empty', () => {
  const preview = completePreviewAnswer(submitQuestion(createQaState(), PREVIEW_QUESTION))
  assert.equal(preview.phase, 'answered')
  assert.equal(preview.answerSource, 'preview')
  assert.equal(preview.qaRunId, '')
  assert.equal(preview.qaResult, null)
  assert.equal(canEvaluateAnswer(preview), false)
})
```

- [ ] **Step 2: 运行测试并确认缺少新接口而失败**

Run: `node --test tests/qaApiAdapter.test.js`

Expected: FAIL，提示新导出不存在。

- [ ] **Step 3: 实现来源状态和预览完成函数**

```js
export const PREVIEW_QUESTION = '为什么 SiC 含量会影响 ASC 耐火材料的抗氧化性能？'

export function canEvaluateAnswer(state) {
  return state?.phase === 'answered' && state?.answerSource === 'live'
}
```

`createQaState`、`submitQuestion`、`failApiAnswer` 将 `answerSource` 设为 `null`；`completeApiAnswer` 设为 `'live'`；将原有固定回答完成函数命名为 `completePreviewAnswer`，并显式清空后端 ID、设置 `'preview'`。为兼容已有调用保留 `completeMockAnswer` 别名。

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/qaApiAdapter.test.js`

Expected: PASS。

- [ ] **Step 5: 提交 Task 2**

```powershell
git add -- src/features/qa/qaDemoModel.js tests/qaApiAdapter.test.js
git commit -m "feat: distinguish live and preview qa answers"
```

### Task 3: 页面集成、来源提示与完整验证

**Files:**
- Modify: `src/views/AscQaView.vue`
- Modify: `src/features/qa/ConversationPanel.vue`
- Modify: `src/features/qa/EvidencePanel.vue`
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: `resolveQuestionProjects`、`PREVIEW_QUESTION`、`completePreviewAnswer`、`canEvaluateAnswer`。
- Produces: 无图谱时的“预览回答页面”入口，`/?preview=answer` 路由入口，回答来源提示，预览评估禁用状态。

- [ ] **Step 1: 写页面行为的失败契约测试**

```js
test('offers an explicit backend-free answer preview when no graph is available', async () => {
  const view = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const conversation = await readFile(new URL('../src/features/qa/ConversationPanel.vue', import.meta.url), 'utf8')
  const evidence = await readFile(new URL('../src/features/qa/EvidencePanel.vue', import.meta.url), 'utf8')

  assert.match(view, /预览回答页面/)
  assert.match(view, /route\.query\.preview/)
  assert.match(conversation, /界面预览数据，未请求后端/)
  assert.match(evidence, /预览回答不能提交评估/)
})
```

- [ ] **Step 2: 运行测试并确认缺少页面入口而失败**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL，找不到预览入口或提示。

- [ ] **Step 3: 接入自动项目发现和预览入口**

在 `loadProjects()` 中调用：

```js
projects.value = resolveQuestionProjects(projectsFromResponse(response), {
  graphId: import.meta.env.VITE_DEFAULT_GRAPH_ID,
  projectId: import.meta.env.VITE_DEFAULT_PROJECT_ID
})
```

新增 `openAnswerPreview()`，只调用状态模型，不调用 API：

```js
function openAnswerPreview() {
  requestVersion += 1
  qaState.value = completePreviewAnswer(
    submitQuestion(createQaState(), PREVIEW_QUESTION)
  )
  draft.value = ''
}
```

监听 `route.query.preview === 'answer'`，并在无可用图谱提示中显示“预览回答页面”按钮。

- [ ] **Step 4: 显示来源并禁用预览评估**

`ConversationPanel` 在 `state.answerSource === 'preview'` 时显示“界面预览数据，未请求后端”。`EvidencePanel` 新增 `evaluationEnabled` 布尔属性；为 `false` 时显示“预览回答不能提交评估，请先完成一次真实图谱问答”，不渲染人工与 LLM 评估表单。视图中用 `canEvaluateAnswer(qaState)` 传值，并在三个评价处理函数入口再次做保护。

- [ ] **Step 5: 运行定向测试与全量测试**

Run: `node --test tests/ascLabExperience.test.js tests/projectContextModel.test.js tests/qaApiAdapter.test.js`

Expected: PASS。

Run: `node --test tests/*.test.js`

Expected: 全部测试通过，失败数为 0。

- [ ] **Step 6: 运行生产构建**

Run: `npm run build`

Expected: Vite 构建退出码 0，生成 `dist`。

- [ ] **Step 7: 检查差异并提交 Task 3**

```powershell
git diff --check
git status --short
git add -- src/views/AscQaView.vue src/features/qa/ConversationPanel.vue src/features/qa/EvidencePanel.vue tests/ascLabExperience.test.js
git commit -m "feat: add honest qa answer preview fallback"
```
