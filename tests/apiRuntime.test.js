import test from 'node:test'
import assert from 'node:assert/strict'

import viteConfig from '../vite.config.js'

test('normalizes configured API bases and keeps development URLs relative', async () => {
  const runtime = await import('../src/api/runtime.js').catch(() => ({}))

  assert.equal(typeof runtime.normalizeApiBaseUrl, 'function')
  assert.equal(runtime.normalizeApiBaseUrl('http://127.0.0.1:5002/'), 'http://127.0.0.1:5002')
  assert.equal(runtime.buildApiUrl('/api/pdf-library/files/1', ''), '/api/pdf-library/files/1')
  assert.equal(
    runtime.buildApiUrl('/api/report/1', 'http://127.0.0.1:5002/'),
    'http://127.0.0.1:5002/api/report/1'
  )
})

test('keeps the frontend on 3000 and proxies API requests to 5002', () => {
  assert.equal(viteConfig.server.port, 3000)
  assert.equal(viteConfig.server.strictPort, true)
  assert.equal(viteConfig.server.proxy['/api'].target, 'http://127.0.0.1:5002')
})

test('builds PDF resource URLs through the same-origin development proxy', async () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  try {
    globalThis.localStorage = { getItem: () => null }
    const pdfLibrary = await import('../src/api/pdfLibrary.js').catch(() => ({}))

    assert.equal(typeof pdfLibrary.getPdfPreviewUrl, 'function')
    assert.equal(
      pdfLibrary.getPdfPreviewUrl('paper-1'),
      '/api/pdf-library/files/paper-1/preview?user=local-asc-analyst'
    )
    assert.equal(
      pdfLibrary.getPdfDownloadUrl('paper-1'),
      '/api/pdf-library/files/paper-1/download?user=local-asc-analyst'
    )
  } finally {
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    else delete globalThis.localStorage
  }
})

test('percent-encodes the browser user ID in PDF resource URLs', async () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  try {
    globalThis.localStorage = { getItem: () => 'analyst /?&=' }
    const pdfLibrary = await import('../src/api/pdfLibrary.js')

    assert.equal(
      pdfLibrary.getPdfPreviewUrl('paper-1'),
      '/api/pdf-library/files/paper-1/preview?user=analyst%20%2F%3F%26%3D'
    )
    assert.equal(
      pdfLibrary.getPdfDownloadUrl('paper-1'),
      '/api/pdf-library/files/paper-1/download?user=analyst%20%2F%3F%26%3D'
    )
  } finally {
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    else delete globalThis.localStorage
  }
})

test('falls back when accessing browser storage throws for PDF resource URLs', async () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage access denied')
      }
    })
    const pdfLibrary = await import('../src/api/pdfLibrary.js')

    assert.equal(
      pdfLibrary.getPdfPreviewUrl('paper-1'),
      '/api/pdf-library/files/paper-1/preview?user=local-asc-analyst'
    )
    assert.equal(
      pdfLibrary.getPdfDownloadUrl('paper-1'),
      '/api/pdf-library/files/paper-1/download?user=local-asc-analyst'
    )
  } finally {
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    else delete globalThis.localStorage
  }
})
