import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import {
  createAgentSession,
  deleteAgentSession,
  getAgentMetrics,
  getAgentSession,
  listAgentSessions
} from '../src/platform/agent/api.js'
import {
  formatSessionTime,
  mapSessionDetail,
  mapSessionList,
  mapSessionSummary,
  sessionMessagesToChat,
  shortSessionId,
  suggestSessionTitle
} from '../src/platform/agent/sessions.js'

test('session list mapping keeps titles, turn counts and timestamps', () => {
  const list = mapSessionList([
    { sessionId: 's-1', title: '热震稳定性检索', createdAt: '2026-09-16T08:00:00Z', updatedAt: '2026-09-16T09:00:00Z', turns: 2 },
    { sessionId: 's-2', title: '', createdAt: '2026-09-15T08:00:00Z', turns: 0 }
  ])

  assert.deepEqual(list, [
    {
      sessionId: 's-1',
      title: '热震稳定性检索',
      createdAt: '2026-09-16T08:00:00Z',
      updatedAt: '2026-09-16T09:00:00Z',
      turns: 2
    },
    {
      sessionId: 's-2',
      title: '未命名会话',
      createdAt: '2026-09-15T08:00:00Z',
      updatedAt: '2026-09-15T08:00:00Z',
      turns: 0
    }
  ])
})

test('session list mapping tolerates wrappers, snake_case and broken entries', () => {
  assert.deepEqual(mapSessionList(null), [])
  assert.deepEqual(mapSessionList({ sessions: [] }), [])
  assert.deepEqual(mapSessionList([{ title: 'no id' }, null, 'nope']), [])
  assert.equal(mapSessionSummary({ session_id: 's-9', turns: 'x' }).turns, 0)
  assert.equal(mapSessionSummary({ session_id: 's-9', turns: 'x' }).title, '未命名会话')
  assert.deepEqual(mapSessionList({ sessions: [{ sessionId: 's-3' }] })[0], {
    sessionId: 's-3',
    title: '未命名会话',
    createdAt: '',
    updatedAt: '',
    turns: 0
  })
})

test('session detail mapping turns persisted messages into chat messages', () => {
  const detail = mapSessionDetail({
    sessionId: 's-1',
    title: '热震稳定性检索',
    createdAt: '2026-09-16T08:00:00Z',
    updatedAt: '2026-09-16T09:00:00Z',
    messages: [
      { role: 'user', content: '检索热震稳定性' },
      {
        role: 'assistant',
        content: '找到 2 条证据',
        toolCalls: [{ name: 'kg_search', argsSummary: '{"query":"热震"}', ok: true, ms: 1200 }]
      },
      { role: 'assistant', content: '失败的一次', toolCalls: [{ name: 'web_browse', ok: false, ms: 300 }] }
    ]
  })

  assert.equal(detail.title, '热震稳定性检索')
  assert.equal(mapSessionDetail({ messages: [] }), null)

  const messages = sessionMessagesToChat(detail.messages)
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant', 'assistant'])
  assert.equal(messages[0].content, '检索热震稳定性')
  assert.deepEqual(messages[0].toolCalls, [])
  assert.deepEqual(messages[1].toolCalls, [
    {
      id: 'history-1-0-kg_search',
      name: 'kg_search',
      args: {},
      summary: '{"query":"热震"}',
      status: 'ok',
      ok: true,
      resultSummary: '',
      data: null,
      ms: 1200
    }
  ])
  assert.equal(messages[2].toolCalls[0].status, 'error')
  assert.equal(messages[2].toolCalls[0].ok, false)
  assert.equal(messages[2].toolCalls[0].summary, '')
  assert.equal(messages[2].toolCalls[0].ms, 300)
  assert.equal(messages[0].streaming, false)

  assert.deepEqual(sessionMessagesToChat(undefined), [])
})

test('time labels are relative for recent sessions and absolute for old ones', () => {
  const now = Date.parse('2026-09-17T12:00:00Z')
  assert.equal(formatSessionTime('2026-09-17T11:59:30Z', now), '刚刚')
  assert.equal(formatSessionTime('2026-09-17T11:40:00Z', now), '20 分钟前')
  assert.equal(formatSessionTime('2026-09-17T07:00:00Z', now), '5 小时前')
  assert.equal(formatSessionTime('2026-09-15T12:00:00Z', now), '2 天前')
  assert.equal(formatSessionTime('2026-09-01T12:00:00Z', now), '2026-09-01')
  assert.equal(formatSessionTime('not-a-date', now), '')
  assert.equal(formatSessionTime('', now), '')
})

test('session ids and suggested titles stay short', () => {
  assert.equal(shortSessionId('0123456789abcdef'), '01234567')
  assert.equal(shortSessionId(''), '')
  assert.equal(suggestSessionTitle('  用   X_comp 预测  '), '用 X_comp 预测')
  assert.equal(suggestSessionTitle(''), '新会话')
  const long = suggestSessionTitle('检索知识图谱中与热震稳定性相关的全部结论并给出引用')
  assert.equal(long.length, 24)
  assert.ok(long.endsWith('…'))
})

test('the session/metrics client speaks the fixed contract', async () => {
  const seen = []
  let sessionExists = true
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, body: raw })
      const json = payload => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(payload))
      }
      if (request.url === '/api/agent/sessions' && request.method === 'POST') {
        return json({ sessionId: 's-new', title: '新会话', createdAt: 't0' })
      }
      if (request.url === '/api/agent/sessions?limit=5') {
        return json([{ sessionId: 's-1', title: 'A', createdAt: 't0', updatedAt: 't1', turns: 1 }])
      }
      if (request.url === '/api/agent/sessions/s%2F1' && request.method === 'GET') {
        if (!sessionExists) { response.writeHead(404); return response.end('gone') }
        return json({ sessionId: 's/1', title: 'A', messages: [] })
      }
      if (request.url === '/api/agent/sessions/s%2F1' && request.method === 'DELETE') {
        sessionExists = false
        return json({ ok: true, deleted: true })
      }
      if (request.url === '/api/agent/metrics') {
        return json({ turns: 1, toolCalls: 1, toolErrors: 0, tokens: {}, avgTurnMs: 10, tools: {} })
      }
      response.writeHead(500)
      response.end('boom')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  try {
    assert.deepEqual(await createAgentSession({ title: '新会话', baseUrl }), {
      sessionId: 's-new',
      title: '新会话',
      createdAt: 't0'
    })
    const listed = await listAgentSessions({ limit: 5, baseUrl })
    assert.equal(listed.length, 1)
    assert.equal((await getAgentSession('s/1', { baseUrl })).sessionId, 's/1')
    assert.deepEqual(await deleteAgentSession('s/1', { baseUrl }), { ok: true, deleted: true })
    assert.equal((await getAgentMetrics({ baseUrl })).turns, 1)

    assert.deepEqual(seen.map(entry => `${entry.method} ${entry.url}`), [
      'POST /api/agent/sessions',
      'GET /api/agent/sessions?limit=5',
      'GET /api/agent/sessions/s%2F1',
      'DELETE /api/agent/sessions/s%2F1',
      'GET /api/agent/metrics'
    ])
    assert.deepEqual(JSON.parse(seen[0].body), { title: '新会话' })

    await assert.rejects(() => getAgentSession('s/1', { baseUrl }), /会话详情读取失败/)
    const failure = await getAgentMetrics({ baseUrl: `${baseUrl}/missing` }).catch(error => error)
    assert.equal(failure.status, 500, 'HTTP status must stay inspectable for 404/409 handling')
    await assert.rejects(() => getAgentSession('', { baseUrl }), /缺少 sessionId/)
    await assert.rejects(() => deleteAgentSession('  ', { baseUrl }), /缺少 sessionId/)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }

  // 缺少 sessionId 的响应是错误，不能静默返回半成品
  const broken = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ title: 'no id' }))
  })
  await new Promise(resolve => broken.listen(0, '127.0.0.1', resolve))
  try {
    await assert.rejects(
      () => createAgentSession({ baseUrl: `http://127.0.0.1:${broken.address().port}` }),
      /响应缺少 sessionId/
    )
  } finally {
    await new Promise(resolve => broken.close(resolve))
  }
})
