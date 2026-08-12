import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { ascRouteDefinitions } from '../src/config/ascRoutes.js'
import { renderSfc } from './helpers/renderSfc.js'

test('assigns report detail to the report generation module', () => {
  const routes = new Map(ascRouteDefinitions.map(route => [route.name, route]))

  assert.equal(routes.get('Reports')?.path, '/reports')
  assert.equal(routes.get('Reports')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Report')?.meta?.navigationPath, '/reports')
  assert.equal(routes.get('Simulation')?.meta?.navigationPath, '/process')
  assert.equal(routes.get('SimulationRun')?.meta?.navigationPath, '/process')
  assert.notEqual(routes.get('Interaction')?.meta?.navigationPath, '/process')
})

test('renders a stable report center shell while saved reports are loading', async () => {
  const html = await renderSfc('/src/views/ReportCenterView.vue', {}, { withRouter: true })

  assert.match(html, /报告生成/)
  assert.match(html, /已保存的研究报告/)
  assert.match(html, /正在读取已保存报告/)
})

test('wires the report center controller to lifecycle records and separate card actions', async () => {
  const source = await readFile(
    new URL('../src/views/ReportCenterView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /createReportCenterController/)
  assert.match(source, /buildReportProjectRecords|buildReportCenterRecordItems/)
  assert.match(source, /buildLogicalGraphProjects/)
  assert.match(source, /name:\s*['"]Report['"]/)
  assert.match(source, /record\.displayTitle/)
  assert.match(source, /报告列表加载失败/)
  assert.match(source, /尚无报告/)
  assert.match(source, /重新加载/)
  assert.match(source, /生成报告/)
  assert.match(source, /预览/)
  assert.match(source, /下载/)
  assert.match(source, /去问答/)
  assert.match(source, /<article\s+v-for=/)
  assert.doesNotMatch(source, /<router-link\s+v-for=/)
  assert.doesNotMatch(source, /force_regenerate\s*:\s*true/)
  assert.doesNotMatch(source, /monitor\.(?:start|stop)\s*\(/)
  assert.match(source, /watch\(\s*\(\)\s*=>\s*monitor\.state\.(?:items|completedRevision)/)
  assert.match(source, /controller\.syncProjects\(\)/)
  assert.match(source, /:disabled="Boolean\(downloadingReportId\)"/)
  assert.match(source, /deletingReportId/)
  assert.match(source, /controller\.delete\(record\)/)
})

test('opens report QA with both project and report scope', async () => {
  const source = await readFile(
    new URL('../src/views/ReportCenterView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /name:\s*['"]AscQa['"]/)
  assert.match(source, /projectId:\s*record\.projectId/)
  assert.match(source, /reportId:\s*record\.reportId/)
})

test('keeps a direct report-list entry on the retained report detail page', async () => {
  const source = await readFile(
    new URL('../src/views/ReportView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /报告列表/)
  assert.match(source, /router\.push\(['"]\/reports['"]\)/)
  assert.match(source, /<ReportReader/)
  assert.match(source, /:report-id="ownedReportId"/)
  assert.doesNotMatch(source, /GraphPanel|WorkflowProgressBar|Step4Report|view-switcher|Step 4\/5/)
})

test('wires shared completed-report actions without report generation capability', async () => {
  const source = await readFile(
    new URL('../src/views/ReportView.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /<ReportActions/)
  assert.match(source, /@report-state="handleReportState"/)
  assert.match(source, /saveReportDownload\s*\(/)
  assert.match(source, /reportApi\.downloadReport/)
  assert.match(source, /name:\s*['"]AscQa['"]/)
  assert.match(source, /projectId:\s*projectId\.value/)
  assert.match(source, /reportId:\s*ownedReportId/)
  assert.match(source, /matchedProject\.value\?\.projectId/)
  assert.match(source, /fallbackProject\.value\?\.project_id/)
  assert.doesNotMatch(source, /generateReport|force_regenerate/)
})

test('hands completed graph evolution to the report center with project and simulation scope', async () => {
  const [step3Source, runViewSource] = await Promise.all([
    readFile(new URL('../src/components/Step3Simulation.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/SimulationRunView.vue', import.meta.url), 'utf8')
  ])

  assert.match(step3Source, /name:\s*['"]Reports['"]/)
  assert.match(step3Source, /projectId/)
  assert.match(step3Source, /simulationId:\s*props\.simulationId/)
  assert.doesNotMatch(step3Source, /name:\s*['"]Report['"]/)
  assert.doesNotMatch(step3Source, /generateReport|checkReportForSimulation|createSingleReportFlow/)
  assert.doesNotMatch(runViewSource, /@next-step="handleNextStep"/)
  assert.doesNotMatch(runViewSource, /const handleNextStep\s*=/)
})
