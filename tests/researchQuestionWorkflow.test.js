import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createResearchBuildIntent,
  normalizeResearchQuestion
} from '../src/features/research/researchQuestionWorkflow.js'

const documents = [
  { id: 'row-1', fileId: 'file-1', filename: 'one.pdf', title: 'One' },
  { id: 'row-2', fileId: 'file-2', filename: 'two.pdf', title: 'Two' },
  { id: 'row-empty', fileId: '', filename: 'invalid.pdf', title: 'Invalid' }
]

test('normalizes research questions by coercing values and trimming whitespace', () => {
  assert.equal(normalizeResearchQuestion('  How does ASC resist thermal shock?  '), 'How does ASC resist thermal shock?')
  assert.equal(normalizeResearchQuestion(null), '')
})

test('rejects a graph build intent without a research question', () => {
  assert.deepEqual(createResearchBuildIntent(documents, ['row-1'], '   '), {
    fileIds: ['file-1'],
    files: [{ file_id: 'file-1', filename: 'one.pdf', title: 'One' }],
    queryPrompt: '',
    canStart: false,
    error: '\u8bf7\u5148\u586b\u5199\u7814\u7a76\u95ee\u9898\u3002'
  })
})

test('preserves selected PDF files and a normalized research question in a valid intent', () => {
  assert.deepEqual(
    createResearchBuildIntent(documents, ['row-2', 'row-empty'], '  Explain oxidation mechanisms.  '),
    {
      fileIds: ['file-2'],
      files: [{ file_id: 'file-2', filename: 'two.pdf', title: 'Two' }],
      queryPrompt: 'Explain oxidation mechanisms.',
      canStart: true,
      error: ''
    }
  )
})

test('renders a required research-question dialog with explanatory copy and submit/cancel actions', async () => {
  const source = await readFile(new URL('../src/features/research/ResearchQuestionDialog.vue', import.meta.url), 'utf8')

  assert.match(source, /<textarea[^>]*required/)
  assert.match(source, /\u7814\u7a76\u95ee\u9898/)
  assert.match(source, /\u53d6\u6d88/)
  assert.match(source, /\u5f00\u59cb\u6784\u5efa/)
  assert.match(source, /\u8bf7\u5148\u586b\u5199\u7814\u7a76\u95ee\u9898\u3002/)
})

test('opens the research-question dialog before starting a selected-PDF graph build', async () => {
  const source = await readFile(new URL('../src/views/DocumentLibraryView.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /setPendingUpload\(\[\],\s*'',/)
  assert.match(source, /researchQuestionDialogOpen\.value = true/)
  assert.match(source, /setPendingUpload\(\[\], intent\.queryPrompt, '', '', \{/)
})

test('guards project creation before graph requests and reuses one normalized research question', async () => {
  const source = await readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8')
  const handleNewProject = source.slice(source.indexOf('const handleNewProject'))
  const questionDeclaration = handleNewProject.indexOf("const researchQuestion = String(pending.queryPrompt || pending.simulationRequirement || '').trim()")
  const prepareCall = handleNewProject.indexOf('prepareOntologyProject({')

  assert.ok(questionDeclaration >= 0)
  assert.ok(questionDeclaration < prepareCall)
  assert.match(handleNewProject, /if \(!researchQuestion\) \{[\s\S]*error\.value[\s\S]*addLog[\s\S]*return/)
  assert.match(handleNewProject, /query_prompt: researchQuestion/)
  assert.match(handleNewProject, /simulation_requirement: researchQuestion/)
  assert.match(handleNewProject, /formData\.append\('query_prompt', researchQuestion\)/)
  assert.match(handleNewProject, /formData\.append\('simulation_requirement', researchQuestion\)/)
})
