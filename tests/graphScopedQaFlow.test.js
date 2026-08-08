import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('QA discovers graph projects from the backend instead of the local registry', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')

  assert.match(source, /listProjects/)
  assert.match(source, /await listProjects\(\{\s*limit:\s*50\s*\}\)/)
  assert.match(source, /route\.query\.projectId/)
  assert.doesNotMatch(source, /getRegisteredProjectIds|getProject\(/)
  assert.doesNotMatch(source, /projectRegistry/)
})
