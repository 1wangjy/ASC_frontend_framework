import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { renderSfc } from './helpers/renderSfc.js'

test('renders a focused report reader shell named from the graph project', async () => {
  const html = await renderSfc('/src/components/ReportReader.vue', {
    reportId: 'report-1',
    projectName: '哈哈哈'
  })

  assert.match(html, /哈哈哈 · 研究报告/)
  assert.match(html, /正在读取报告/)
  assert.doesNotMatch(html, /图谱关系可视化|Step 4\/5|工作台|控制台输出/)
})

test('the report reader owns only read and status API capabilities', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /getReport/)
  assert.match(source, /getReportSections/)
  assert.match(source, /getAgentLog/)
  assert.match(source, /getReportStatus/)
  assert.doesNotMatch(source, /generateReport|force_regenerate|deleteReport|GraphPanel|WorkflowProgressBar|Step4Report/)
})

test('the completed document prefers canonical saved Markdown over duplicate section rendering', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /state\.value\.status === 'completed'[\s\S]*?state\.value\.report\?\.markdown_content/)
  assert.match(source, /v-if="completedMarkdown"/)
  assert.match(source, /v-else[\s\S]*?v-for="section in sections"/)
})

test('styles saved KG discoveries as distinct report insights', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /\.report-reader__markdown\s+:deep\(\.kg-discovery-insight\)/)
})

test('publishes the current report and status after every reader controller publication', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /defineEmits\(\[['"]report-state['"]\]\)/)
  assert.match(
    source,
    /onChange:\s*nextState\s*=>\s*\{[\s\S]*?state\.value\s*=\s*nextState[\s\S]*?emit\(\s*['"]report-state['"]\s*,\s*\{\s*report:\s*nextState\.report,\s*status:\s*nextState\.status\s*\}\s*\)/
  )
})
