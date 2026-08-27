import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { renderSfc } from './helpers/renderSfc.js'

const qualifiedProjects = [
  {
    projectId: 'p1',
    graphId: 'g1',
    simulationId: 's1',
    reportId: 'r1',
    projectName: '项目一',
    reportStatus: 'completed'
  }
]

test('renders only the qualified projects supplied by the parent', async () => {
  const html = await renderSfc('/src/features/qa/QaProjectSelector.vue', {
    open: true,
    projects: qualifiedProjects,
    selectedProjectId: '',
    loading: false,
    error: ''
  })

  assert.match(html, /role="dialog"/)
  assert.match(html, /项目一/)
  assert.match(html, /已完成报告/)
  assert.doesNotMatch(html, /模拟数据|示例项目/)
})

test('stays out of the rendered page while closed', async () => {
  const html = await renderSfc('/src/features/qa/QaProjectSelector.vue', {
    open: false,
    projects: qualifiedProjects,
    selectedProjectId: 'p1',
    loading: false,
    error: ''
  })

  assert.doesNotMatch(html, /role="dialog"/)
  assert.doesNotMatch(html, /项目一/)
})

test('shows loading, error, and empty qualification states without fake projects', async () => {
  const [loadingHtml, errorHtml, emptyHtml] = await Promise.all([
    renderSfc('/src/features/qa/QaProjectSelector.vue', {
      open: true,
      projects: [],
      selectedProjectId: '',
      loading: true,
      error: ''
    }),
    renderSfc('/src/features/qa/QaProjectSelector.vue', {
      open: true,
      projects: [],
      selectedProjectId: '',
      loading: false,
      error: '报告服务不可用'
    }),
    renderSfc('/src/features/qa/QaProjectSelector.vue', {
      open: true,
      projects: [],
      selectedProjectId: '',
      loading: false,
      error: ''
    })
  ])

  assert.match(loadingHtml, /正在读取可问答项目/)
  assert.match(errorHtml, /报告服务不可用/)
  assert.match(errorHtml, /刷新/)
  assert.match(emptyHtml, /暂无已完成报告的图谱项目/)
  assert.doesNotMatch(`${loadingHtml}${errorHtml}${emptyHtml}`, /示例项目/)
})

test('defines keyboard close and project selection as component events', async () => {
  const source = await readFile(
    new URL('../src/features/qa/QaProjectSelector.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /@keydown\.stop="handleKeydown"/)
  assert.match(source, /@click="emit\('select', project\.projectId\)"/)
  assert.match(source, /defineEmits\(\['select', 'close', 'refresh'\]\)/)
  assert.match(source, /ref="dialog"/)
  assert.match(source, /if \(typeof dialog\.value\?\.focus === 'function'\) dialog\.value\.focus\(\)/)
  assert.doesNotMatch(source, /useRouter|router\.(?:push|replace)/)
})

test('places the modal above persistent controls and delegates all keyboard handling to its trap', async () => {
  const source = await readFile(
    new URL('../src/features/qa/QaProjectSelector.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /@keydown\.stop="handleKeydown"/)
  assert.match(source, /focusableElements/)
  assert.match(source, /previousFocus/)
  assert.match(source, /z-index:\s*1000/)
})

test('keeps a fixed dialog frame and scrolls only the project list', async () => {
  const source = await readFile(
    new URL('../src/features/qa/QaProjectSelector.vue', import.meta.url),
    'utf8'
  )

  assert.match(source, /\.qa-project-selector__dialog\s*\{[^}]*height:\s*min\(470px,\s*calc\(100vh - 96px\)\)[^}]*overflow:\s*hidden/s)
  assert.match(source, /\.qa-project-selector__dialog\s*>\s*header\s*\{[^}]*flex:\s*0 0 auto/s)
  assert.match(source, /\.qa-project-selector__list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
})
