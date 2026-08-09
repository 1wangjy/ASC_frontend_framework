import test from 'node:test'
import assert from 'node:assert/strict'

import service from '../src/api/index.js'
import { getReportStatus } from '../src/api/report.js'

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
