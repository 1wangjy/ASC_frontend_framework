import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clickRenderedLink,
  findRenderedLinkByText,
  findRenderedNode,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import { renderedText } from './helpers/createMemoryVueRenderer.js'

test('keeps the multi-turn actions and removes the example-question list', async () => {
  let newDiscussions = 0
  let exits = 0
  const fixture = await mountSfcWithMemoryRouter(
    '/src/features/qa/RecentConversationsPanel.vue',
    '/',
    {
      onNewChat: () => { newDiscussions += 1 },
      onExitMulti: () => { exits += 1 }
    }
  )

  try {
    const newDiscussionButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('新建讨论')
    )
    const exitMultiButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('退出多轮')
    )
    assert.ok(newDiscussionButton)
    assert.ok(exitMultiButton)
    assert.doesNotMatch(renderedText(fixture.root), /示例问题|查看更多示例|热震稳定性与 SiC 含量|新建问答/)

    await newDiscussionButton.props.onClick()
    await exitMultiButton.props.onClick()
    assert.equal(newDiscussions, 1)
    assert.equal(exits, 1)
  } finally {
    await fixture.close()
  }
})

test('shows graph and report workflow shortcuts in single-turn mode', async () => {
  const fixture = await mountSfcWithMemoryRouter(
    '/src/features/qa/RecentConversationsPanel.vue',
    '/',
    { mode: 'single' }
  )

  try {
    const graphProjects = findRenderedLinkByText(fixture.root, '图谱项目')
    const reportCenter = findRenderedLinkByText(fixture.root, '报告中心')

    assert.ok(graphProjects)
    assert.ok(reportCenter)
    assert.doesNotMatch(renderedText(fixture.root), /新建讨论|退出多轮/)

    await clickRenderedLink(graphProjects)
    assert.equal(fixture.router.currentRoute.value.path, '/process')

    await fixture.router.push('/')
    await clickRenderedLink(reportCenter)
    assert.equal(fixture.router.currentRoute.value.path, '/reports')
  } finally {
    await fixture.close()
  }
})

test('places single-turn workflow shortcuts directly below the top divider', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url), 'utf8')
  ))

  assert.match(
    source,
    /\.recent-conversations--workflow\s*\{[^}]*padding-top:\s*14px;/s
  )
})

test('QA view keeps the right-side action panel available in both answer modes', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ))

  assert.match(
    source,
    /<RecentConversationsPanel\s+v-if="!qaState\.evidenceOpen"\s+:mode="qaState\.mode"/
  )
})

test('disables multi-turn navigation actions while the current answer is running', async () => {
  const fixture = await mountSfcWithMemoryRouter(
    '/src/features/qa/RecentConversationsPanel.vue',
    '/',
    { disabled: true }
  )

  try {
    const newDiscussionButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('新建讨论')
    )
    const exitMultiButton = findRenderedNode(
      fixture.root,
      node => node?.type === 'button' && renderedText(node).includes('退出多轮')
    )
    assert.equal(newDiscussionButton?.props?.disabled, true)
    assert.equal(exitMultiButton?.props?.disabled, true)
  } finally {
    await fixture.close()
  }
})

test('uses one quiet, larger style for both multi-turn navigation actions', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url), 'utf8')
  ))

  assert.match(source, /class="recent-conversations__action recent-conversations__new"/)
  assert.match(source, /class="recent-conversations__action recent-conversations__exit"/)
  assert.match(
    source,
    /\.recent-conversations__action\s*\{[^}]*border:\s*1px solid transparent;[^}]*background:\s*transparent;[^}]*font-size:\s*12px;/s
  )
})

test('multi-turn utility actions do not reserve width from the QA page', async () => {
  const [view, panel] = await Promise.all([
    import('node:fs/promises').then(({ readFile }) => (
      readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
    )),
    import('node:fs/promises').then(({ readFile }) => (
      readFile(new URL('../src/features/qa/RecentConversationsPanel.vue', import.meta.url), 'utf8')
    ))
  ])

  assert.match(
    view,
    /\.qa-layout--recent\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
  )
  assert.doesNotMatch(view, /\.qa-layout--recent\s*\{[^}]*176px/s)
  assert.match(
    panel,
    /@media \(min-width:\s*1121px\)[\s\S]*?\.recent-conversations\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;/
  )
})

test('QA view exits multi-turn mode without clearing its graph discussion history', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../src/views/AscQaView.vue', import.meta.url), 'utf8')
  ))

  assert.match(source, /@exit-multi="exitMultiDiscussion"/)
  assert.match(source, /async function exitMultiDiscussion\(\)[\s\S]*updateMode\('single'\)[\s\S]*reset\(\)/)
  const handler = source.match(/async function exitMultiDiscussion\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(handler, /clearSavedMultiDiscussion|startNewDiscussion/)
})
