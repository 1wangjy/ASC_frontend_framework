import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReportFilename,
  saveReportDownload
} from '../src/features/reports/reportDownload.js'

function createFakeDownloadBrowser(clicks, { includeUrl = true, includeDocument = true } = {}) {
  const browser = {}
  if (includeUrl) {
    browser.URL = {
      createObjectURL: blob => {
        assert.ok(blob instanceof Blob)
        return 'blob:report-download'
      },
      revokeObjectURL: url => clicks.push(`revoked:${url}`)
    }
  }
  if (includeDocument) {
    browser.document = {
      createElement: tagName => {
        assert.equal(tagName, 'a')
        return {
          hidden: false,
          href: '',
          download: '',
          click() { clicks.push(this.download) }
        }
      }
    }
  }
  return browser
}

test('downloads the backend blob with a safe graph-project filename', async () => {
  const clicks = []
  const filename = await saveReportDownload({
    reportId: 'r1',
    projectName: 'Graph?/ Test',
    downloadReport: async () => new Blob(['# report'], { type: 'text/markdown' }),
    browser: createFakeDownloadBrowser(clicks)
  })

  assert.equal(filename, 'Graph-Test-研究报告.md')
  assert.deepEqual(clicks, ['Graph-Test-研究报告.md', 'revoked:blob:report-download'])
})

test('rethrows backend download failures without creating a browser download', async () => {
  const clicks = []
  const backendError = new Error('backend unavailable')

  await assert.rejects(
    saveReportDownload({
      reportId: 'r1',
      projectName: 'Graph',
      downloadReport: async () => { throw backendError },
      browser: createFakeDownloadBrowser(clicks)
    }),
    backendError
  )
  assert.deepEqual(clicks, [])
})

test('rejects an empty backend blob without creating an object URL', async () => {
  const clicks = []
  await assert.rejects(
    saveReportDownload({
      reportId: 'r1',
      projectName: 'Graph',
      downloadReport: async () => new Blob([]),
      browser: createFakeDownloadBrowser(clicks)
    }),
    /可下载的报告文件/
  )
  assert.deepEqual(clicks, [])
})

test('rejects when injected browser download APIs are unavailable', async () => {
  await assert.rejects(
    saveReportDownload({
      reportId: 'r1',
      projectName: 'Graph',
      downloadReport: async () => new Blob(['report']),
      browser: createFakeDownloadBrowser([], { includeUrl: false })
    }),
    /浏览器下载能力/
  )
})

test('uses a safe fallback when every project-name character is invalid', () => {
  assert.equal(buildReportFilename('<>:"/\\|?*'), '未命名项目-研究报告.md')
})

test('caps the filename basename length before appending the extension', () => {
  const filename = buildReportFilename('a'.repeat(300))
  assert.equal(filename.length, 255)
  assert.equal(filename, `${'a'.repeat(247)}-研究报告.md`)
})
