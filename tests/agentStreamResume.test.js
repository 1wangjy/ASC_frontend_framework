import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { createSseParser } from '../src/platform/agent/api.js'
import { RETRY_HINT, useAgentChat } from '../src/platform/agent/useAgentChat.js'

/** 事件流服务：每次 POST /api/agent/stream 交给下一个 responder，并记录请求体。 */
function startStreamServer(responders) {
  const requests = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk })
    request.on('end', async () => {
      let body = null
      try { body = JSON.parse(raw) } catch (_error) { body = raw }
      requests.push(body)
      if (request.url !== '/api/agent/stream') {
        response.writeHead(404)
        response.end('{}')
        return
      }
      const responder = responders[Math.min(requests.length - 1, responders.length - 1)]
      await responder({ request, response, body, index: requests.length - 1 })
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise(done => server.close(done))
      })
    })
  })
}

function framed(id, payload, { crlf = false } = {}) {
  const separator = crlf ? '\r\n' : '\n'
  return `id: ${id}${separator}data: ${JSON.stringify(payload)}${separator}${separator}`
}

function sseHeaders(response) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
}

test('the parser keeps `id:` lines and ignores heartbeats', () => {
  const parser = createSseParser()
  assert.deepEqual(
    parser.push('id: 1\ndata: {"type":"message_delta","text":"甲"}\n\n: ping\n\n'),
    [{ type: 'message_delta', text: '甲', eventId: 1 }]
  )
  // 帧内多行顺序颠倒、CRLF、非数字 id 都要容错
  assert.deepEqual(
    parser.push('data: {"type":"done","steps":1}\r\nid: abc\r\n\r\n'),
    [{ type: 'done', steps: 1, eventId: 'abc' }]
  )
  // 没有 id 的帧不带 eventId（旧行为逐字节不变）
  assert.deepEqual(parser.push('data: {"type":"final","text":"乙"}\n\n'), [{ type: 'final', text: '乙' }])
  assert.deepEqual(parser.flush(), [])
})

test('a turn timeout exposes a resume point and continues the same bubble', async () => {
  const { baseUrl, requests, close } = await startStreamServer([
    // 第一次：跑到第 3 个事件时整轮超时（error + done）
    ({ response }) => {
      sseHeaders(response)
      response.write(': ping\n\n')
      response.write(framed(1, { type: 'message_delta', text: '正在' }))
      response.write(framed(2, { type: 'tool_call', id: 't1', name: 'predict', args: { X_comp: [[61, 70]] } }))
      response.write(framed(3, { type: 'error', message: '整轮超过 300000ms 上限', code: 'turn_timeout' }))
      response.write(framed(4, { type: 'done', steps: 1, sessionId: 's-1', turnIndex: 0 }))
      response.end()
    },
    // 第二次（续传）：故意重叠重放 1–4，然后给出真正的续帧
    ({ response }) => {
      sseHeaders(response)
      for (const [id, payload] of [
        [1, { type: 'message_delta', text: '正在' }],
        [2, { type: 'tool_call', id: 't1', name: 'predict', args: { X_comp: [[61, 70]] } }],
        [4, { type: 'done', steps: 1, sessionId: 's-1', turnIndex: 0 }],
        [5, { type: 'message_delta', text: '补齐' }],
        [6, { type: 'tool_result', id: 't1', name: 'predict', ok: true, summary: 'bulk_density≈3.12', data: { bulk_density: 3.12 } }],
        [7, { type: 'final', text: '续传完成：3.12 g/cm³' }],
        [8, { type: 'done', steps: 2, sessionId: 's-1', turnIndex: 0 }]
      ]) response.write(framed(id, payload))
      response.end()
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('预测体积密度')

    assert.equal(chat.sessionId.value, 's-1')
    assert.equal(chat.lastEventId.value, 4)
    assert.equal(chat.streaming.value, false)
    assert.equal(chat.canRetry.value, true, 'a timed-out turn with a session must be resumable')

    const assistant = chat.messages.value[1]
    assert.equal(assistant.content, '正在')
    assert.equal(assistant.error, '整轮超过 300000ms 上限')
    assert.equal(assistant.toolCalls[0].status, 'running')

    assert.equal(await chat.retry(), true)
    assert.equal(chat.canRetry.value, false)
    assert.equal(chat.streaming.value, false)

    // 续传请求体：只带会话与断点，不重发历史
    assert.deepEqual(requests[1], { messages: [], sessionId: 's-1', resumeFromEventId: 4 })

    // 续传的 final 覆盖旧文本（与首轮行为一致），工具卡片被补齐而不是重建
    assert.equal(assistant.content, '续传完成：3.12 g/cm³')
    assert.equal(assistant.error, '')
    assert.equal(assistant.toolCalls.length, 1)
    assert.equal(assistant.toolCalls[0].status, 'ok')
    assert.equal(assistant.toolCalls[0].resultSummary, 'bulk_density≈3.12')
    assert.equal(assistant.toolCalls[0].data.bulk_density, 3.12)
    assert.equal(chat.steps.value, 2)
    assert.equal(chat.messages.value.length, 2, 'resume must not add another bubble')
    assert.match(RETRY_HINT, /重放/)
  } finally {
    await close()
  }
})

test('overlapping replay is dropped frame by frame', async () => {
  const { baseUrl, close } = await startStreamServer([
    ({ response }) => {
      sseHeaders(response)
      response.write(framed(1, { type: 'message_delta', text: '正在' }))
      response.write(framed(2, { type: 'tool_call', id: 't1', name: 'kg_search', args: { query: '热震' } }))
      response.write(framed(3, { type: 'error', message: '整轮超时', code: 'turn_timeout' }))
      response.write(framed(4, { type: 'done', steps: 1, sessionId: 's-9', turnIndex: 0 }))
      response.end()
    },
    ({ response }) => {
      sseHeaders(response)
      // 服务端从 0 号帧开始重放（保守实现）：1–4 全部是客户端已经处理过的
      for (const [id, payload] of [
        [1, { type: 'message_delta', text: '正在' }],
        [2, { type: 'tool_call', id: 't1', name: 'kg_search', args: { query: '热震' } }],
        [3, { type: 'error', message: '整轮超时', code: 'turn_timeout' }],
        [4, { type: 'done', steps: 1, sessionId: 's-9', turnIndex: 0 }],
        [5, { type: 'message_delta', text: '补齐' }],
        [6, { type: 'tool_result', id: 't1', name: 'kg_search', ok: true, summary: '2 条证据' }],
        [7, { type: 'done', steps: 2, sessionId: 's-9', turnIndex: 0 }]
      ]) response.write(framed(id, payload))
      response.end()
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('检索')
    const assistant = chat.messages.value[1]
    assert.equal(await chat.retry(), true)

    assert.equal(assistant.content, '正在补齐', 'replayed deltas must not be appended twice')
    assert.equal(assistant.error, '', 'the replayed error frame must not come back')
    assert.equal(assistant.toolCalls.length, 1, 'the replayed tool_call must not create a second card')
    assert.equal(assistant.toolCalls[0].status, 'ok')
    assert.equal(assistant.toolCalls[0].resultSummary, '2 条证据')
    assert.equal(chat.lastEventId.value, 7)
  } finally {
    await close()
  }
})

test('a dropped stream keeps the session and resumes from the last seen event', async () => {
  const { baseUrl, requests, close } = await startStreamServer([
    // 第一轮正常结束，拿到 sessionId
    ({ response }) => {
      sseHeaders(response)
      response.write(framed(1, { type: 'final', text: '第一轮' }))
      response.write(framed(2, { type: 'done', steps: 1, sessionId: 's-2', turnIndex: 0 }))
      response.end()
    },
    // 第二轮：一个帧都没发就断开连接（模拟网络中断）
    ({ response }) => {
      sseHeaders(response)
      response.destroy()
    },
    // 续传
    ({ response }) => {
      sseHeaders(response)
      response.write(': ping\n\n')
      response.write(framed(3, { type: 'final', text: '续传结果' }))
      response.write(framed(4, { type: 'done', steps: 2, sessionId: 's-2', turnIndex: 1 }))
      response.end()
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('第一问')
    assert.equal(chat.sessionId.value, 's-2')
    assert.equal(chat.canRetry.value, false)

    await chat.send('第二问')
    assert.equal(chat.sessionId.value, 's-2', 'the second turn must reuse the session')
    assert.match(chat.error.value, /./)
    assert.equal(chat.errorCode.value, 'stream_dropped')
    assert.equal(chat.canRetry.value, true)
    assert.equal(chat.lastEventId.value, 2, 'the resume point stays at the last frame of the first turn')

    assert.equal(await chat.retry(), true)
    // 没收到任何帧时必须从 0 请求重放（否则会漏掉服务端已缓冲的帧）
    assert.deepEqual(requests[2], { messages: [], sessionId: 's-2', resumeFromEventId: 2 })
    assert.equal(chat.messages.value[3].content, '续传结果')
    assert.equal(chat.canRetry.value, false)
    assert.equal(chat.error.value, '')
  } finally {
    await close()
  }
})

test('a stream that never produced an event resumes from 0', async () => {
  const { baseUrl, requests, close } = await startStreamServer([
    ({ response }) => { sseHeaders(response); response.write(framed(1, { type: 'done', steps: 0, sessionId: 's-3', turnIndex: 0 })); response.end() },
    ({ response }) => { sseHeaders(response); response.destroy() },
    ({ response }) => { sseHeaders(response); response.write(framed(1, { type: 'final', text: '好' })); response.write(framed(2, { type: 'done', steps: 1, sessionId: 's-3', turnIndex: 1 })); response.end() }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    await chat.send('一')
    await chat.send('二')
    assert.equal(chat.lastEventId.value, 1)
    await chat.retry()
    assert.deepEqual(requests[2], { messages: [], sessionId: 's-3', resumeFromEventId: 1 })
  } finally {
    await close()
  }
})

test('an unknown session is dropped instead of offering an impossible resume', async () => {
  const { baseUrl, close } = await startStreamServer([
    ({ response }) => {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ code: 404, message: 'unknown sessionId "s-stale"' }))
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    chat.adoptSession('s-stale')
    await chat.send('还在吗')
    assert.equal(chat.sessionId.value, '')
    assert.equal(chat.canRetry.value, false)
    assert.equal(chat.errorCode.value, 'session_missing')
    assert.match(chat.error.value, /会话已失效/)
    assert.equal(chat.messages.value[1].error, chat.error.value)
  } finally {
    await close()
  }
})

test('a concurrent turn on the same session surfaces 409 without a retry button', async () => {
  const { baseUrl, close } = await startStreamServer([
    ({ response }) => {
      response.writeHead(409, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ code: 409, message: 'session s-1 already has a running turn' }))
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    chat.adoptSession('s-1')
    await chat.send('并发')
    assert.equal(chat.sessionId.value, 's-1')
    assert.equal(chat.canRetry.value, false)
    assert.equal(chat.errorCode.value, 'turn_in_progress')
    assert.match(chat.error.value, /正在执行上一轮/)
  } finally {
    await close()
  }
})

test('a clean turn clears the resume point and carries the sessionId', async () => {
  const { baseUrl, requests, close } = await startStreamServer([
    ({ response }) => {
      sseHeaders(response)
      response.write(framed(1, { type: 'message_delta', text: '好' }))
      response.write(framed(2, { type: 'final', text: '完成' }))
      response.write(framed(3, { type: 'done', steps: 1, sessionId: 's-4', turnIndex: 3 }))
      response.end()
    }
  ])

  try {
    const chat = useAgentChat({ baseUrl })
    chat.adoptSession('s-4')
    await chat.send('问')
    assert.equal(chat.turnIndex.value, 3)
    assert.equal(chat.canRetry.value, false)
    assert.equal(chat.lastEventId.value, 3)
    assert.equal(requests[0].sessionId, 's-4')
    assert.equal(requests[0].resumeFromEventId, undefined)
    assert.deepEqual(requests[0].messages, [{ role: 'user', content: '问' }])

    chat.startSession('s-5')
    assert.equal(chat.sessionId.value, 's-5')
    assert.equal(chat.lastEventId.value, null)
    assert.deepEqual(chat.messages.value, [])
    assert.equal(chat.canRetry.value, false)
  } finally {
    await close()
  }
})
