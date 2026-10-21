import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'
import postcss from 'postcss'

test('both research Tabs use shared hero rules and the Agent model control uses QA tokens', async () => {
  const view = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const css = parse(view).descriptor.styles.map(style => style.content).join('\n')
  assert.match(css, /\.qa-research-intro h1\s*\{/)
  assert.equal((view.match(/<QaIntroHero\s/g) || []).length, 2, 'both Tabs share the collapsible intro component')
  assert.doesNotMatch(css, /\.qa-multi-page__intro h1\s*\{/)
  const panel = await readFile(new URL('../src/platform/agent/AgentPanel.vue', import.meta.url), 'utf8')
  const root = postcss.parse(parse(panel).descriptor.styles.map(style => style.content).join('\n'))
  const select = root.nodes.find(node => node.selector === '.agent-model-bar select')
  const values = Object.fromEntries(select.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
  assert.equal(values['min-height'], 'var(--agent-ctl-h)')
  assert.equal(values['border-radius'], 'var(--agent-ctl-radius)')
})

test('long tool parameters cannot expand the message grid on narrow screens', async () => {
  const panel = await readFile(new URL('../src/platform/agent/AgentPanel.vue', import.meta.url), 'utf8')
  const root = postcss.parse(parse(panel).descriptor.styles.map(style => style.content).join('\n'))
  const declarations = selector => {
    const rule = root.nodes.find(node => node.selector === selector)
    return Object.fromEntries((rule?.nodes || []).filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
  }
  assert.equal(declarations('.agent-tools')['grid-template-columns'], 'minmax(0, 1fr)')
  assert.equal(declarations('.agent-tool')['min-width'], '0')
  assert.equal(declarations('.agent-tool__code')['max-width'], '100%')
  assert.equal(declarations('.agent-tool__code').overflow, 'auto')
  assert.equal(declarations('.agent-reasoning__summary')['overflow-wrap'], 'anywhere')
})

// CSS contract regression, not a browser geometry/visual assertion.
test('conversation workspace and composer have enlarged defaults without removing responsive gutters', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const root = postcss.parse(parse(source).descriptor.styles.map(style => style.content).join('\n'))
  const page = root.nodes.find(node => node.selector === '.qa-multi-page')
  const values = Object.fromEntries(page.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
  assert.equal(values.width, '100%')
  assert.equal(values.height, 'auto')
  assert.equal(values['min-height'], 'calc(100dvh - var(--qa-topbar-h))')
  assert.equal(values.overflow, 'visible')
  assert.match(values.padding, /var\(--qa-gutter\)/)
  assert.equal(values['box-sizing'], 'border-box')
  assert.match(source, /grid-template-columns:\s*80px minmax\(0, 1fr\) 264px/)
  assert.match(source, /container: qa-content \/ inline-size/)
  assert.match(source, /@container qa-content \(max-width: 1200px\)/)
  const panel = await readFile(new URL('../src/platform/agent/AgentPanel.vue', import.meta.url), 'utf8')
  const css = postcss.parse(parse(panel).descriptor.styles.map(style => style.content).join('\n'))
  const declarations = selector => Object.fromEntries(css.nodes.find(node => node.selector === selector).nodes
    .filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
  assert.equal(declarations('.agent-panel__input')['min-height'], '128px')
  assert.equal(declarations('.agent-panel__input')['font-size'], '16px')
  assert.equal(declarations('.agent-panel__input').resize, 'vertical')
  assert.equal(declarations('.agent-panel__log')['min-height'], 'clamp(320px, 38vh, 480px)')
  assert.equal(declarations('.agent-panel--embedded .agent-panel__log')['min-height'], '240px')
  assert.equal(declarations('.agent-panel--embedded .agent-panel__composer').flex, '0 0 auto')
})

test('Agent workspace cannot clip its composer; legacy history keeps its bounded layout', async () => {
  const source = await readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const root = postcss.parse(descriptor.styles.map(style => style.content).join('\n'))
  const declarations = selector => {
    let result
    root.walkRules(rule => {
      if (rule.selector === selector && rule.parent.type === 'root') {
        result = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
      }
    })
    return result
  }
  const agent = declarations('.qa-multi-page__workspace.qa-multi-page__workspace--agent')
  assert.ok(agent, 'Agent needs a specific layout override, including at narrow widths')
  assert.equal(agent.height, 'max(640px, calc(100dvh - 220px))')
  assert.equal(agent.flex, '0 0 auto')
  assert.equal(agent['min-height'], '640px')
  assert.equal(agent.overflow, 'visible')
  assert.equal(declarations('.qa-multi-page__workspace--history').overflow, 'hidden')
  const panel = await readFile(new URL('../src/platform/agent/AgentPanel.vue', import.meta.url), 'utf8')
  const panelCss = postcss.parse(parse(panel).descriptor.styles.map(style => style.content).join('\n'))
  const log = panelCss.nodes.find(rule => rule.selector === '.agent-panel__log')
  assert.ok(log.nodes.some(node => node.prop === 'overflow-y' && node.value === 'auto'), 'long answers remain internally scrollable')
})
