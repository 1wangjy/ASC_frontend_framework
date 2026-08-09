import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import service from '../src/api/index.js'
import { generateOntology } from '../src/api/graph.js'

async function runAgainstLocalServer({ statusCode, responseBody }) {
  const attempts = []
  const server = createServer((request, response) => {
    attempts.push({
      method: request.method,
      url: request.url,
      remoteAddress: request.socket.remoteAddress
    })
    request.on('data', () => {})
    request.on('end', () => {
      response.writeHead(statusCode, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(responseBody))
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const originalBaseUrl = service.defaults.baseURL
  const originalTimeout = service.defaults.timeout
  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  service.defaults.baseURL = `http://127.0.0.1:${address.port}`
  service.defaults.timeout = 2000
  console.error = () => {}
  console.warn = () => {}

  try {
    const formData = new FormData()
    formData.append('project_id', 'local-attempt-test')
    await assert.rejects(generateOntology(formData), /unauthorized|resolved failure/i)
  } finally {
    service.defaults.baseURL = originalBaseUrl
    service.defaults.timeout = originalTimeout
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }

  return {
    destination: `127.0.0.1:${address.port}`,
    attempts
  }
}

test('generateOntology itself sends one HTTP request for 401 and success false responses', async () => {
  const unauthorized = await runAgainstLocalServer({
    statusCode: 401,
    responseBody: { success: false, error: 'unauthorized' }
  })
  const resolvedFailure = await runAgainstLocalServer({
    statusCode: 200,
    responseBody: { success: false, error: 'resolved failure' }
  })

  const evidence = {
    unauthorized: unauthorized.attempts.length,
    resolvedFailure: resolvedFailure.attempts.length,
    methods: [...unauthorized.attempts, ...resolvedFailure.attempts].map(attempt => attempt.method),
    destinations: [unauthorized.destination, resolvedFailure.destination]
  }
  console.info(`ACTUAL_HTTP_ATTEMPT_EVIDENCE ${JSON.stringify(evidence)}`)

  assert.deepEqual(evidence, {
    unauthorized: 1,
    resolvedFailure: 1,
    methods: ['POST', 'POST'],
    destinations: [unauthorized.destination, resolvedFailure.destination]
  })
  assert.equal(evidence.destinations.every(destination => destination.startsWith('127.0.0.1:')), true)
})
