import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProjectReportTitle,
  buildReportProgress,
  buildReportSections,
  extractSectionHighlights,
  extractSectionKeywords,
  normalizeReportStatus,
  resolveCurrentSection,
  unwrapReportSections
} from '../src/features/reports/reportReaderModel.js'

test('extracts at most four real list items from recognized report highlight sections', () => {
  const highlights = extractSectionHighlights(`
## 00 核心洞察摘要

**核心洞察**

这一段不应优先于同一栏目的真实列表。

- 烧成制度决定材料致密化窗口
- 界面反应影响服役稳定性

### 设计原则

1. 优先验证关键中介变量
2. 保留可追溯实验条件
3. 这一条超过上限
`)

  assert.deepEqual(highlights, [
    { label: '核心洞察', text: '烧成制度决定材料致密化窗口' },
    { label: '核心洞察', text: '界面反应影响服役稳定性' },
    { label: '设计原则', text: '优先验证关键中介变量' },
    { label: '设计原则', text: '保留可追溯实验条件' }
  ])
})

test('ignores recognized highlight headings that do not contain real list items', () => {
  assert.deepEqual(extractSectionHighlights(`
### 验证边界

结论仅适用于当前温度和气氛条件。

### 普通章节

这不是本章重点栏目。
`), [])

  assert.deepEqual(extractSectionHighlights('### 核心洞察：这不是列表项'), [])

  assert.deepEqual(extractSectionHighlights('## 01 普通章节\n\n只有正文，没有指定重点栏目。'), [])
})

test('extracts unique material keywords in source order without substring false positives', () => {
  const keywords = extractSectionKeywords(`
本章使用 Al2O3-SiC 材料，并再次讨论 SiC。
通过 SEM/EDS、XRD 和 MIP 分析显微结构、孔隙率与热震稳定性。
The phase evolution text must not be treated as the keyword HA.
`)

  assert.deepEqual(keywords, [
    'Al2O3',
    'SiC',
    'SEM/EDS',
    'XRD',
    'MIP',
    '显微结构',
    '孔隙率',
    '热震稳定性'
  ])
  assert.deepEqual(extractSectionKeywords('本章没有词表中的材料术语。'), [])
})

test('names a report from its graph project without inventing an id', () => {
  assert.equal(buildProjectReportTitle(' 哈哈哈 '), '哈哈哈 · 研究报告')
  assert.equal(buildProjectReportTitle(''), '未关联图谱 · 研究报告')
})

test('normalizes backend report lifecycle values', () => {
  assert.equal(normalizeReportStatus('completed'), 'completed')
  assert.equal(normalizeReportStatus('planning'), 'generating')
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

test('orders saved sections and reads number and title from the first level-two heading', () => {
  const sections = buildReportSections({
    outline: {
      sections: [
        { title: '不应使用的大纲标题' },
        { title: '也不应使用的大纲标题' }
      ]
    }
  }, {
    success: true,
    data: {
      total_sections: 2,
      is_complete: true,
      sections: [
        {
          section_index: 2,
          filename: 'section_02.md',
          content: '前置说明\n\n## 01 关键关系网络\n\n第二章内容'
        },
        {
          section_index: 1,
          filename: 'section_01.md',
          content: '## 00 核心洞察摘要\n\n第一章内容'
        }
      ]
    }
  })

  assert.deepEqual(sections, [
    {
      index: 1,
      number: '00',
      title: '核心洞察摘要',
      filename: 'section_01.md',
      content: '## 00 核心洞察摘要\n\n第一章内容'
    },
    {
      index: 2,
      number: '01',
      title: '关键关系网络',
      filename: 'section_02.md',
      content: '前置说明\n\n## 01 关键关系网络\n\n第二章内容'
    }
  ])
})

test('does not rebuild chapters from report outline when saved sections are unavailable', () => {
  const sections = buildReportSections({
    markdown_content: '# 完整报告\n\n## 00 不应重新切分的章节',
    outline: {
      sections: [
        { title: '结论', content: '后端大纲中的最终内容' }
      ]
    }
  }, null)

  assert.deepEqual(sections, [])
})

test('keeps the current section when it still exists and otherwise selects the first saved section', () => {
  const sections = [
    { index: 1, number: '00', title: '摘要', content: '一' },
    { index: 2, number: '01', title: '机理', content: '二' }
  ]

  assert.equal(resolveCurrentSection(sections, sections[1]), sections[1])
  assert.equal(resolveCurrentSection(sections, { index: 9 }), sections[0])
  assert.equal(resolveCurrentSection([], sections[0]), null)
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
