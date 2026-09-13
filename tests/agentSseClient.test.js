import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import {
  createSseParser,
  getAgentTools,
  streamAgent
} from '../src/platform/agent/api.js'

test('parses frames split across chunks, CRLF, and heartbeats', () => {
  const parser = createSseParser()
  assert.deepEqual(parser.push(': ping\n\n'), [])
  assert.deepEqual(parser.push('data: {"type":"message_delta","text":"你'), [])
  assert.deepEqual(
    parser.push('好"}\n\ndata: {"type":"tool_call","id":"c1","na'),
    [{ type: 'message_delta', text: '你好' }]
  )
  const events = parser.push('me":"predict","args":{"X_comp":[[61,70]]}}\r\n\r\n')
  assert.deepEqual(events, [
    { type: 'tool_call', id: 'c1', name: 'predict', args: { X_comp: [[61, 70]] } }
  ])
})

test('emits one event per frame and tolerates a trailing buffer without blank line', () => {
  const parser = createSseParser()
  const events = parser.push(
    'data: {"type":"final","text":"答案"}\n\ndata: {"type":"done","steps":2}\n'
  )
  assert.deepEqual(events, [{ type: 'final', text: '答案' }])
  assert.deepEqual(parser.flush(), [{ type: 'done', steps: 2 }])
})

test('surfaces non-JSON payloads instead of throwing', () => {
  const parser = createSseParser()
  assert.deepEqual(parser.push('data: not-json\n\n'), [{ type: 'invalid', raw: 'not-json' }])
})

test('streams tool_call, tool_result, final and done frames in order', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/agent/stream')
    assert.equal(request.method, 'POST')
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(': ping\n\n')
    response.write('data: {"type":"message_delta","text":"正在调用预测工具"}\n\n')
    response.write('data: {"type":"tool_call","id":"t1","name":"predict","args":{"X_comp":[[61,70]]}}\n\n')
    response.write('data: {"type":"tool_result","id":"t1","name":"predict","ok":true,')
    response.write('"summary":"bulk_density≈3.12","data":{"bulk_density":3.12}}\n\n')
    response.write('data: {"type":"final","text":"预测结果为 3.12 g/cm³"}\n\n')
    response.write('data: {"type":"done","steps":2}\n\n')
    response.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  const received = []
  let sentBody = null
  server.on('request', request => {
    let raw = ''
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => { sentBody = JSON.parse(raw) })
  })

  try {
    await streamAgent({
      messages: [{ role: 'user', content: '预测 bulk_density' }],
      context: { projectId: 'p1' },
      options: { allowTools: ['predict'] },
      baseUrl: `http://127.0.0.1:${port}`,
      onEvent: event => received.push(event)
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
  }

  assert.deepEqual(received.map(event => event.type), [
    'message_delta', 'tool_call', 'tool_result', 'final', 'done'
  ])
  assert.deepEqual(received[2], {
    type: 'tool_result',
    id: 't1',
    name: 'predict',
    ok: true,
    summary: 'bulk_density≈3.12',
    data: { bulk_density: 3.12 }
  })
  assert.equal(received[4].steps, 2)
  assert.deepEqual(sentBody, {
    messages: [{ role: 'user', content: '预测 bulk_density' }],
    context: { projectId: 'p1' },
    options: { allowTools: ['predict'] }
  })
})

test('getAgentTools returns the registry and rejects on HTTP errors', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/api/agent/tools') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        tools: [{ name: 'predict', description: '预测', parameters: { type: 'object' } }]
      }))
      return
    }
    response.writeHead(500)
    response.end('boom')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    const tools = await getAgentTools({ baseUrl: `http://127.0.0.1:${port}` })
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'predict')
    await assert.rejects(
      () => getAgentTools({ baseUrl: `http://127.0.0.1:${port}/missing` }),
      /工具清单读取失败/
    )
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
