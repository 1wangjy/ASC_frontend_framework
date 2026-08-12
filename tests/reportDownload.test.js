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

test('downloads a non-empty Blob created by the injected browser realm', async () => {
  class BrowserBlob {
    constructor(contents) {
      this.contents = contents
      this.size = contents.join('').length
    }
  }

  const events = []
  const browser = {
    Blob: BrowserBlob,
    URL: {
      createObjectURL: blob => {
        assert.ok(blob instanceof BrowserBlob)
        events.push('created')
        return 'blob:browser-realm'
      },
      revokeObjectURL: url => events.push(`revoked:${url}`)
    },
    document: {
      createElement: () => ({
        click() { events.push('clicked') }
      })
    }
  }

  const filename = await saveReportDownload({
    reportId: 'r1',
    projectName: 'Graph',
    downloadReport: async () => new BrowserBlob(['report']),
    browser
  })

  assert.equal(filename, 'Graph-研究报告.md')
  assert.deepEqual(events, ['created', 'clicked', 'revoked:blob:browser-realm'])
})

test('does not crash when the injected browser Blob constructor is unavailable', async () => {
  const clicks = []
  const filename = await saveReportDownload({
    reportId: 'r1',
    projectName: 'Graph',
    downloadReport: async () => new Blob(['report']),
    browser: { ...createFakeDownloadBrowser(clicks), Blob: {} }
  })

  assert.equal(filename, 'Graph-研究报告.md')
  assert.deepEqual(clicks, ['Graph-研究报告.md', 'revoked:blob:report-download'])
})

test('rejects plain objects that only resemble Blob payloads', async () => {
  await assert.rejects(
    saveReportDownload({
      reportId: 'r1',
      projectName: 'Graph',
      downloadReport: async () => ({ data: { size: 6, type: 'text/markdown' } }),
      browser: createFakeDownloadBrowser([])
    }),
    /可下载的报告文件/
  )
})

test('uses a safe fallback when every project-name character is invalid', () => {
  assert.equal(buildReportFilename('<>:"/\\|?*'), '未命名项目-研究报告.md')
})

test('replaces Windows control characters with safe filename separators', () => {
  const filename = buildReportFilename('alpha\u0000beta\u001fgamma')

  assert.equal(filename, 'alpha-beta-gamma-研究报告.md')
  assert.doesNotMatch(filename, /[\u0000-\u001f]/)
})

test('caps the filename basename length before appending the extension', () => {
  const filename = buildReportFilename('a'.repeat(300))
  assert.equal(filename.length, 255)
  assert.equal(filename, `${'a'.repeat(247)}-研究报告.md`)
})
