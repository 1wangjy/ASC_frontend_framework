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

test('the report reader renders saved sections and prepares currentSection state', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /v-if="sections\.length"[\s\S]*?v-for="section in sections"/)
  assert.match(source, /renderReportMarkdown\(section\.content\)/)
  assert.match(source, /const currentSection = ref\(null\)/)
  assert.match(source, /resolveCurrentSection/)
  assert.doesNotMatch(source, /completedMarkdown|report\?\.markdown_content/)
})

test('builds a sticky dynamic chapter navigation that selects and scrolls to saved sections', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /<nav[\s\S]*?v-for="section in sections"/)
  assert.match(source, /\{\{ section\.number \}\}[\s\S]*?\{\{ section\.title \}\}/)
  assert.match(source, /@click="selectSection\(section\)"/)
  assert.match(source, /currentSection\?\.index === section\.index/)
  assert.match(source, /scrollIntoView\(\{\s*behavior:\s*['"]smooth['"]/)
  assert.match(source, /\.report-reader__toc-card\s*\{[\s\S]*?position:\s*sticky/)
  assert.doesNotMatch(source, /\[['"]00['"],\s*['"]01['"]|00[^\n]+01[^\n]+02[^\n]+03[^\n]+04[^\n]+05/)
})

test('expands only currentSection and keeps other saved chapters compact', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /v-for="section in sections"[\s\S]*?@click="selectSection\(section\)"/)
  assert.match(source, /v-if="currentSection\?\.index === section\.index"/)
  assert.match(source, /v-html="renderReportMarkdown\(section\.content\)"/)
  assert.match(source, /report-reader__chapter--active/)
  assert.doesNotMatch(source, /v-show="currentSection\?\.index === section\.index"/)
})

test('shows a sticky current-section highlights card only when real highlights exist', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /extractSectionHighlights/)
  assert.match(source, /const sectionHighlights = computed\(\(\) =>[\s\S]*?currentSection\.value\?\.content/)
  assert.match(source, /v-if="sectionHighlights\.length"[\s\S]*?本章重点[\s\S]*?v-for="\(highlight, index\) in sectionHighlights"/)
  assert.match(source, /\.report-reader__section-aside\s*\{[\s\S]*?position:\s*sticky/)
})

test('shows unique current-section keyword chips beneath highlights only when matches exist', async () => {
  const source = await readFile(
    new URL('../src/components/ReportReader.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /extractSectionKeywords/)
  assert.match(source, /const sectionKeywords = computed\(\(\) =>[\s\S]*?currentSection\.value\?\.content/)
  assert.match(source, /本章重点[\s\S]*?v-if="sectionKeywords\.length"[\s\S]*?关键词/)
  assert.match(source, /v-for="keyword in sectionKeywords"[\s\S]*?\{\{ keyword \}\}/)
  assert.match(source, /report-reader__keyword-chip/)
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
