# Knowledge Graph API Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the ASC knowledge-graph entry button to one synchronous long-running API request, then safely redirect to the returned graph page or show a retryable error.

**Architecture:** Keep HTTP concerns in the existing Axios-based `src/api/graph.js` module and keep response normalization plus redirect validation in the focused `knowledgeGraphLauncher.js` helper. `KnowledgeView.vue` owns only UI state and navigation: one guarded click starts the request, disables the button while waiting, and either navigates or restores a retryable error state.

**Tech Stack:** Vue 3 Composition API, Vue Router, Axios service wrapper, Node test runner, Vite, Playwright browser verification.

## Global Constraints

- The launch operation is one synchronous `POST` request; do not poll and do not automatically retry.
- Use `VITE_GRAPH_LAUNCH_API` when configured, otherwise use `/api/graph/launch`.
- Allow up to 15 minutes for the backend long request.
- Accept the returned page address from `redirectUrl`, `redirect_url`, or `url`.
- Only navigate to HTTP or HTTPS addresses, including same-origin relative paths.
- While waiting, disable the primary button and show `正在进入…`; on failure, show an actionable message and a clickable `重试` control.
- Do not modify the backend or the reference project at `D:\ASC-platform-master`.

---

## File Structure

- `src/api/graph.js`: owns the graph-launch HTTP request and its explicit long timeout.
- `src/features/knowledge/knowledgeGraphLauncher.js`: normalizes supported backend response fields and validates redirect safety without depending on Vue or Axios.
- `src/views/KnowledgeView.vue`: owns loading/error presentation and internal versus external navigation.
- `tests/ascLabExperience.test.js`: covers the API contract, normalization, unsafe URLs, failed requests, and required UI states.
- `docs/superpowers/verification/`: stores browser screenshots for loading, error, and successful navigation states.

### Task 1: Lock Down the Launch Contract with Failing Tests

**Files:**
- Modify: `tests/ascLabExperience.test.js`

**Interfaces:**
- Consumes: existing `requestGraphLaunch(options)` helper and source files.
- Produces: executable requirements for `launchKnowledgeGraph(endpoint)`, address normalization, safety validation, loading copy, retry copy, and double-click prevention.

- [ ] **Step 1: Replace the local-fallback test with a synchronous API result test**

```js
test('waits for the graph launch API and normalizes its returned page address', async () => {
  let requestedEndpoint = ''
  const result = await launcher.requestGraphLaunch({
    endpoint: '/api/graph/launch',
    launchApi: async endpoint => {
      requestedEndpoint = endpoint
      return {
        redirect_url: 'https://graph.example.com/session/42',
        graph_session_id: '42'
      }
    },
    currentOrigin: 'http://localhost'
  })

  assert.equal(requestedEndpoint, '/api/graph/launch')
  assert.deepEqual(result, {
    redirectUrl: 'https://graph.example.com/session/42',
    graphSessionId: '42'
  })
})
```

- [ ] **Step 2: Add unsafe-address and API-failure tests**

```js
test('rejects an unsafe graph redirect returned by the launch API', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch({
      endpoint: '/api/graph/launch',
      launchApi: async () => ({ url: 'javascript:alert(1)' })
    }),
    /无效的图谱跳转地址/
  )
})

test('keeps the launch API failure available to the retry UI', async () => {
  await assert.rejects(
    launcher.requestGraphLaunch({
      endpoint: '/api/graph/launch',
      launchApi: async () => {
        throw new Error('图谱构建失败，请重试')
      }
    }),
    /图谱构建失败，请重试/
  )
})
```

- [ ] **Step 3: Add source-contract assertions for the Axios call and UI states**

```js
test('uses the shared API client for one long graph launch request', () => {
  const graphApi = read('src/api/graph.js')
  assert.match(graphApi, /export function launchKnowledgeGraph/)
  assert.match(graphApi, /method:\s*['\"]post['\"]/)
  assert.match(graphApi, /timeout:\s*15\s*\*\s*60\s*\*\s*1000/)
})

test('shows a guarded loading state and retry action while launching the graph', () => {
  const view = read('src/views/KnowledgeView.vue')
  assert.match(view, /进入知识图谱/)
  assert.match(view, /正在进入…/)
  assert.match(view, /:disabled=[\"]launching[\"]/)
  assert.match(view, /if \(launching\.value\) return/)
  assert.match(view, />重试<\/button>/)
})
```

- [ ] **Step 4: Run the focused test and verify it fails for the missing API integration**

Run: `node --test tests/ascLabExperience.test.js`

Expected: FAIL because `requestGraphLaunch` still expects `fetchImpl`, `launchKnowledgeGraph` does not exist, and the view still says `打开知识图谱`.

### Task 2: Implement the Long Request and Safe Redirect Result

**Files:**
- Modify: `src/api/graph.js`
- Modify: `src/features/knowledge/knowledgeGraphLauncher.js`

**Interfaces:**
- Consumes: shared Axios `service(config)` whose interceptor resolves with response data.
- Produces: `launchKnowledgeGraph(endpoint?: string): Promise<object>` and `requestGraphLaunch({ endpoint, launchApi, currentOrigin }): Promise<{ redirectUrl: string, graphSessionId?: string }>`.

- [ ] **Step 1: Add the graph-launch API function without automatic retry**

```js
const DEFAULT_GRAPH_LAUNCH_ENDPOINT = '/api/graph/launch'

export function launchKnowledgeGraph(endpoint = DEFAULT_GRAPH_LAUNCH_ENDPOINT) {
  const normalizedEndpoint = String(endpoint ?? '').trim() || DEFAULT_GRAPH_LAUNCH_ENDPOINT
  return service({
    url: normalizedEndpoint,
    method: 'post',
    timeout: 15 * 60 * 1000
  })
}
```

- [ ] **Step 2: Replace fetch and local fallback with an injected API function**

```js
export function getGraphRedirectUrl(payload = {}) {
  return String(payload.redirectUrl ?? payload.redirect_url ?? payload.url ?? '').trim()
}

export async function requestGraphLaunch({
  endpoint = '/api/graph/launch',
  launchApi,
  currentOrigin = 'http://localhost'
} = {}) {
  if (typeof launchApi !== 'function') {
    throw new Error('当前浏览器无法连接图谱服务')
  }

  const payload = await launchApi(String(endpoint ?? '').trim() || '/api/graph/launch')
  const redirectUrl = getGraphRedirectUrl(payload)
  if (!isSafeGraphRedirect(redirectUrl, currentOrigin)) {
    throw new Error('无效的图谱跳转地址')
  }

  const graphSessionId = payload.graphSessionId ?? payload.graph_session_id
  return {
    redirectUrl,
    ...(graphSessionId ? { graphSessionId } : {})
  }
}
```

- [ ] **Step 3: Run the focused test and confirm only the view integration remains failing**

Run: `node --test tests/ascLabExperience.test.js`

Expected: API and launcher assertions PASS; UI copy/guard assertion still FAIL.

### Task 3: Implement Loading, Failure Retry, and Navigation UI

**Files:**
- Modify: `src/views/KnowledgeView.vue`

**Interfaces:**
- Consumes: `launchKnowledgeGraph(endpoint)` and `requestGraphLaunch(options)`.
- Produces: the user-facing synchronous launch flow on `/knowledge`.

- [ ] **Step 1: Inject the shared API function and guard repeated clicks**

```js
import { launchKnowledgeGraph } from '../api/graph.js'

async function launchGraph() {
  if (launching.value) return
  launching.value = true
  launchError.value = ''

  try {
    const result = await requestGraphLaunch({
      endpoint: import.meta.env.VITE_GRAPH_LAUNCH_API || '/api/graph/launch',
      launchApi: launchKnowledgeGraph,
      currentOrigin: window.location.origin
    })

    if (result.redirectUrl.startsWith('/') && !result.redirectUrl.startsWith('//')) {
      await router.push(result.redirectUrl)
    } else {
      window.location.assign(result.redirectUrl)
    }
  } catch (error) {
    launchError.value = error instanceof Error
      ? error.message
      : '图谱服务暂时不可用，请稍后重试'
  } finally {
    launching.value = false
  }
}
```

- [ ] **Step 2: Update the button to show a spinner and the required copy**

```vue
<button type="button" :disabled="launching" @click="launchGraph">
  <AscIcon v-if="launching" class="launch-spinner" name="refresh" />
  <span>{{ launching ? '正在进入…' : '进入知识图谱' }}</span>
  <AscIcon v-if="!launching" name="chevron" />
</button>
```

- [ ] **Step 3: Add motion-aware spinner styling**

```css
.launch-spinner {
  animation: launch-spin 0.9s linear infinite;
}

@keyframes launch-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .launch-spinner { animation: none; }
}
```

- [ ] **Step 4: Run the focused test and verify all launch tests pass**

Run: `node --test tests/ascLabExperience.test.js`

Expected: PASS.

### Task 4: Verify the Complete User Flow

**Files:**
- Create: `docs/superpowers/verification/2026-08-03-graph-launch-loading.png`
- Create: `docs/superpowers/verification/2026-08-03-graph-launch-error.png`
- Create: `docs/superpowers/verification/2026-08-03-graph-launch-success.png`

**Interfaces:**
- Consumes: built Vue application and `/api/graph/launch` browser interception.
- Produces: visual evidence for waiting, retry, and successful same-origin navigation.

- [ ] **Step 1: Start the Vite preview server**

Run: `npm run build` then `npm run preview -- --host 127.0.0.1 --port 4173`

Expected: preview is available at `http://127.0.0.1:4173/knowledge`.

- [ ] **Step 2: Verify the loading state with a delayed successful response**

Intercept `**/api/graph/launch`, delay its response, click `进入知识图谱`, and assert that the button is disabled and reads `正在进入…`. Save the loading screenshot.

- [ ] **Step 3: Verify failure recovery and retry**

Return HTTP 500 with `{ "message": "图谱服务暂时不可用，请稍后重试" }`, assert the alert and enabled `重试` action, then save the error screenshot.

- [ ] **Step 4: Verify successful internal navigation**

On the retry request, return `{ "redirect_url": "/knowledge/explorer" }`, click `重试`, assert the URL ends in `/knowledge/explorer`, and save the success screenshot.

- [ ] **Step 5: Run the full verification suite**

Run: `$testFiles = Get-ChildItem tests -Filter *.test.js | ForEach-Object { $_.FullName }; node --test $testFiles`

Expected: every test passes with zero failures.

Run: `npm run build`

Expected: Vite production build succeeds.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit the verified implementation**

```bash
git add src/api/graph.js src/features/knowledge/knowledgeGraphLauncher.js src/views/KnowledgeView.vue tests/ascLabExperience.test.js docs/superpowers/verification
git commit -m "feat: connect synchronous knowledge graph launch"
```
