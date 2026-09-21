import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeChatMarkdown, renderChatMarkdown } from '../src/features/markdown/chatMarkdown.js'

test('空输入不产生任何标记', () => {
  assert.equal(renderChatMarkdown(''), '')
  assert.equal(renderChatMarkdown(null), '')
})

test('标题、粗体、行内 code 与列表都渲染成标记', () => {
  const html = renderChatMarkdown('## 检索范围\n\n**Default Project** 与 `kg_list`\n\n- 第一项\n- 第二项')
  assert.match(html, /<h3>检索范围<\/h3>/)
  assert.match(html, /<strong>Default Project<\/strong>/)
  assert.match(html, /<code class="md-inline-code">kg_list<\/code>/)
  assert.match(html, /<ul class="md-list">/)
  assert.equal((html.match(/<li>/g) || []).length, 2)
})

test('有序列表、引用与分隔线', () => {
  const html = renderChatMarkdown('1. 甲\n2. 乙\n\n> 引用\n\n---')
  assert.match(html, /<ol class="md-list">/)
  assert.match(html, /<blockquote>引用<\/blockquote>/)
  assert.match(html, /<hr>/)
})

test('markdown 表格渲染为真实 table', () => {
  const html = renderChatMarkdown('| 项目 | 值 |\n|---|---|\n| 体积密度 | 3.15 |')
  assert.match(html, /<div class="md-table-wrap">/)
  assert.match(html, /<th>项目<\/th>/)
  assert.match(html, /<td[^>]*>3\.15<\/td>/)
})

test('围栏代码块保留语言并转义内容', () => {
  const html = renderChatMarkdown('```js\nconst a = 1 < 2;\n```')
  assert.match(html, /<pre class="md-code">/)
  assert.match(html, /data-language="js"/)
  assert.match(html, /const a = 1 &lt; 2;/)
})

test('化学式下标与行内 LaTeX 按领域约定渲染', () => {
  assert.match(renderChatMarkdown('Al2O3-SiC-C 的抗氧化性'), /Al₂O₃-SiC-C/)
  assert.match(renderChatMarkdown('由 \\(x^2\\) 可得'), /md-latex/)
})

test('模型输出里的 HTML 不会被执行：危险块被剥离、其余标签只留文本', () => {
  const script = renderChatMarkdown('<script>alert(1)</script>\n\n结论如下')
  assert.doesNotMatch(script, /<script/)
  assert.doesNotMatch(script, /alert\(1\)/)
  assert.match(script, /结论如下/)

  const styled = renderChatMarkdown('<style>.a{}</style>正文')
  assert.doesNotMatch(styled, /<style/)
  assert.match(styled, /正文/)

  const img = renderChatMarkdown('<img src=x onerror=alert(1)>')
  assert.doesNotMatch(img, /<img/)
  assert.doesNotMatch(img, /onerror/)

  const htmlTable = renderChatMarkdown('<table><tr><td>3.15</td></tr></table>')
  assert.doesNotMatch(htmlTable, /<table/)
  assert.match(htmlTable, /3\.15/)
})

test('普通文本里的尖括号按字面保留并转义', () => {
  const html = renderChatMarkdown('若 a < b 且 b > c 则成立')
  assert.match(html, /&lt;/)
  assert.match(html, /&gt;/)
})

test('旧式行内 HTML 标记回退为 markdown 语义', () => {
  assert.match(renderChatMarkdown('<strong>重点</strong>'), /<strong>重点<\/strong>/)
  assert.match(renderChatMarkdown('<u>关键</u>'), /md-key-underline/)
})

test('链接只允许 http(s) 与页内锚点', () => {
  const ok = renderChatMarkdown('[文档](https://example.com/a)')
  assert.match(ok, /href="https:\/\/example\.com\/a"/)
  assert.match(ok, /rel="noopener noreferrer"/)

  const bad = renderChatMarkdown('[点我](javascript:alert(1))')
  assert.doesNotMatch(bad, /href="javascript:/)
})

test('流式半成品不抛错：未闭合围栏按到末尾处理', () => {
  const partial = '```js\nconst a = 1'
  const html = renderChatMarkdown(partial)
  assert.match(html, /<pre class="md-code">/)
  assert.match(html, /const a = 1/)

  assert.doesNotThrow(() => renderChatMarkdown('| 项目 | 值 |\n|---'))
  assert.doesNotThrow(() => renderChatMarkdown('由 \\(x^2 分段'))
  assert.doesNotThrow(() => renderChatMarkdown('**未闭合的粗体'))
})

test('归一化会补齐标题与粗体标记之间的空行习惯', () => {
  assert.match(normalizeChatMarkdown('##标题'), /## 标题/)
})
