import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

import {
  createBaseResearchRequestIntent,
  startResearchBuildFromLibrary,
  validateResearchQuestionDialogSubmission
} from '../src/features/research/researchQuestionWorkflow.js'
import { clearPendingUpload, getPendingUpload } from '../src/store/pendingUpload.js'

const documents = [{ id: 'row-1', fileId: 'file-1', filename: 'paper.pdf', title: 'Paper' }]

test('preserves one normalized dialog question through library storage and both graph request fields', () => {
  clearPendingUpload()

  const dialogSubmission = validateResearchQuestionDialogSubmission('  How does ASC resist thermal shock?  ')
  assert.deepEqual(dialogSubmission, {
    canSubmit: true,
    question: 'How does ASC resist thermal shock?',
    error: ''
  })

  const build = startResearchBuildFromLibrary(documents, ['row-1'], dialogSubmission.question)
  assert.equal(build.canStart, true)

  const pending = getPendingUpload()
  assert.equal(pending.queryPrompt, 'How does ASC resist thermal shock?')
  assert.equal(pending.simulationRequirement, 'How does ASC resist thermal shock?')

  const request = createBaseResearchRequestIntent(pending)
  assert.deepEqual(request.createPreparePayload('Thermal project'), {
    project_name: 'Thermal project',
    query_prompt: 'How does ASC resist thermal shock?',
    simulation_requirement: 'How does ASC resist thermal shock?',
    build_stage: 'base',
    source_corpus_type: 'survey',
    base_metadata_path: ''
  })

  clearPendingUpload()
})

test('connects dialog submit through the library and blocks empty questions before simulation creation or preparation', async () => {
  const [dialogSource, librarySource, mainSource, step1Source, step2Source] = await Promise.all([
    readFile(new URL('../src/features/research/ResearchQuestionDialog.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/DocumentLibraryView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Step2EnvSetup.vue', import.meta.url), 'utf8')
  ])

  assert.match(dialogSource, /emit\('submit', result\.question\)/)
  assert.match(librarySource, /@submit="startGraphBuild"/)
  assert.match(librarySource, /startResearchBuildFromLibrary\(documentRows\.value, selectedDocumentIds\.value, question\)/)
  assert.match(mainSource, /createBaseResearchRequestIntent\(pending\)/)
  assert.match(mainSource, /runBaseResearchRequests\(\{[\s\S]*pending,/)
  assert.match(step1Source, /if \(!projectResearchQuestion\(props\.projectData\)\) \{\s*return\s*\}[\s\S]*createSimulation/)
  assert.match(step2Source, /preparationState === 'missing-question'/)
  assert.match(step2Source, /reportMissing:[\s\S]*?start: async \(context\)/)
})

test('does not restore an empty research question in any frontend source when storing PDF library builds', async () => {
  const researchWorkflowSource = await readFile(
    new URL('../src/features/research/researchQuestionWorkflow.js', import.meta.url),
    'utf8'
  )
  const sourcePaths = await readdir(new URL('../src/', import.meta.url), { recursive: true })
  const sources = await Promise.all(sourcePaths
    .filter(path => /\.(?:js|vue)$/.test(path))
    .map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')))

  assert.doesNotMatch(sources.join('\n'), /setPendingUpload\(\[\],\s*'',/)
  assert.match(researchWorkflowSource, /setPendingUpload\(\[\], intent\.queryPrompt,/)
})
