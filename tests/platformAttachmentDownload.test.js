import test from 'node:test'
import assert from 'node:assert/strict'

import request from '../src/platform/api/request.js'
import { downloadAttachment } from '../src/platform/api/attachment.js'

test('downloads the GridFS PDF blob with the stored attachment filename', async () => {
  const originalAdapter = request.defaults.adapter
  const events = []
  const link = {
    href: '',
    download: '',
    click() { events.push(`clicked:${this.download}`) },
    remove() { events.push('removed') },
  }
  const browser = {
    document: {
      body: { appendChild: () => events.push('appended') },
      createElement: () => link,
    },
    URL: {
      createObjectURL: (blob) => {
        assert.ok(blob instanceof Blob)
        events.push('created')
        return 'blob:literature-pdf'
      },
      revokeObjectURL: (url) => events.push(`revoked:${url}`),
    },
  }
  let requestConfig

  request.defaults.adapter = async (config) => {
    requestConfig = config
    return {
      data: new Blob(['%PDF-test'], { type: 'application/pdf' }),
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/pdf' },
      config,
      request: {},
    }
  }

  try {
    const filename = await downloadAttachment('耐火 手册.pdf', browser)

    assert.equal(filename, '耐火 手册.pdf')
    assert.equal(requestConfig.method, 'get')
    assert.equal(requestConfig.url, '/api/attachment/%E8%80%90%E7%81%AB%20%E6%89%8B%E5%86%8C.pdf')
    assert.equal(requestConfig.responseType, 'blob')
    assert.equal(link.download, '耐火 手册.pdf')
    assert.deepEqual(events, [
      'created',
      'appended',
      'clicked:耐火 手册.pdf',
      'removed',
      'revoked:blob:literature-pdf',
    ])
  } finally {
    request.defaults.adapter = originalAdapter
  }
})

test('rejects an empty attachment filename without requesting or downloading', async () => {
  const originalAdapter = request.defaults.adapter
  let requested = false

  request.defaults.adapter = async (config) => {
    requested = true
    return { data: new Blob(['unexpected']), status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }

  try {
    await assert.rejects(downloadAttachment('  '), /附件文件名不能为空/)
    assert.equal(requested, false)
  } finally {
    request.defaults.adapter = originalAdapter
  }
})
