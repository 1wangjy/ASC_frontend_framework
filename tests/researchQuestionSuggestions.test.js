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
  questionCategories
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
  } finally {
    await mounted.close()
  }
})
