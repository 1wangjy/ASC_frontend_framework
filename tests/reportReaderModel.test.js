import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProjectReportTitle,
  buildReportProgress,
  buildReportSections,
  normalizeReportStatus,
  unwrapReportSections
} from '../src/features/reports/reportReaderModel.js'

test('names a report from its graph project without inventing an id', () => {
  assert.equal(buildProjectReportTitle(' 哈哈哈 '), '哈哈哈 · 研究报告')
  assert.equal(buildProjectReportTitle(''), '未关联图谱 · 研究报告')
})

test('normalizes backend report lifecycle values', () => {
  assert.equal(normalizeReportStatus('completed'), 'completed')
  assert.equal(normalizeReportStatus('PROCESSING'), 'generating')
  assert.equal(normalizeReportStatus('running'), 'generating')
  assert.equal(normalizeReportStatus('error'), 'failed')
  assert.equal(normalizeReportStatus('unexpected'), 'unknown')
})

test('unwraps the real report sections response shape', () => {
  const result = unwrapReportSections({
    success: true,
    data: {
      report_id: 'report-1',
      total_sections: 3,
      is_complete: false,
      sections: [{ section_index: 1, content: '第一章' }]
    }
  })

  assert.equal(result.totalSections, 3)
  assert.equal(result.complete, false)
  assert.deepEqual(result.sections, [{ section_index: 1, content: '第一章' }])
})

test('orders saved sections and restores titles from the outline', () => {
  const sections = buildReportSections({
    outline: {
      sections: [
        { title: '核心摘要' },
        { title: '深层机理' }
      ]
    }
  }, {
    success: true,
    data: {
      total_sections: 2,
      is_complete: true,
      sections: [
        { section_index: 2, content: '第二章内容' },
        { section_index: 1, content: '第一章内容' }
      ]
    }
  })

  assert.deepEqual(sections, [
    { index: 1, title: '核心摘要', content: '第一章内容' },
    { index: 2, title: '深层机理', content: '第二章内容' }
  ])
})

test('falls back to outline content when saved sections are unavailable', () => {
  const sections = buildReportSections({
    outline: {
      sections: [
        { title: '结论', content: '后端大纲中的最终内容' }
      ]
    }
  }, null)

  assert.deepEqual(sections, [
    { index: 1, title: '结论', content: '后端大纲中的最终内容' }
  ])
})

test('computes bounded report progress from saved sections', () => {
  assert.deepEqual(buildReportProgress({ status: 'processing' }, {
    success: true,
    data: {
      total_sections: 4,
      is_complete: false,
      sections: [
        { section_index: 1, content: '一' },
        { section_index: 2, content: '二' }
      ]
    }
  }), { completed: 2, total: 4, percent: 50 })

  assert.deepEqual(buildReportProgress({ status: 'completed' }, {
    success: true,
    data: { total_sections: 4, is_complete: true, sections: [] }
  }), { completed: 4, total: 4, percent: 100 })
})
