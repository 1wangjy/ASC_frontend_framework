import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

test('completed reports with a project offer download and scoped QA', async () => {
  const html = await renderSfc('/src/features/reports/ReportActions.vue', {
    reportId: 'report-1',
    projectId: 'project-1',
    projectName: '图谱项目',
    status: 'completed'
  })

  assert.match(html, />\s*下载\s*</)
  assert.match(html, />\s*去问答\s*</)
})

test('completed reports without a project remain downloadable but cannot open QA', async () => {
  const html = await renderSfc('/src/features/reports/ReportActions.vue', {
    reportId: 'report-2',
    projectName: '未匹配报告',
    status: 'completed'
  })

  assert.match(html, />\s*下载\s*</)
  assert.doesNotMatch(html, />\s*去问答\s*</)
})

test('generating reports show progress without completed-report actions', async () => {
  const html = await renderSfc('/src/features/reports/ReportActions.vue', {
    reportId: 'report-3',
    projectId: 'project-3',
    projectName: '生成中项目',
    status: 'generating'
  })

  assert.match(html, /正在查看生成进度/)
  assert.doesNotMatch(html, />\s*下载\s*</)
  assert.doesNotMatch(html, />\s*去问答\s*</)
})

test('failed reports expose neither download nor QA actions', async () => {
  const html = await renderSfc('/src/features/reports/ReportActions.vue', {
    reportId: 'report-4',
    projectId: 'project-4',
    projectName: '失败项目',
    status: 'failed'
  })

  assert.doesNotMatch(html, />\s*下载\s*</)
  assert.doesNotMatch(html, />\s*去问答\s*</)
})
