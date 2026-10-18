import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { nextTick } from 'vue'
import { mountSfcWithMemoryRouter, findRenderedNode } from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'
import { AGENT_TOOL_PREFS_KEY } from '../src/platform/agent/toolPrefs.js'

// Explicit opt-in: creates a retained test session and incurs real model/API usage.
// This is the actual embedded composer with a memory renderer, NOT browser QA.
test('real Agent composer sends a research question and follow-up, streams tools and restores history',
  { skip: process.env.AGENT_LIVE_SEND !== '1', timeout: 720000 }, async () => {
    const base = process.env.AGENT_LIVE_UI_URL || 'http://127.0.0.1:3005'
    const projectId = process.env.AGENT_LIVE_PROJECT_ID || 'proj_65ac6094e268'
    const graphId = process.env.AGENT_LIVE_GRAPH_ID || 'nexus_2bdcb8bbccb04ea5'
    const questions = ['请检索当前图谱及文献，说明SiC与抗氧化性能有哪些关联，并给出本轮证据引用。',
      '那在1500℃空气气氛下呢？请核对原文条件，不足时说明缺口。']
    const originalFetch = globalThis.fetch
    const originalStorage = globalThis.localStorage
    const values = new Map([[AGENT_TOOL_PREFS_KEY, JSON.stringify({
      disabled: ['predict', 'recipe_optimize', 'web_browse'], readOnly: true,
    })]])
    globalThis.localStorage = { getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
    const report = { schema: 'agent.primary_composer_live.v1', started_at: new Date().toISOString(),
      mode: 'memory-renderer-real-Vite-API; NOT browser visual QA',
      scope: { projectId, graphId }, status: 'failed', turns: [], stream_requests: [] }
    const tracked = []
    let catalogLoaded = false
    globalThis.fetch = async (url, init) => {
      const href = String(url).startsWith('/') ? base + url : String(url)
      const response = await originalFetch(href, init)
      if (href.endsWith('/api/agent/tools') && response.ok) catalogLoaded = true
      if (href.endsWith('/api/agent/stream')) {
        const body = JSON.parse(init.body)
        report.stream_requests.push(body)
        const index = tracked.length
        const copy = response.clone()
        tracked.push(copy.text().then(text => ({ index, http_status: response.status,
          frames: text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))),
        })).catch(error => ({ index, http_status: response.status, transport_error: error.name, frames: [] })))
      }
      return response
    }
    const invoke = async (node, name, value = { preventDefault() {}, stopPropagation() {} }) => {
      assert.ok(node, `missing ${name} target`)
      for (const handler of [node.props[name]].flat()) if (typeof handler === 'function') await handler(value)
      await nextTick()
    }
    let fixture
    const button = label => findRenderedNode(fixture.root, n => n.type === 'button' && renderedText(n).trim() === label)
    const waitFor = async predicate => {
      const deadline = Date.now() + 10000
      while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('UI_state_wait_timeout')
        await new Promise(resolve => setTimeout(resolve, 40))
        await nextTick()
      }
    }
    const mount = async (id = graphId) => {
      catalogLoaded = false
      fixture = await mountSfcWithMemoryRouter('/src/platform/agent/AgentPanel.vue', '/',
        // 会话历史入口只在独立面板存在（嵌入态由页面右侧目录管理）
        { embedded: false, projectId, graphId: id })
      await waitFor(() => catalogLoaded)
    }
    try {
      const files = ['../src/platform/agent/AgentPanel.vue', '../src/platform/agent/useAgentChat.js',
        '../src/platform/agent/runStatus.js', '../src/platform/agent/toolStatus.js', '../backend_impl/src/agent/tools/index.js',
        '../backend_impl/src/agent/route.js', '../backend_impl/src/agent/loop.js']
      report.code_fingerprint = createHash('sha256').update((await Promise.all(files.map(file =>
        readFile(new URL(file, import.meta.url), 'utf8')))).join('\n')).digest('hex')
      await mount()
      for (const question of questions) {
        const started = Date.now()
        console.log(JSON.stringify({ event: 'composer_turn_started', turn: report.turns.length + 1 }))
        await invoke(findRenderedNode(fixture.root, n => n.type === 'textarea'), 'onUpdate:modelValue', question)
        let settled = false
        const pending = invoke(findRenderedNode(fixture.root, n => n.type === 'form'), 'onSubmit')
          .finally(() => { settled = true })
        const observed = { executing: false, tools: false, stop_button: false, model_locked: false }
        while (!settled) {
          await new Promise(resolve => setTimeout(resolve, 100))
          await nextTick()
          const text = renderedText(fixture.root)
          observed.executing ||= text.includes('执行中 · 实时更新')
          observed.tools ||= text.includes('工具执行中；知识服务尚未提供百分比进度')
          observed.stop_button ||= !!button('停止')
          observed.model_locked ||= findRenderedNode(fixture.root, n => n.type === 'select')?.props.disabled === true
        }
        await pending
        const result = await tracked.at(-1)
        const final = result.frames.findLast(frame => frame.type === 'final')
        const errors = result.frames.filter(frame => frame.type === 'error').map(frame => frame.code)
        report.turns.push({ question, ms: Date.now() - started, observed,
          ...result, answer_check: final?.answer_check || null,
          budget_denials: result.frames.filter(frame => frame.type === 'tool_result' && frame.ok === false
            && (frame.data?.quota_exceeded === true || frame.data?.retrieval_budget_exhausted === true)).length })
        if (report.turns.at(-1).budget_denials) assert.ok(renderedText(fixture.root).includes('预算拒绝'))
        console.log(JSON.stringify({ event: 'composer_turn_finished', turn: report.turns.length,
          ms: Date.now() - started, check: final?.answer_check?.status, errors }))
        assert.equal(result.http_status, 200)
        assert.ok(final?.text, 'a visible final answer is required')
        assert.ok(result.frames.some(frame => frame.type === 'done'))
        assert.deepEqual(errors, [])
        for (const call of result.frames.filter(frame => ['kg_graph', 'kg_search', 'rag_search'].includes(frame.name) && frame.type === 'tool_call')) {
          const mismatch = (call.args?.graph_id && call.args.graph_id !== graphId)
            || (call.args?.project_id && call.args.project_id !== projectId) || call.args?.simulation_id
          if (mismatch) {
            const outcome = result.frames.find(frame => frame.type === 'tool_result' && frame.id === call.id)
            assert.equal(outcome?.ok, false)
            assert.equal(outcome?.data?.code, 'scope_mismatch')
            assert.equal(outcome?.data?.request_sent, false)
          }
        }
        assert.ok(renderedText(fixture.root).includes(question))
        assert.ok(observed.executing && observed.stop_button && observed.model_locked)
      }
      const requests = report.stream_requests
      assert.equal(requests.length, 2)
      assert.equal(requests[0].sessionId, requests[1].sessionId)
      assert.deepEqual(requests[0].context, { projectId, graphId })
      assert.deepEqual(requests[1].context, { projectId, graphId })
      assert.ok(report.turns.some(turn => turn.observed.tools), 'real intermediate tool state must be rendered')
      report.session_id = requests[0].sessionId
      const detail = await (await originalFetch(`${base}/api/agent/sessions/${report.session_id}`)).json()
      report.conditions = detail.researchState?.conditions
      assert.ok(JSON.stringify(report.conditions).includes('1500'))
      assert.ok(JSON.stringify(report.conditions).includes('空气'))
      const assistants = detail.messages.filter(message => message.role === 'assistant')
      assert.equal(assistants.length, 2)
      assert.ok(assistants.every(message => message.model?.id === 'default'))
      await fixture.close()
      fixture = null
      await mount()
      await invoke(button('会话历史'), 'onClick')
      await waitFor(() => findRenderedNode(fixture.root, n => n.props.title === `打开会话：${detail.title}`))
      await invoke(findRenderedNode(fixture.root, n => n.props.title === `打开会话：${detail.title}`), 'onClick')
      const restored = renderedText(fixture.root)
      assert.ok(restored.includes(report.session_id.slice(0, 8)))
      for (const question of questions) assert.ok(restored.includes(question))
      const evidence = assistants.flatMap(message => message.evidence || [])
      const citations = assistants.flatMap(message => message.citations || [])
      for (const citation of citations) assert.ok(restored.includes(citation.evidence_id))
      report.restored = { turns: 2, citation_count: citations.length, evidence_count: evidence.length, actual_models: true }
      assert.equal(report.stream_requests.length, 2, 'opening history must not regenerate a model answer')
      await fixture.close()
      fixture = null
      await mount('other-graph-for-scope-check')
      await invoke(button('会话历史'), 'onClick')
      await waitFor(() => findRenderedNode(fixture.root, n => n.props.title === `打开会话：${detail.title}`))
      await invoke(findRenderedNode(fixture.root, n => n.props.title === `打开会话：${detail.title}`), 'onClick')
      assert.ok(renderedText(fixture.root).includes('不属于当前图谱'))
      assert.equal(report.stream_requests.length, 2)
      report.wrong_graph_blocked = true
      report.research_outcomes = report.turns.map(turn => turn.answer_check?.status || 'missing_check')
      report.scope_guard = { checked: true, rejected_calls: report.turns.flatMap(turn => turn.frames)
        .filter(frame => frame.type === 'tool_result' && frame.data?.code === 'scope_mismatch').length }
      report.status = 'composer_ui_chain_passed_not_scientific_acceptance'
    } catch (error) {
      report.error = { name: error.name, message: error.message }
      throw error
    } finally {
      if (fixture) await fixture.close()
      globalThis.fetch = originalFetch
      if (originalStorage === undefined) delete globalThis.localStorage
      else globalThis.localStorage = originalStorage
      report.ended_at = new Date().toISOString()
      const dir = new URL('../backend_impl/data/agent/integration/', import.meta.url)
      await mkdir(dir, { recursive: true })
      const file = new URL(`primary-composer-${Date.now()}.json`, dir)
      await writeFile(file, JSON.stringify(report, null, 2) + '\n')
      console.log(JSON.stringify({ status: report.status, report: file.pathname }))
    }
  })
