import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  projectResearchQuestion,
  simulationPreparationState
} from '../src/features/research/simulationPreparationModel.js'

test('normalizes project research questions and prefers query_prompt', () => {
  assert.equal(projectResearchQuestion({
    query_prompt: '  Explain oxidation mechanisms.  ',
    simulation_requirement: 'Fallback question'
  }), 'Explain oxidation mechanisms.')
  assert.equal(projectResearchQuestion({
    query_prompt: '   ',
    simulation_requirement: '  Fallback question  '
  }), 'Fallback question')
  assert.equal(projectResearchQuestion({ query_prompt: ' \n ', simulation_requirement: '\t' }), '')
})

test('models simulation preparation as waiting, missing, or ready', () => {
  assert.equal(simulationPreparationState('', { query_prompt: 'Question' }), 'waiting-project')
  assert.equal(simulationPreparationState('s1', null), 'waiting-project')
  assert.equal(simulationPreparationState('s1', {}), 'missing-question')
  assert.equal(simulationPreparationState('s1', { simulation_requirement: 'Question' }), 'ready')
})

test('Step 1 blocks empty questions before simulation creation and keeps graph QA available', async () => {
  const source = await readFile(new URL('../src/components/Step1GraphBuild.vue', import.meta.url), 'utf8')
  const guardIndex = source.indexOf('projectResearchQuestion(props.projectData)')
  const createIndex = source.indexOf('await createSimulation(')

  assert.ok(guardIndex >= 0)
  assert.ok(createIndex > guardIndex)
  assert.match(source, /:disabled="currentPhase < 4 \|\| creatingSimulation \|\| !projectResearchQuestion\(projectData\)"/)
  assert.match(source, /@click="emit\('open-qa', projectData\)"/)
  assert.match(source, /当前项目缺少研究问题，不能进入 ASC 分析准备。你仍可使用图谱问答。/)
})

test('Step 2 defers preparation until project data is ready and exposes the missing-question QA recovery', async () => {
  const source = await readFile(new URL('../src/components/Step2EnvSetup.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /onMounted\(\(\) => \{[\s\S]*?startPrepareSimulation\(\)/)
  assert.match(source, /watch\([\s\S]*?simulationPreparationState\([\s\S]*?immediate:\s*true/)
  assert.match(source, /prepareStarted/)
  assert.match(source, /当前项目缺少研究问题，无法开始 ASC 分析准备。/)
  assert.match(source, /你仍可使用图谱问答/)
  assert.match(source, /@click="emit\('go-qa', projectData\)"/)
})

test('MainView and SimulationView route project-scoped QA actions through the shared navigator', async () => {
  const [mainView, simulationView] = await Promise.all([
    readFile(new URL('../src/views/MainView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/SimulationView.vue', import.meta.url), 'utf8')
  ])

  assert.match(mainView, /@open-qa="openCompletedGraphInQa"/)
  assert.match(simulationView, /@go-qa="openProjectGraphInQa"/)
  assert.match(simulationView, /navigateGraphProjectToQa/)
  assert.match(simulationView, /project:\s*projectData\.value/)
})

test('simulation prompt gate does not fabricate a default research question', async () => {
  const source = await readFile(new URL('../src/features/research/simulationPreparationModel.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /default research question|默认研究问题|simulation prompt/i)
})
