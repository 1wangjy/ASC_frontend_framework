import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createResearchBuildIntent,
  normalizeResearchQuestion,
  runProfessionalResearchRequests,
  startResearchBuildFromLibrary,
  validateResearchQuestionDialogSubmission
} from '../src/features/research/researchQuestionWorkflow.js'
import { clearPendingUpload, getPendingUpload } from '../src/store/pendingUpload.js'

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

test('stores a valid selected-PDF build intent in the real pending-upload store', () => {
  clearPendingUpload()

  const intent = startResearchBuildFromLibrary(
    documents,
    ['row-2', 'row-empty'],
    '  Explain oxidation mechanisms.  '
  )

  assert.equal(intent.canStart, true)
  const pending = getPendingUpload()
  assert.deepEqual({
    files: pending.files,
    filesByStage: pending.filesByStage,
    dataType: pending.dataType,
    buildStage: pending.buildStage,
    sourceCorpusType: pending.sourceCorpusType,
    pdfLibraryFileIds: pending.pdfLibraryFileIds,
    pdfLibraryFiles: pending.pdfLibraryFiles,
    isPending: pending.isPending
  }, {
    files: [],
    filesByStage: { base: [], professional: [] },
    dataType: 'pdf_library',
    buildStage: 'base',
    sourceCorpusType: 'survey',
    pdfLibraryFileIds: ['file-2'],
    pdfLibraryFiles: [{ file_id: 'file-2', filename: 'two.pdf', title: 'Two' }],
    isPending: true
  })
  assert.equal(pending.queryPrompt, 'Explain oxidation mechanisms.')
  assert.equal(pending.simulationRequirement, 'Explain oxidation mechanisms.')

  clearPendingUpload()
})

test('rejects an empty dialog submission before emitting a graph-build request', () => {
  assert.deepEqual(validateResearchQuestionDialogSubmission('   '), {
    canSubmit: false,
    question: '',
    error: '\u8bf7\u5148\u586b\u5199\u7814\u7a76\u95ee\u9898\u3002'
  })
})

test('runs professional ontology requests with one normalized research question in both payloads', async () => {
  const preparePayloads = []
  const generationPayloads = []

  const result = await runProfessionalResearchRequests({
    question: '  Explain oxidation mechanisms.  ',
    files: [new File(['research'], 'research.md', { type: 'text/markdown' })],
    baseMetadataPath: '/tmp/base.json',
    baseProjectId: 'base-1',
    prepareOntologyProject: async (payload) => {
      preparePayloads.push(payload)
      return { success: true, data: { project_id: 'professional-1' } }
    },
    generateOntology: async (formData) => {
      generationPayloads.push(formData)
      return { success: true, data: { project_id: 'professional-1' } }
    }
  })

  assert.equal(result.canStart, true)
  assert.equal(preparePayloads.length, 1)
  assert.equal(preparePayloads[0].query_prompt, 'Explain oxidation mechanisms.')
  assert.equal(preparePayloads[0].simulation_requirement, 'Explain oxidation mechanisms.')
  assert.equal(generationPayloads.length, 1)
  assert.equal(generationPayloads[0].get('query_prompt'), 'Explain oxidation mechanisms.')
  assert.equal(generationPayloads[0].get('simulation_requirement'), 'Explain oxidation mechanisms.')
})

test('does not call professional ontology APIs when its research question is empty', async () => {
  let prepareCalls = 0
  let generationCalls = 0

  const result = await runProfessionalResearchRequests({
    question: '   ',
    files: [],
    baseMetadataPath: '/tmp/base.json',
    baseProjectId: 'base-1',
    prepareOntologyProject: async () => { prepareCalls++ },
    generateOntology: async () => { generationCalls++ }
  })

  assert.deepEqual(result, {
    canStart: false,
    error: '\u8bf7\u5148\u586b\u5199\u7814\u7a76\u95ee\u9898\u3002',
    researchQuestion: '',
    prepareResponse: null,
    generationResponse: null
  })
  assert.equal(prepareCalls, 0)
  assert.equal(generationCalls, 0)
})

test('declares a required research-question dialog that allows component validation to run', async () => {
  const source = await readFile(new URL('../src/features/research/ResearchQuestionDialog.vue', import.meta.url), 'utf8')

  assert.match(source, /<textarea[^>]*required/)
  assert.match(source, /\u7814\u7a76\u95ee\u9898/)
  assert.match(source, /\u53d6\u6d88/)
  assert.match(source, /\u5f00\u59cb\u6784\u5efa/)
  assert.match(source, /<form novalidate @submit\.prevent="submit">/)
})
