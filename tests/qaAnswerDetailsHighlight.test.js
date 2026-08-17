import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

import { buildQaAnswerDetails } from '../src/features/qa/qaAnswerDetailsModel.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

test('uses the shared green domain-term renderer in detailed derivation and reasoning routes', async () => {
  const result = {
    logic_chain_derivation: [
      '推导主线：SiC 氧化形成 SiO2 保护层并提升抗氧化性能。',
      '机制链：SiC → SiO2 → 抗氧化性能。'
    ].join('\n'),
    reasoning_route: {
      requested_mode: 'auto',
      selected_mode: 'tot',
      structural_metrics: { node_count: 3, relation_count: 2 }
    },
    routed_reasoning_paths: [{
      path_id: 'path-1',
      natural_language_path: 'SiC -> SiO2 保护层 -> 抗氧化性能',
      nodes: [{ name: 'SiC' }, { name: 'SiO2 保护层' }, { name: '抗氧化性能' }],
      edges: [{ relation: '生成' }, { relation: '提升' }]
    }]
  }
  const items = buildQaAnswerDetails(result)
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [vue()],
    server: { middlewareMode: true }
  })

  try {
    const { default: AnswerDetailsTabs } = await server.ssrLoadModule('/src/features/qa/AnswerDetailsTabs.vue')
    const renderTab = activeTab => renderToString(createSSRApp({
      render: () => h(AnswerDetailsTabs, {
        activeTab,
        items,
        question: 'SiC 如何改善抗氧化性能？',
        result
      })
    }))

    const logicHtml = await renderTab('logic')
    const reasoningHtml = await renderTab('reasoning')

    assert.match(logicHtml, /class="qa-domain-term is-/)
    assert.match(logicHtml, /<u>SiC<\/u>/)
    assert.match(reasoningHtml, /class="qa-domain-term is-/)
    assert.match(reasoningHtml, /<u>SiC<\/u>/)
  } finally {
    await server.close()
  }
})
