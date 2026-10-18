import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { summarizeToolArgs, toolStatusLabel, useAgentChat } from '../src/platform/agent/useAgentChat.js'
import { sessionMessagesToChat } from '../src/platform/agent/sessions.js'

function startSseServer(handler) {
  const server = createServer(async (request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    await handler(request, response)
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(done => server.close(done))
      })
    })
  })
}

function frame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

test('service answer stays unchanged in SSE display and history, with original quote', async () => {
  const original = '  知识服务原答案\n\n末行\n'
  const citations = [{ evidence_id: 'ref1', text: '服务原始引文' }]
  const answer_check = { status: 'knowledge_service_answer', semantic_support_verified: false }
  const { baseUrl, close } = await startSseServer((_req, response) => {
    response.write(frame({ type: 'final', text: original, citations, answer_check }))
    response.write(frame({ type: 'done', steps: 1 }))
    response.end()
  })
  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('材料问题')
    const assistant = chat.messages.value[1]
    assert.equal(assistant.content, original)
    assert.deepEqual(assistant.citations, citations)
    const restored = sessionMessagesToChat([assistant])[0]
    assert.equal(restored.content, original)
    assert.deepEqual(restored.citations, citations)
    assert.equal(restored.answer_check.semantic_support_verified, false)
  } finally { await close() }
})

test('a streamed turn accumulates text, tool chips, and steps', async () => {
  const { baseUrl, close } = await startSseServer((request, response) => {
    response.write(': ping\n\n')
    response.write(frame({ type: 'turn_started', startedAt: 1000, timeoutMs: 300000 }))
    response.write(frame({ type: 'model_status', status: 'completed', startedAt: 1000, ms: 10 }))
    response.write(frame({ type: 'message_delta', text: '正在' }))
    response.write(frame({ type: 'message_delta', text: '调用预测工具' }))
    response.write(frame({ type: 'tool_call', id: 't1', name: 'predict', args: { X_comp: [[61, 70]] } }))
    response.write(frame({
      type: 'tool_result', id: 't1', name: 'predict', ok: true,
      summary: 'bulk_density≈3.12', data: { bulk_density: 3.12 }
    }))
    response.write(frame({ type: 'final', text: '110℃ 下的体积密度约为 3.12 g/cm³。' }))
    response.write(frame({ type: 'done', steps: 2, timing: { schema: 'agent.timing.v1', totalMs: 20 } }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl, getContext: () => ({ projectId: 'p1' }) })
    await chat.send('用 X_comp=[[61,70]] 预测 110℃ 的体积密度')

    assert.equal(chat.streaming.value, false)
    assert.equal(chat.error.value, '')
    assert.equal(chat.steps.value, 2)
    assert.equal(chat.messages.value.length, 2)
    assert.deepEqual(
      chat.messages.value.map(message => message.role),
      ['user', 'assistant']
    )

    const assistant = chat.messages.value[1]
    assert.equal(assistant.startedAt, 1000)
    assert.equal(assistant.modelStatus.ms, 10)
    assert.equal(assistant.timing.totalMs, 20)
    assert.equal(assistant.content, '110℃ 下的体积密度约为 3.12 g/cm³。')
    assert.equal(assistant.toolCalls.length, 1)
    assert.equal(assistant.toolCalls[0].name, 'predict')
    assert.equal(assistant.toolCalls[0].status, 'ok')
    assert.equal(assistant.toolCalls[0].resultSummary, 'bulk_density≈3.12')
    assert.equal(assistant.toolCalls[0].summary, '{"X_comp":[[61,70]]}')
    assert.equal(assistant.streaming, false)
  } finally {
    await close()
  }
})

test('a failed tool result is marked as an error without losing the reply', async () => {
  const { baseUrl, close } = await startSseServer((request, response) => {
    response.write(frame({ type: 'tool_call', id: 't1', name: 'web_browse', args: { url: 'https://x.example' } }))
    response.write(frame({ type: 'tool_result', id: 't1', name: 'web_browse', ok: false, summary: '域名不在白名单' }))
    response.write(frame({ type: 'final', text: '该域名不在白名单内，无法访问。' }))
    response.write(frame({ type: 'done', steps: 1 }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('打开 https://x.example')
    const assistant = chat.messages.value[1]
    assert.equal(assistant.toolCalls[0].status, 'error')
    assert.equal(toolStatusLabel(assistant.toolCalls[0]), '失败')
    assert.equal(assistant.content, '该域名不在白名单内，无法访问。')
  } finally {
    await close()
  }
})

test('streamed budget rejections keep ok:false and are counted separately from ordinary errors', async () => {
  const { baseUrl, close } = await startSseServer((_request, response) => {
    response.write(frame({ type: 'tool_call', id: 'q', name: 'rag_search', args: {} }))
    response.write(frame({ type: 'tool_result', id: 'q', name: 'rag_search', ok: false, data: { retrieval_budget_exhausted: true } }))
    // Also exercise a resumed result with no preceding tool_call frame.
    response.write(frame({ type: 'tool_result', id: 'q2', name: 'read_evidence', ok: false, data: { quota_exceeded: true } }))
    response.write(frame({ type: 'final', text: '证据不足。' }))
    response.write(frame({ type: 'done', steps: 1 }))
    response.end()
  })
  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('test')
    const tools = chat.messages.value[1].toolCalls
    assert.equal(tools.length, 2)
    assert.ok(tools.every(tool => tool.ok === false && tool.status === 'budget_denied'))
    assert.equal(chat.error.value, '')
    assert.equal(toolStatusLabel(tools[0]), '预算拒绝')
  } finally { await close() }
})

test('an error frame and a transport failure both surface to the panel', async () => {
  const { baseUrl, close } = await startSseServer((request, response) => {
    response.write(frame({ type: 'error', message: '模型服务不可用' }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('你好')
    assert.equal(chat.error.value, '模型服务不可用')
    assert.equal(chat.messages.value[1].error, '模型服务不可用')

    const offline = useAgentChat({ baseUrl: 'http://127.0.0.1:1' })
    await offline.send('你好')
    assert.match(offline.error.value, /fetch|连接|ECONNREFUSED/i)
    assert.equal(offline.streaming.value, false)
  } finally {
    await close()
  }
})

test('stop aborts the stream and marks the assistant turn as stopped', async () => {
  let release
  const blocked = new Promise(resolve => { release = resolve })
  const { baseUrl, close } = await startSseServer(async (request, response) => {
    response.write(frame({ type: 'message_delta', text: '开始' }))
    await blocked
    response.write(frame({ type: 'final', text: '不会再到达' }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl })
    const pending = chat.send('长任务')
    assert.equal(chat.streaming.value, true)
    await new Promise(resolve => setTimeout(resolve, 20))
    chat.stop()
    release()
    await pending

    assert.equal(chat.streaming.value, false)
    const assistant = chat.messages.value[1]
    assert.equal(assistant.stopped, true)
    assert.equal(assistant.content, '开始')
    assert.equal(chat.error.value, '')
  } finally {
    await close()
  }
})

test('reset clears the conversation and loadTools reads the registry', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/api/agent/tools') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ tools: [{ name: 'predict', description: '预测' }] }))
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.loadTools()
    assert.deepEqual(chat.tools.value.map(tool => tool.name), ['predict'])
    assert.equal(chat.toolsError.value, '')

    chat.messages.value.push({ id: 'x', role: 'user', content: 'hi', toolCalls: [] })
    chat.reset()
    assert.deepEqual(chat.messages.value, [])
    assert.equal(chat.steps.value, 0)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }

  const broken = useAgentChat({ baseUrl: 'http://127.0.0.1:1' })
  await broken.loadTools()
  assert.deepEqual(broken.tools.value, [])
  assert.ok(broken.toolsError.value)
})

test('tool argument summaries stay on one bounded line', () => {
  assert.equal(summarizeToolArgs(undefined), '')
  assert.equal(summarizeToolArgs({ a: 1 }), '{"a":1}')
  const long = summarizeToolArgs({ X_comp: Array.from({ length: 40 }, () => [1.234, 5.678]) })
  assert.equal(long.length, 150)
  assert.ok(long.endsWith('…'))
})

test('reasoning frames accumulate into the assistant message', async () => {
  const { baseUrl, close } = await startSseServer((request, response) => {
    response.write(frame({ type: 'reasoning_delta', text: '先看 SiC 含量' }))
    response.write(frame({ type: 'reasoning_delta', text: '，再比对证据。' }))
    response.write(frame({ type: 'message_delta', text: '结论' }))
    response.write(frame({ type: 'final', text: '结论如下。' }))
    response.write(frame({ type: 'done', steps: 1 }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('为什么 SiC 影响抗氧化？')

    const assistant = chat.messages.value[1]
    assert.equal(assistant.reasoning, '先看 SiC 含量，再比对证据。')
    assert.equal(assistant.content, '结论如下。')
    assert.equal(chat.error.value, '')
  } finally {
    await close()
  }
})

test('a turn without reasoning leaves the field empty', async () => {
  const { baseUrl, close } = await startSseServer((request, response) => {
    response.write(frame({ type: 'final', text: '直接回答。' }))
    response.write(frame({ type: 'done', steps: 1 }))
    response.end()
  })

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('问一句')
    assert.equal(chat.messages.value[1].reasoning, '')
  } finally {
    await close()
  }
})
