import test from 'node:test'
import assert from 'node:assert/strict'

import { nextTick } from 'vue'
import {
  clickRenderedLink,
  findRenderedNode,
  mountSfcWithMemoryRouter
} from './helpers/mountSfcWithMemoryRouter.js'
import {
  createResearchQuestionSuggestions,
  questionCategories,
  refreshResearchQuestionSuggestions
} from '../src/features/qa/questionGuideModel.js'

test('creates three recommendations from different QA question categories', () => {
  const recommendations = createResearchQuestionSuggestions(() => 0, 3)

  assert.equal(recommendations.length, 3)
  assert.equal(new Set(recommendations.map(item => item.categoryId)).size, 3)
  for (const recommendation of recommendations) {
    const category = questionCategories.find(item => item.id === recommendation.categoryId)
    assert.ok(category?.questions.includes(recommendation.question))
  }
})

test('refreshes all recommendations without returning the same questions', () => {
  const current = createResearchQuestionSuggestions(() => 0, 3)
  const refreshed = refreshResearchQuestionSuggestions(current, () => 0)

  assert.equal(refreshed.length, 3)
  assert.equal(new Set(refreshed.map(item => item.categoryId)).size, 3)
  assert.notDeepEqual(
    refreshed.map(item => item.question),
    current.map(item => item.question)
  )
})

test('clicking one of three rendered recommendations fills the research question textarea', async () => {
  const mounted = await mountSfcWithMemoryRouter(
    '/src/features/research/ResearchQuestionDialog.vue',
    '/',
    {
    open: true,
    defaultProjectName: 'project_1'
    }
  )

  try {
    const buttons = []
    const collect = node => {
      if (node?.type === 'button' && node.props?.class === 'recommended-question') buttons.push(node)
      for (const child of node?.children || []) collect(child)
    }
    collect(mounted.root)

    assert.equal(buttons.length, 3)
    const selectedQuestion = buttons[0].props.title
    await clickRenderedLink(buttons[0])
    await nextTick()

    const textarea = findRenderedNode(mounted.root, node => node?.type === 'textarea')
    assert.equal(textarea.value, selectedQuestion)

    const refreshButton = findRenderedNode(
      mounted.root,
      node => node?.type === 'button' && node.props?.class === 'recommendations-refresh'
    )
    assert.ok(refreshButton)
    assert.equal(refreshButton.props.type, 'button')
    const questionsBeforeRefresh = buttons.map(button => button.props.title)
    await clickRenderedLink(refreshButton)
    await nextTick()
    const refreshedButtons = []
    const collectRefreshed = node => {
      if (node?.type === 'button' && node.props?.class === 'recommended-question') refreshedButtons.push(node)
      for (const child of node?.children || []) collectRefreshed(child)
    }
    collectRefreshed(mounted.root)
    assert.notDeepEqual(refreshedButtons.map(button => button.props.title), questionsBeforeRefresh)
    assert.equal(textarea.value, selectedQuestion)
  } finally {
    await mounted.close()
  }
})
