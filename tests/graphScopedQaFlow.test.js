import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

import service from '../src/api/index.js'

function extractBlockAfter(source, marker) {
  const markerIndex = source.indexOf(marker)
  assert.notEqual(markerIndex, -1, `expected ${marker}`)

  const signatureEnd = marker.includes('function')
    ? source.indexOf(')', markerIndex) + 1
    : markerIndex
  const blockStart = source.indexOf('{', signatureEnd)
  let depth = 0
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(markerIndex, index + 1)
  }

  throw new Error(`expected a closing block for ${marker}`)
}

test('QA discovers only joined completed-report projects through the qualification controller', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /createQaProjectContextController/)
  assert.match(source, /listReports/)
  assert.match(source, /QaProjectSelector/)
  assert.doesNotMatch(source, /getRegisteredProjectIds/)
  assert.doesNotMatch(source, /projectRegistry/)
})

test('invalid QA scope refreshes into manual selection without resending the question', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const invalidScopeRecovery = extractBlockAfter(source, 'if (isInvalidGraphScopeError(error))')

  assert.match(source, /requestCodAnswer\(\{\s*codGraphRAGQuery,\s*getProject\s*\}/)
  assert.match(invalidScopeRecovery, /draft\.value\s*=\s*qaState\.value\.question/)
  assert.match(invalidScopeRecovery, /await\s+refreshQualifiedProjects\(\{\s*requireManualSelection:\s*true\s*\}\)/)
  assert.doesNotMatch(invalidScopeRecovery, /sendQuestion\s*\(/)
  assert.match(source, /qaProjectContext\.clear\(\)/)
})

test('QA reloads projects when graph completion revision increases without owning the monitor lifecycle', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /import\s*\{\s*useGraphTaskMonitor\s*\}\s*from\s*'\.\.\/features\/tasks\/graphTaskMonitor\.js'/)
  assert.match(source, /const graphTaskMonitor = useGraphTaskMonitor\(\)/)
  assert.match(
    source,
    /watch\(\s*\(\)\s*=>\s*graphTaskMonitor\.state\.completedRevision\s*,\s*\(current, previous\)\s*=>\s*\{\s*if\s*\(current > previous\)\s*refreshQualifiedProjects\(\)\s*}\s*\)/
  )
  assert.doesNotMatch(source, /graphTaskMonitor\.(?:start|stop)\s*\(/)
})

test('QA delegates race-safe project refresh state to the qualification controller', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /const qaProjectContext = createQaProjectContextController\(/)
  assert.match(source, /onChange\(snapshot\)/)
  assert.doesNotMatch(source, /projectsRequestVersion/)
})

test('opens the qualified project selector from the existing control without a Process route', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /qa-project-picker|changeActiveProject|<select/)
  assert.match(source, /qa-project-context/)
  assert.match(source, /当前图谱/)
  assert.match(source, /更换图谱/)
  assert.match(source, /@click="selectorOpen = true"/)
  assert.doesNotMatch(source, /name:\s*'Process'/)
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
