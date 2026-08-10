import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createResearchBuildIntent,
  normalizeResearchQuestion,
  runBaseResearchRequests,
  runProfessionalResearchRequests,
  startResearchBuildFromLibrary,
  validateResearchBuildDialogSubmission,
  validateResearchQuestionDialogSubmission
} from '../src/features/research/researchQuestionWorkflow.js'
import { clearPendingUpload, getPendingUpload, setPendingUpload } from '../src/store/pendingUpload.js'

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
    {
      projectName: '  project_8  ',
      question: '  Explain oxidation mechanisms.  '
    }
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
  assert.equal(pending.projectName, 'project_8')

  clearPendingUpload()
})

test('runs base ontology requests from the real pending snapshot with one normalized question', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], '  Explain oxidation mechanisms.  ')
  const pending = getPendingUpload()
  const preparePayloads = []
  const generationPayloads = []

  const result = await runBaseResearchRequests({
    pending,
    projectName: 'Base Graph Project',
    prepareOntologyProject: async (payload) => {
      preparePayloads.push(payload)
      return { success: true, data: { project_id: 'base-1' } }
    },
    generateOntology: async (formData) => {
      generationPayloads.push(formData)
      return { success: true, data: { project_id: 'base-1' } }
    }
  })

  assert.equal(result.canStart, true)
  assert.equal(preparePayloads.length, 1)
  assert.equal(preparePayloads[0].query_prompt, 'Explain oxidation mechanisms.')
  assert.equal(preparePayloads[0].simulation_requirement, 'Explain oxidation mechanisms.')
  assert.equal(generationPayloads.length, 1)
  assert.equal(generationPayloads[0].get('query_prompt'), 'Explain oxidation mechanisms.')
  assert.equal(generationPayloads[0].get('simulation_requirement'), 'Explain oxidation mechanisms.')

  clearPendingUpload()
})

test('does not call base ontology APIs from an empty pending research question', async () => {
  clearPendingUpload()
  setPendingUpload([], '   ', '', '', {
    dataType: 'pdf_library',
    buildStage: 'base',
    sourceCorpusType: 'survey',
    pdfLibraryFileIds: ['file-2']
  })
  let prepareCalls = 0
  let generationCalls = 0

  const result = await runBaseResearchRequests({
    pending: getPendingUpload(),
    prepareOntologyProject: async () => { prepareCalls++ },
    generateOntology: async () => { generationCalls++ }
  })

  assert.equal(result.canStart, false)
  assert.equal(result.researchQuestion, '')
  assert.equal(prepareCalls, 0)
  assert.equal(generationCalls, 0)

  clearPendingUpload()
})

test('throws a failed base-project preparation response to preserve MainView error handling', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')

  await assert.rejects(
    runBaseResearchRequests({
      pending: getPendingUpload(),
      prepareOntologyProject: async () => ({ success: false, error: 'prepare failed' }),
      generateOntology: async () => ({ success: true })
    }),
    /prepare failed/
  )

  clearPendingUpload()
})

test('does not retry a resolved base-generation failure', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')
  const attempts = []
  const failures = []
  const waits = []
  let generationCalls = 0

  await assert.rejects(
    runBaseResearchRequests({
      pending: getPendingUpload(),
      prepareOntologyProject: async () => ({ success: true, data: { project_id: 'base-1' } }),
      generateOntology: async () => {
        generationCalls++
        return { success: false, error: 'resolved generation failure' }
      },
      onAttempt: (attempt) => attempts.push(attempt),
      onFailure: ({ stage, attempt, error, retrying }) => failures.push({ stage, attempt, message: error.message, retrying }),
      waitForRetry: (attempt) => waits.push(attempt)
    }),
    /resolved generation failure/
  )

  assert.equal(generationCalls, 1)
  assert.deepEqual(attempts, [1])
  assert.deepEqual(waits, [])
  assert.deepEqual(failures, [{
    stage: 'generate',
    attempt: 1,
    message: 'resolved generation failure',
    retrying: false
  }])

  clearPendingUpload()
})

test('rethrows a non-network base-generation exception without retrying or waiting', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')
  const originalError = new Error('Request failed with status code 401')
  const waits = []
  const attemptErrors = []
  let generationCalls = 0

  await assert.rejects(
    runBaseResearchRequests({
      pending: getPendingUpload(),
      prepareOntologyProject: async () => ({ success: true, data: { project_id: 'base-1' } }),
      generateOntology: async () => {
        generationCalls++
        throw originalError
      },
      onAttemptError: ({ attempt, error, isNetworkError, retrying }) => {
        attemptErrors.push({ attempt, error, isNetworkError, retrying })
      },
      waitForRetry: (attempt) => waits.push(attempt)
    }),
    error => error === originalError
  )

  assert.equal(generationCalls, 1)
  assert.deepEqual(waits, [])
  assert.deepEqual(attemptErrors, [{
    attempt: 1,
    error: originalError,
    isNetworkError: false,
    retrying: false
  }])
  clearPendingUpload()
})

test('retries network base-generation exceptions up to three attempts with waits and classification', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')
  const originalError = new Error('Network Error while generating ontology')
  const waits = []
  const attemptErrors = []
  let generationCalls = 0

  await assert.rejects(
    runBaseResearchRequests({
      pending: getPendingUpload(),
      prepareOntologyProject: async () => ({ success: true, data: { project_id: 'base-1' } }),
      generateOntology: async () => {
        generationCalls++
        throw originalError
      },
      onAttemptError: ({ attempt, error, isNetworkError, retrying }) => {
        attemptErrors.push({ attempt, error, isNetworkError, retrying })
      },
      waitForRetry: (attempt, error) => waits.push({ attempt, error })
    }),
    error => error === originalError
  )

  assert.equal(generationCalls, 3)
  assert.deepEqual(waits, [
    { attempt: 1, error: originalError },
    { attempt: 2, error: originalError }
  ])
  assert.deepEqual(attemptErrors, [
    { attempt: 1, error: originalError, isNetworkError: true, retrying: true },
    { attempt: 2, error: originalError, isNetworkError: true, retrying: true },
    { attempt: 3, error: originalError, isNetworkError: true, retrying: false }
  ])
  clearPendingUpload()
})

test('retries timeout base-generation exceptions between attempts and stops after success', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')
  const timeoutError = Object.assign(new Error('request aborted'), { code: 'ECONNABORTED' })
  const waits = []
  const attemptErrors = []
  let generationCalls = 0

  const result = await runBaseResearchRequests({
    pending: getPendingUpload(),
    prepareOntologyProject: async () => ({ success: true, data: { project_id: 'base-1' } }),
    generateOntology: async () => {
      generationCalls++
      if (generationCalls < 3) throw timeoutError
      return { success: true, data: { project_id: 'base-1' } }
    },
    onAttemptError: ({ attempt, error, isNetworkError, retrying }) => {
      attemptErrors.push({ attempt, error, isNetworkError, retrying })
    },
    waitForRetry: (attempt, error) => waits.push({ attempt, error })
  })

  assert.equal(result.generationResponse.success, true)
  assert.equal(generationCalls, 3)
  assert.deepEqual(waits, [
    { attempt: 1, error: timeoutError },
    { attempt: 2, error: timeoutError }
  ])
  assert.deepEqual(attemptErrors, [
    { attempt: 1, error: timeoutError, isNetworkError: true, retrying: true },
    { attempt: 2, error: timeoutError, isNetworkError: true, retrying: true }
  ])
  clearPendingUpload()
})

test('keeps a resolved base-generation failure to one call even when maxRetries is larger than three', async () => {
  clearPendingUpload()
  startResearchBuildFromLibrary(documents, ['row-2'], 'Build a base graph')
  let generationCalls = 0
  const waits = []
  const failures = []

  await assert.rejects(
    runBaseResearchRequests({
      pending: getPendingUpload(),
      prepareOntologyProject: async () => ({ success: true, data: { project_id: 'base-1' } }),
      generateOntology: async () => {
        generationCalls++
        return { success: false, error: 'final generation failure' }
      },
      maxRetries: 99,
      onFailure: ({ attempt, retrying }) => failures.push({ attempt, retrying }),
      waitForRetry: (attempt) => waits.push(attempt)
    }),
    /final generation failure/
  )

  assert.equal(generationCalls, 1)
  assert.deepEqual(waits, [])
  assert.deepEqual(failures, [{ attempt: 1, retrying: false }])
  clearPendingUpload()
})

test('rejects an empty dialog submission before emitting a graph-build request', () => {
  assert.deepEqual(validateResearchQuestionDialogSubmission('   '), {
    canSubmit: false,
    question: '',
    error: '\u8bf7\u5148\u586b\u5199\u7814\u7a76\u95ee\u9898\u3002'
  })
})

test('validates and normalizes both project name and research question', () => {
  assert.deepEqual(validateResearchBuildDialogSubmission({
    projectName: '  project_8  ',
    question: '  Why does thermal shock matter?  '
  }), {
    canSubmit: true,
    projectName: 'project_8',
    question: 'Why does thermal shock matter?',
    error: ''
  })

  assert.deepEqual(validateResearchBuildDialogSubmission({
    projectName: '   ',
    question: 'Question'
  }), {
    canSubmit: false,
    projectName: '',
    question: 'Question',
    error: '请填写图谱名称。'
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

for (const workflow of ['base', 'professional']) {
  test(`${workflow} ontology generation uses three calls and two waits only for retryable network errors`, async () => {
    let generationCalls = 0
    const waits = []
    const networkError = Object.assign(new Error('socket closed'), { code: 'ERR_NETWORK' })
    const common = {
      prepareOntologyProject: async () => ({ success: true, data: { project_id: `${workflow}-1` } }),
      generateOntology: async () => {
        generationCalls++
        throw networkError
      },
      maxRetries: 99,
      waitForRetry: (attempt, error) => waits.push({ attempt, error })
    }
    const request = workflow === 'base'
      ? runBaseResearchRequests({ ...common, pending: { queryPrompt: 'Question' } })
      : runProfessionalResearchRequests({ ...common, question: 'Question' })

    await assert.rejects(request, error => error === networkError)
    assert.equal(generationCalls, 3)
    assert.deepEqual(waits, [
      { attempt: 1, error: networkError },
      { attempt: 2, error: networkError }
    ])
  })

  test(`${workflow} ontology generation uses one call and no wait for non-network errors`, async () => {
    let generationCalls = 0
    const waits = []
    const programError = new TypeError('invalid form data')
    const common = {
      prepareOntologyProject: async () => ({ success: true, data: { project_id: `${workflow}-1` } }),
      generateOntology: async () => {
        generationCalls++
        throw programError
      },
      waitForRetry: attempt => waits.push(attempt)
    }
    const request = workflow === 'base'
      ? runBaseResearchRequests({ ...common, pending: { queryPrompt: 'Question' } })
      : runProfessionalResearchRequests({ ...common, question: 'Question' })

    await assert.rejects(request, error => error === programError)
    assert.equal(generationCalls, 1)
    assert.deepEqual(waits, [])
  })

  test(`${workflow} ontology generation uses one call and no wait for resolved failures`, async () => {
    let generationCalls = 0
    const waits = []
    const common = {
      prepareOntologyProject: async () => ({ success: true, data: { project_id: `${workflow}-1` } }),
      generateOntology: async () => {
        generationCalls++
        return { success: false, error: `${workflow} resolved failure` }
      },
      waitForRetry: attempt => waits.push(attempt)
    }
    const request = workflow === 'base'
      ? runBaseResearchRequests({ ...common, pending: { queryPrompt: 'Question' } })
      : runProfessionalResearchRequests({ ...common, question: 'Question' })

    await assert.rejects(request, new RegExp(`${workflow} resolved failure`))
    assert.equal(generationCalls, 1)
    assert.deepEqual(waits, [])
  })
}

test('declares a required research-question dialog that allows component validation to run', async () => {
  const source = await readFile(new URL('../src/features/research/ResearchQuestionDialog.vue', import.meta.url), 'utf8')

  assert.match(source, /<textarea[^>]*required/)
  assert.match(source, /\u7814\u7a76\u95ee\u9898/)
  assert.match(source, /\u53d6\u6d88/)
  assert.match(source, /\u5f00\u59cb\u6784\u5efa/)
  assert.match(source, /<form novalidate @submit\.prevent="submit">/)
})
