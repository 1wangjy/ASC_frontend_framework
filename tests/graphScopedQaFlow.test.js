import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

import service from '../src/api/index.js'

test('QA discovers graph projects from the backend instead of the local registry', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /listProjects/)
  assert.match(source, /await listProjects\(\{\s*limit:\s*50\s*\}\)/)
  assert.match(source, /route\.query\.projectId/)
  assert.doesNotMatch(source, /getRegisteredProjectIds|getProject\(/)
  assert.doesNotMatch(source, /projectRegistry/)
})

test('invalid QA scope refreshes into manual selection without resending the question', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /requestCodAnswer\(\{\s*codGraphRAGQuery,\s*getProject\s*\}/)
  assert.match(source, /loadProjects\(\{\s*requireManualSelection:\s*true\s*\}\)/)
  assert.match(source, /draft\.value\s*=\s*qaState\.value\.question/)
  assert.match(source, /resolveProjectAfterRefresh/)
})

test('keeps the graph project picker reachable at mobile widths', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const mobileTopbarRule = source.match(
    /@media\s*\(max-width:\s*760px\)[\s\S]*?\.qa-topbar\s*\{([^}]*)\}/
  )

  assert.ok(mobileTopbarRule, 'expected a mobile qa-topbar rule')
  assert.doesNotMatch(mobileTopbarRule[1], /display:\s*none/)
})

test('completed graph builds route to QA and no longer write a local registry', async () => {
  const source = await readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')

  assert.match(source, /navigateGraphProjectToQa/)
  assert.match(source, /completeTaskGraphForQa/)
  assert.match(source, /completeMissingTaskGraphForQa/)
  assert.match(source, /router\.replace\(qaRoute\)/)
  const loadGraphSource = source.slice(
    source.indexOf('const loadGraph = async'),
    source.indexOf('const refreshGraph =')
  )
  assert.match(loadGraphSource, /return true/)
  assert.match(loadGraphSource, /return false/)
  assert.doesNotMatch(source, /registerProject|projectRegistry/)
})

test('keeps a 404 status when the API returns an unrelated error message', async () => {
  const server = createServer((request, response) => {
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ message: 'The route is unavailable' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const originalLocalStorage = globalThis.localStorage
  const originalConsoleError = console.error
  globalThis.localStorage = { getItem: () => null }
  console.error = () => {}

  try {
    await assert.rejects(
      () => service.get(`http://127.0.0.1:${port}/cod-query`),
      (error) => {
        assert.equal(error.message, 'The route is unavailable')
        assert.equal(error.response?.status, 404)
        return true
      }
    )
  } finally {
    globalThis.localStorage = originalLocalStorage
    console.error = originalConsoleError
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('continues API requests when browser storage access is denied', async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ success: true, data: [{ project_id: 'p1', graph_id: 'g1' }] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const originalLocalStorage = globalThis.localStorage

  globalThis.localStorage = {
    getItem() {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  }

  try {
    const response = await service.get(`http://127.0.0.1:${port}/projects`)
    assert.deepEqual(response.data, [{ project_id: 'p1', graph_id: 'g1' }])
  } finally {
    globalThis.localStorage = originalLocalStorage
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('removes the obsolete browser project registry', async () => {
  await assert.rejects(
    access(new URL('../src/features/projects/projectRegistry.js', import.meta.url))
  )

  const [qa, process] = await Promise.all([
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')
  ])
  assert.doesNotMatch(`${qa}\n${process}`, /asc_project_registry|projectRegistry|registerProject|getRegisteredProjectIds/)
})
