import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderSfc } from './helpers/renderSfc.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8')

const PAYLOAD = {
  raw: '高铝铝土',
  ruleTemplate: { kind: 'alias', pattern: '高铝铝土', priority: 50 },
  suggestions: ['高铝', '氧化铝'],
  unresolved: [{ raw: '高铝铝土' }, { raw: '碳化硅' }],
}

test('BaseRuleDialog：可见时按失败载荷预填 pattern 与建议，未选目标时禁止提交', async () => {
  const html = await renderSfc('src/platform/components/BaseRuleDialog.vue', { visible: true, payload: PAYLOAD })
  assert.match(html, /新建 base 映射规则/)
  assert.match(html, /高铝铝土/, '应回显未映射的原料名')
  assert.match(html, /value="alias"/, '规则类型应预填 alias')
  assert.match(html, /高铝/, '应给出候选按钮')
  assert.match(html, /本次共 2 个未映射原料/, '多个未映射原料应提示数量')
  assert.match(html, /disabled/, '未选择目标 base 时按钮应禁用')
})

test('BaseRuleDialog：不可见时不渲染内容', async () => {
  const html = await renderSfc('src/platform/components/BaseRuleDialog.vue', { visible: false, payload: PAYLOAD })
  assert.ok(!html.includes('brd-card'), '隐藏时不应渲染卡片')
})

test('MaterialBasePanel：渲染标题与注册表/规则/词表区块', async () => {
  const html = await renderSfc('src/platform/views/manage/MaterialBasePanel.vue', {})
  assert.match(html, /原料 base 名管理/)
  assert.match(html, /one-hot 位/)
  assert.match(html, /注册表/)
  assert.match(html, /映射规则/)
  assert.match(html, /变体词表/)
})

test('数据管理：新增「原料 base 名」页签，并把未映射错误接到规则弹窗 + 重试', () => {
  const src = read('src/platform/views/DataManagerView.vue')
  assert.match(src, /key: 'mbase', label: '原料 base 名'/)
  assert.match(src, /MaterialBasePanel/)
  assert.match(src, /BaseRuleDialog/)
  assert.match(src, /UNRESOLVED_BASE/)
  assert.match(src, /openBaseRuleDialog\(e, submitAddMc\)/, '新增原料失败应可一键建规则并重试')
  assert.match(src, /openBaseRuleDialog\(e, \(\) => saveEdit\(payload\)\)/, '行内编辑失败应可一键建规则并重试')
  assert.match(src, /onBaseRuleCreated/)
})

test('性能预测：可从配方表带入并显示覆盖报告', () => {
  const src = read('src/platform/views/Model1View.vue')
  assert.match(src, /importFromRecipe/)
  assert.match(src, /resolveMaterialName/)
  assert.match(src, /materialCoverage/)
  assert.match(src, /从配方表带入/)
  assert.match(src, /one-hot 恒 0/)
})

test('API 客户端解包到业务负载，且 vite 代理覆盖新路由', () => {
  const api = read('src/platform/api/materialBase.js')
  assert.match(api, /payloadOf/)
  assert.match(api, /body\.data/)
  assert.match(api, /\/api\/predict\/from-formula/)

  const vite = read('vite.config.js')
  assert.match(vite, /'\/api\/material-base'/)
  assert.match(vite, /'\/api\/predict'/)
})
