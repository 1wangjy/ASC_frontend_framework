import test from 'node:test'
import assert from 'node:assert/strict'

import service from '../src/api/index.js'
import { deleteReport, downloadReport, getReportStatus, listReports } from '../src/api/report.js'

test('polls report status with the backend task-id POST contract', async () => {
  const originalAdapter = service.defaults.adapter
  let requestConfig

  service.defaults.adapter = async config => {
    requestConfig = config
    return {
      data: { success: true, data: { status: 'processing' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {}
    }
  }

  try {
    const result = await getReportStatus({ taskId: 'task-7' })

    assert.equal(result.success, true)
    assert.equal(requestConfig.method, 'post')
    assert.equal(requestConfig.url, '/api/report/generate/status')
    assert.deepEqual(JSON.parse(requestConfig.data), { task_id: 'task-7' })
  } finally {
    service.defaults.adapter = originalAdapter
  }
})

test('lists saved reports through the read-only backend endpoint', async () => {
  const originalAdapter = service.defaults.adapter
  let requestConfig

  service.defaults.adapter = async config => {
    requestConfig = config
    return {
      data: { success: true, data: [], count: 0 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {}
    }
  }

  try {
    const result = await listReports({ limit: 50 })

    assert.equal(result.success, true)
    assert.equal(requestConfig.method, 'get')
    assert.equal(requestConfig.url, '/api/report/list')
    assert.deepEqual(requestConfig.params, { limit: 50 })
    assert.equal(requestConfig.data, undefined)
  } finally {
    service.defaults.adapter = originalAdapter
  }
})

test('downloads reports as a Blob payload rather than response metadata', async () => {
  const originalAdapter = service.defaults.adapter
  let requestConfig
  const blob = new Blob(['# report'], { type: 'text/markdown' })

  service.defaults.adapter = async config => {
    requestConfig = config
    return {
      data: blob,
      status: 200,
      statusText: 'OK',
      headers: { 'content-disposition': 'attachment; filename=ignored.md' },
      config,
      request: {}
    }
  }

  try {
    const result = await downloadReport('report / 1')

    assert.equal(result, blob)
    assert.equal(requestConfig.method, 'get')
    assert.equal(requestConfig.url, '/api/report/report%20%2F%201/download')
    assert.equal(requestConfig.responseType, 'blob')
  } finally {
    service.defaults.adapter = originalAdapter
  }
})

test('deletes one saved report through the encoded backend endpoint', async () => {
  const originalAdapter = service.defaults.adapter
  let requestConfig

  service.defaults.adapter = async config => {
    requestConfig = config
    return {
      data: { success: true, message: 'deleted' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {}
    }
  }

  try {
    const result = await deleteReport('report / 1')
    assert.equal(result.success, true)
    assert.equal(requestConfig.method, 'delete')
    assert.equal(requestConfig.url, '/api/report/report%20%2F%201')
    assert.equal(requestConfig.data, undefined)
  } finally {
    service.defaults.adapter = originalAdapter
  }
})
