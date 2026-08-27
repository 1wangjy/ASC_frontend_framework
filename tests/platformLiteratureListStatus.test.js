import test from 'node:test'
import assert from 'node:assert/strict'

import { renderSfc } from './helpers/renderSfc.js'

test('shows a loading message while literature is being requested', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureListStatus.vue', {
    status: 'loading',
  })

  assert.match(html, /文献加载中\.\.\./)
  assert.doesNotMatch(html, /暂无文献/)
})

test('shows a retry action when the literature request fails', async () => {
  const html = await renderSfc('/src/platform/components/LiteratureListStatus.vue', {
    status: 'error',
  })

  assert.match(html, /文献加载失败，请稍后重试/)
  assert.match(html, /重新加载/)
  assert.match(html, /<button/)
})

test('distinguishes an empty library from filtered results', async () => {
  const emptyHtml = await renderSfc('/src/platform/components/LiteratureListStatus.vue', {
    status: 'empty',
  })
  const filteredHtml = await renderSfc('/src/platform/components/LiteratureListStatus.vue', {
    status: 'no-results',
  })

  assert.match(emptyHtml, /暂无文献，可通过“导入 PDF”添加第一篇文献/)
  assert.doesNotMatch(emptyHtml, /未找到符合当前条件的文献/)
  assert.match(filteredHtml, /未找到符合当前条件的文献/)
  assert.doesNotMatch(filteredHtml, /暂无文献/)
})
