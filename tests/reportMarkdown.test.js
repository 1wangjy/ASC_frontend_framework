import test from 'node:test'
import assert from 'node:assert/strict'

import { renderReportMarkdown } from '../src/features/reports/reportMarkdown.js'

test('renders the report headings and emphasis used by saved Markdown', () => {
  const html = renderReportMarkdown('# 标题\n\n## 结论\n\n**关键发现**与`ASC`')

  assert.match(html, /<h1[^>]*>标题<\/h1>/)
  assert.match(html, /<h2[^>]*>结论<\/h2>/)
  assert.match(html, /<strong>关键发现<\/strong>/)
  assert.match(html, /<code[^>]*>ASC<\/code>/)
})

test('escapes raw backend HTML before applying Markdown formatting', () => {
  const html = renderReportMarkdown('**结论** <script>alert(1)</script> <img src=x onerror=alert(2)>')

  assert.match(html, /<strong>结论<\/strong>/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img /)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/)
})

test('renders lists, quotes, and tables without exposing raw tags', () => {
  const html = renderReportMarkdown([
    '> 证据说明',
    '',
    '- 第一项',
    '- 第二项',
    '',
    '| 指标 | 数值 |',
    '| --- | --- |',
    '| 强度 | 10 |'
  ].join('\n'))

  assert.match(html, /<blockquote[^>]*>证据说明<\/blockquote>/)
  assert.match(html, /<ul[^>]*>[\s\S]*第一项[\s\S]*第二项[\s\S]*<\/ul>/)
  assert.match(html, /<table[^>]*>[\s\S]*<th>指标<\/th>[\s\S]*<td>10<\/td>[\s\S]*<\/table>/)
})

test('returns an empty string for missing report content', () => {
  assert.equal(renderReportMarkdown(''), '')
  assert.equal(renderReportMarkdown(null), '')
})
