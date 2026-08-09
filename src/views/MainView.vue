<template>
  <div class="main-view">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <div class="brand" @click="router.push('/')">NEXUS</div>
      </div>
      
      <div class="header-center">
        <div class="view-switcher">
          <button 
            v-for="mode in ['graph', 'split', 'workbench']" 
            :key="mode"
            class="switch-btn"
            :class="{ active: viewMode === mode }"
            @click="viewMode = mode"
          >
            {{ { graph: '图谱', split: '双栏', workbench: '工作台' }[mode] }}
          </button>
        </div>
      </div>

      <div class="header-right">
        <button
          v-if="canOpenCompletedGraphQa"
          class="qa-entry-button"
          type="button"
          @click="openCompletedGraphInQa(projectData)"
        >
          去图谱问答
        </button>
        <div class="workflow-step">
          <span class="step-num">Step {{ currentStep }}/5</span>
          <span class="step-name">{{ stepNames[currentStep - 1] }}</span>
        </div>
        <div class="step-divider"></div>
        <span class="status-indicator" :class="statusClass">
          <span class="dot"></span>
          {{ statusText }}
        </span>
      </div>
    </header>

    <WorkflowProgressBar
      :currentStep="currentStep"
      :stepProgress="stepProgress"
    />

    <div v-if="error" class="global-error-banner" role="alert">
      {{ error }}
    </div>

    <!-- Main Content Area -->
    <main class="content-area">
      <!-- Left Panel: Graph -->
      <div class="panel-wrapper left" :style="leftPanelStyle">
        <GraphPanel 
          :graphData="visibleGraphData"
          :loading="graphLoading"
          :currentPhase="currentPhase"
          @refresh="refreshGraph"
          @toggle-maximize="toggleMaximize('graph')"
        />
      </div>

      <!-- Right Panel: Step Components -->
      <div class="panel-wrapper right" :style="rightPanelStyle">
        <!-- Step 1: 图谱构建 -->
        <Step1GraphBuild 
          v-if="currentStep === 1"
          :currentPhase="currentPhase"
          :projectData="projectData"
          :ontologyProgress="ontologyProgress"
          :buildProgress="buildProgress"
          :graphData="visibleGraphData"
          :baseGraphData="baseGraphData"
          :professionalFilesCount="professionalUploadFiles.length"
          :baseMetadataPath="baseMetadataPath"
          :importedBaseMetadata="importedBaseMetadata"
          :baseNodesConfirmed="baseNodesConfirmed"
          :systemLogs="systemLogs"
          @build-graph="startBuildGraph"
          @base-node-updated="handleBaseNodeUpdated"
          @confirm-base-nodes="handleBaseNodesConfirmed"
          @base-metadata-imported="handleBaseMetadataImported"
          @professional-files-selected="handleProfessionalFilesSelected"
          @build-professional-graph="startProfessionalGraphBuild"
          @next-step="handleNextStep"
          @open-qa="openCompletedGraphInQa"
        />
        <!-- Step 2: 环境搭建 -->
        <Step2EnvSetup
          v-else-if="currentStep === 2"
          :projectData="projectData"
          :graphData="graphData"
          :systemLogs="systemLogs"
          @go-back="handleGoBack"
          @next-step="handleNextStep"
          @add-log="addLog"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GraphPanel from '../components/GraphPanel.vue'
import Step1GraphBuild from '../components/Step1GraphBuild.vue'
import Step2EnvSetup from '../components/Step2EnvSetup.vue'
import WorkflowProgressBar from '../components/WorkflowProgressBar.vue'
import { prepareOntologyProject, generateOntology, getProject, buildGraph, getTaskStatus, getGraphData } from '../api/graph'
import {
  completeMissingTaskGraphForQa,
  completeTaskGraphForQa,
  navigateGraphProjectToQa
} from '../features/projects/graphQaNavigation.js'
import { getPendingUpload, clearPendingUpload } from '../store/pendingUpload'
import {
  createBaseResearchRequestIntent,
  normalizeResearchQuestion,
  runBaseResearchRequests,
  runProfessionalResearchRequests
} from '../features/research/researchQuestionWorkflow.js'
import {
  canBuildGraphProject,
  GRAPH_BUILD_RESEARCH_QUESTION_ERROR,
  runGraphBuildProjectRequest
} from '../features/research/simulationPreparationModel.js'

const route = useRoute()
const router = useRouter()

// Layout State
const viewMode = ref('split') // graph | split | workbench

// Step State
const currentStep = ref(1) // 1: 图谱构建, 2: 分析准备, 3: 洞察查询, 4: 报告生成, 5: 深度问答
const stepNames = ['图谱构建', '分析准备', '洞察查询', '报告生成', '深度问答']

// Data State
const currentProjectId = ref(route.params.projectId)
const loading = ref(false)
const graphLoading = ref(false)
const error = ref('')
const projectData = ref(null)
const graphData = ref(null)
const baseProjectData = ref(null)
const baseGraphData = ref(null)
const professionalUploadFiles = ref([])
const baseMetadataPath = ref('')
const importedBaseMetadata = ref(null)
const baseProjectId = ref('')
const baseNodesConfirmed = ref(false)
const queryPromptForProfessional = ref('')
const currentPhase = ref(-1) // -1 Upload, 0 Base ontology, 1 Base build, 2 Base review / ready professional, 3 Professional build, 4 Ready analysis
const ontologyProgress = ref(null)
const buildProgress = ref(null)
const systemLogs = ref([])
const pendingBuildOptions = ref({})
const taskMissingLogged = ref(false)

// Polling timers
let pollTimer = null
let graphPollTimer = null
let graphFetchInFlight = false
let ontologyPollTimer = null
let lastOntologyProgressMessage = ''
const GRAPH_VISUAL_POLL_INTERVAL_MS = 2500
const TASK_STATUS_POLL_INTERVAL_MS = 1200
const ONTOLOGY_GENERATION_MAX_RETRIES = 3
const ONTOLOGY_RETRY_DELAY_MS = 3000
const waitForOntologyRetry = () => new Promise(resolve => setTimeout(resolve, ONTOLOGY_RETRY_DELAY_MS))

const graphDataSignature = (data) => {
  if (!data) return 'empty'
  const nodes = data.nodes || []
  const edges = data.edges || []
  const nodeCount = data.node_count || data.nodes?.length || 0
  const edgeCount = data.edge_count || data.edges?.length || 0
  const realtimeRound = data.professional_realtime_round ?? data.base_realtime_batch ?? ''
  const nodeLimit = data.base_realtime_node_limit ?? data.professional_requested_new_node_count ?? ''
  const edgeLimit = data.base_realtime_edge_limit ?? data.professional_requested_new_edge_count ?? ''
  const firstNode = nodes[0]?.id || nodes[0]?.uuid || nodes[0]?.name || ''
  const lastNode = nodes[nodes.length - 1]?.id || nodes[nodes.length - 1]?.uuid || nodes[nodes.length - 1]?.name || ''
  const firstEdge = edges[0]?.id || edges[0]?.uuid || edges[0]?.source || ''
  const lastEdge = edges[edges.length - 1]?.id || edges[edges.length - 1]?.uuid || edges[edges.length - 1]?.target || ''
  return [nodeCount, edgeCount, realtimeRound, nodeLimit, edgeLimit, firstNode, lastNode, firstEdge, lastEdge].join(':')
}

// --- Computed Layout Styles ---
const leftPanelStyle = computed(() => {
  if (viewMode.value === 'graph') return { width: '100%', opacity: 1, transform: 'translateX(0)' }
  if (viewMode.value === 'workbench') return { width: '0%', opacity: 0, transform: 'translateX(-20px)' }
  return { width: '50%', opacity: 1, transform: 'translateX(0)' }
})

const rightPanelStyle = computed(() => {
  if (viewMode.value === 'workbench') return { width: '100%', opacity: 1, transform: 'translateX(0)' }
  if (viewMode.value === 'graph') return { width: '0%', opacity: 0, transform: 'translateX(20px)' }
  return { width: '50%', opacity: 1, transform: 'translateX(0)' }
})

// --- Status Computed ---
const statusClass = computed(() => {
  if (error.value) return 'error'
  if (currentPhase.value === 0 && projectData.value?.ontology) return 'completed'
  if (currentPhase.value >= 4) return 'completed'
  return 'processing'
})

const statusText = computed(() => {
  if (error.value) return 'Error'
  if (currentPhase.value >= 4) return 'Ready'
  if (currentPhase.value === 3) return 'Building Professional Research'
  if (currentPhase.value === 2 && baseNodesConfirmed.value) return 'Ready For Professional Research'
  if (currentPhase.value === 2) return 'Reviewing Base Nodes'
  if (currentPhase.value === 1) return 'Building Base Graph'
  if (currentPhase.value === 0 && projectData.value?.ontology) return 'Ready To Build'
  if (currentPhase.value === 0) return 'Generating Ontology'
  return 'Initializing'
})

const canOpenCompletedGraphQa = computed(() => (
  projectData.value?.status === 'graph_completed'
  && Boolean(String(projectData.value?.project_id || '').trim())
  && Boolean(String(projectData.value?.graph_id || '').trim())
))

const stepProgress = computed(() => {
  if (currentStep.value > 1) return 100
  if (currentPhase.value < 0) return 5
  if (currentPhase.value === 0) {
    const ontologyPct = Number(ontologyProgress.value?.progress || projectData.value?.ontology_progress?.progress || 0)
    return Math.min(30, Math.max(8, Math.round(ontologyPct * 0.3)))
  }
  if (currentPhase.value === 1) {
    const graphBuild = Number(buildProgress.value?.progress || 0)
    return Math.min(58, 30 + Math.round(graphBuild * 0.28))
  }
  if (currentPhase.value === 2) return baseNodesConfirmed.value ? 68 : 62
  if (currentPhase.value === 3) {
    const graphBuild = Number(buildProgress.value?.progress || 0)
    return Math.min(95, 68 + Math.round(graphBuild * 0.27))
  }
  if (currentPhase.value >= 4) return 100
  return 0
})

const visibleGraphData = computed(() => {
  if (currentPhase.value === 3 && !graphData.value && baseGraphData.value) {
    return baseGraphData.value
  }
  if (!graphData.value) return null
  if (currentPhase.value === 3) {
    return graphData.value
  }
  const hasCurrentGraphId = Boolean(projectData.value?.graph_id)
  const phaseAllowsGraph = currentPhase.value === 1 || currentPhase.value === 2 || currentPhase.value === 3 || currentPhase.value >= 4
  if (!hasCurrentGraphId || !phaseAllowsGraph) return null
  return graphData.value
})

// --- Helpers ---
const addLog = (msg) => {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0')
  systemLogs.value.push({ time, msg })
  // Keep last 100 logs
  if (systemLogs.value.length > 100) {
    systemLogs.value.shift()
  }
}

const openCompletedGraphInQa = async (project) => {
  const navigated = await navigateGraphProjectToQa({
    project,
    browser: globalThis,
    navigate: (qaRoute) => router.replace(qaRoute)
  })
  if (!navigated) {
    error.value = '图谱构建完成响应缺少 project_id 或 graph_id，无法进入问答。'
    addLog(error.value)
    return false
  }
  return true
}

const reportGraphCompletionFailure = (result) => {
  if (result?.status !== 'error') return
  error.value = result.message || 'Final graph loading failed; QA navigation was cancelled.'
  addLog(error.value)
}

const applyCompletedGraphState = (project, buildStage) => {
  projectData.value = project
  if (buildStage === 'base') {
    baseProjectData.value = project
    baseProjectId.value = project.project_id
    baseGraphData.value = graphData.value
    baseMetadataPath.value = project.base_metadata_file || project.latest_graph_metadata_file || baseMetadataPath.value
    baseNodesConfirmed.value = false
    currentPhase.value = 2
    addLog(`Base graph metadata ready: ${baseMetadataPath.value || 'not found'}`)
    addLog('Waiting for Base Node expert review in Step 02 before Professional Research.')
  } else {
    baseNodesConfirmed.value = true
    baseProjectId.value = project.base_project_id || baseProjectId.value
    baseMetadataPath.value = project.base_metadata_path || baseMetadataPath.value
    currentPhase.value = 4
    addLog('Professional Research graph completed; analysis preparation is now available.')
  }
}

const displayOntologyProgress = (progress = {}) => {
  const baseMessage = progress.message || '本体生成中...'
  const startedAt = progress.updated_at ? new Date(progress.updated_at).getTime() : 0
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  const waitingForLlm = ['ontology_llm_attempt', 'ontology_llm_ready'].includes(progress.stage)
  return {
    progress: progress.progress || 0,
    message: waitingForLlm && elapsedSeconds > 0
      ? `${baseMessage}（等待 ${elapsedSeconds}s）`
      : baseMessage,
    raw_message: baseMessage,
    stage: progress.stage,
    attempt: progress.attempt,
    total_attempts: progress.total_attempts,
    updated_at: progress.updated_at,
    elapsed_seconds: elapsedSeconds
  }
}

const applyOntologyProjectUpdate = (project) => {
  if (!project) return
  projectData.value = project
  if (!project.graph_id) {
    graphData.value = null
  }
  const progress = project.ontology_progress
  if (progress) {
    const displayProgress = displayOntologyProgress(progress)
    ontologyProgress.value = displayProgress
    if (displayProgress.raw_message && displayProgress.raw_message !== lastOntologyProgressMessage) {
      addLog(displayProgress.raw_message)
      lastOntologyProgressMessage = displayProgress.raw_message
    }
  }
  updatePhaseByStatus(project.status)
}

const pollOntologyProject = async (projectId) => {
  if (!projectId) return
  try {
    const res = await getProject(projectId)
    if (!res.success) return
    applyOntologyProjectUpdate(res.data)
    if (res.data.status === 'ontology_generated') {
      stopOntologyPolling()
      ontologyProgress.value = null
    } else if (res.data.status === 'failed') {
      stopOntologyPolling()
      error.value = res.data.error || res.data.ontology_progress?.message || '本体生成失败'
    }
  } catch (err) {
    console.warn('Ontology progress polling error:', err)
  }
}

const startOntologyPolling = (projectId) => {
  stopOntologyPolling()
  lastOntologyProgressMessage = ''
  pollOntologyProject(projectId)
  ontologyPollTimer = setInterval(() => pollOntologyProject(projectId), 1000)
}

// --- Layout Methods ---
const toggleMaximize = (target) => {
  if (viewMode.value === target) {
    viewMode.value = 'split'
  } else {
    viewMode.value = target
  }
}

const handleNextStep = (params = {}) => {
  if (currentStep.value < 5) {
    currentStep.value++
    addLog(`进入 Step ${currentStep.value}: ${stepNames[currentStep.value - 1]}`)
    
    // 如果是从 Step 2 进入 Step 3，记录分析准备摘要
    if (currentStep.value === 3 && params.analysisMode) {
      addLog(`ASC分析模块: ${params.modulesCount || 0} 个`)
    }
  }
}

const handleGoBack = () => {
  if (currentStep.value > 1) {
    currentStep.value--
    addLog(`返回 Step ${currentStep.value}: ${stepNames[currentStep.value - 1]}`)
  }
}

// --- Data Logic ---

const initProject = async () => {
  addLog('Project view initialized.')
  if (currentProjectId.value === 'new') {
    await handleNewProject()
  } else {
    await loadProject()
  }
}

const buildOptionsFromPendingUpload = (pending) => {
  const buildStage = pending.buildStage || 'base'
  return {
    build_stage: buildStage,
    source_corpus_type: pending.sourceCorpusType || (buildStage === 'professional' ? 'research' : 'survey'),
    base_metadata_path: pending.baseMetadataPath || '',
    base_project_id: pending.baseProjectId || '',
    data_type: pending.dataType || 'markdown',
    pdf_library_file_ids: pending.pdfLibraryFileIds || []
  }
}

const stageDisplayName = (stage) => stage === 'professional' ? '专业细化' : '基座构建'

const handleNewProject = async () => {
  const pending = getPendingUpload()
  const baseRequestIntent = createBaseResearchRequestIntent(pending)
  const researchQuestion = baseRequestIntent.researchQuestion
  if (!baseRequestIntent.canStart) {
    error.value = '请先填写研究问题。'
    addLog('Graph build blocked: a research question is required before ontology generation.')
    return
  }
  const baseFiles = pending.filesByStage?.base?.length
    ? pending.filesByStage.base
    : (pending.buildStage && pending.buildStage !== 'base' ? [] : (pending.files || []))
  const basePdfLibraryFileIds = Array.isArray(pending.pdfLibraryFileIds) ? pending.pdfLibraryFileIds : []
  if (!pending.isPending || (baseFiles.length === 0 && basePdfLibraryFileIds.length === 0)) {
    error.value = 'No pending files found.'
    addLog('Error: No base files or PDF library references found for new project.')
    return
  }
  professionalUploadFiles.value = []
  queryPromptForProfessional.value = researchQuestion
  graphData.value = null
  baseGraphData.value = null
  baseProjectData.value = null
  baseMetadataPath.value = ''
  importedBaseMetadata.value = null
  baseProjectId.value = ''
  baseNodesConfirmed.value = false
  const initialFiles = baseFiles
  const initialPdfLibraryFileIds = basePdfLibraryFileIds
  const initialStage = 'base'
  
  // 重试配置
  try {
    loading.value = true
    currentPhase.value = 0
    graphData.value = null
    baseGraphData.value = null
    pendingBuildOptions.value = {
      ...buildOptionsFromPendingUpload(pending),
      build_stage: initialStage,
      source_corpus_type: 'survey',
      base_metadata_path: ''
    }
    ontologyProgress.value = { message: `Uploading and analyzing ${stageDisplayName(pendingBuildOptions.value.build_stage)} docs...` }
    addLog(`Starting ontology generation for ${stageDisplayName(pendingBuildOptions.value.build_stage)} files: ${initialFiles.length || initialPdfLibraryFileIds.length}`)

    const requestResult = await runBaseResearchRequests({
      pending,
      projectName: pending.projectName || `${stageDisplayName(initialStage)} Graph Project`,
      prepareOntologyProject,
      generateOntology,
      maxRetries: ONTOLOGY_GENERATION_MAX_RETRIES,
      waitForRetry: waitForOntologyRetry,
      onPrepared: async (prepareRes) => {
        currentProjectId.value = prepareRes.data.project_id
        projectData.value = prepareRes.data
        graphData.value = null
        baseGraphData.value = null
        if (initialStage === 'base') {
          baseProjectData.value = prepareRes.data
          baseProjectId.value = prepareRes.data.project_id
        }
        router.replace({ name: 'Process', params: { projectId: prepareRes.data.project_id } })
        startOntologyPolling(prepareRes.data.project_id)
        addLog(`Ontology project prepared: ${prepareRes.data.project_id}`)
      },
      onAttempt: (attempt, maxRetries) => {
        addLog(`Attempt ${attempt}/${maxRetries}: Sending ontology generation request...`)
      },
      onAttemptError: ({ attempt, error: requestError, isNetworkError, retrying }) => {
        if (isNetworkError && retrying) {
          const errorMsg = requestError.message || String(requestError)
          addLog(`⚠ Network error detected: ${errorMsg}`)
          addLog(`Retrying in 3 seconds... (${attempt}/${ONTOLOGY_GENERATION_MAX_RETRIES})`)
        }
      },
      onFailure: ({ stage, error: requestError }) => {
        if (stage === 'generate') {
          error.value = requestError.message || 'Ontology generation failed'
          addLog(`Error generating ontology: ${error.value}`)
        }
      }
    })
    const res = requestResult.generationResponse
    clearPendingUpload()
    currentProjectId.value = res.data.project_id
    projectData.value = res.data
    graphData.value = null
    baseGraphData.value = null
    if (initialStage === 'base') {
      baseProjectData.value = res.data
      baseProjectId.value = res.data.project_id
    }
    router.replace({ name: 'Process', params: { projectId: res.data.project_id } })
    stopOntologyPolling()
    ontologyProgress.value = null
    addLog(`✓ Ontology generated successfully for project ${res.data.project_id}`)
    addLog(`构建阶段: ${stageDisplayName(pendingBuildOptions.value.build_stage)}${pendingBuildOptions.value.base_metadata_path ? `，base metadata: ${pendingBuildOptions.value.base_metadata_path}` : ''}`)
    addLog(`推荐实体节点数: ${res.data.recommended_entity_node_count || res.data.entity_node_limit || 60}，推荐关系边数: ${res.data.recommended_edge_count || res.data.target_edge_count || 180}，达标后迭代: ${res.data.recommended_post_target_edge_iterations ?? res.data.post_target_edge_iterations ?? 2}`)
    return
    
  } catch (err) {
    // 最终错误处理
    const errorMsg = err.message || String(err)
    
    // 详细的错误信息
    let userFriendlyError = 'Failed to generate ontology'
    
    if (errorMsg.includes('Network Error') || errorMsg.includes('ECONNABORTED')) {
      userFriendlyError = 'Network connection error. Please check your internet connection and try again.'
    } else if (errorMsg.includes('timeout')) {
      userFriendlyError = 'Request timeout. The server took too long to respond. Please try again.'
    } else if (errorMsg.includes('LLM') || errorMsg.includes('API')) {
      userFriendlyError = 'LLM service error. Please check your API configuration and try again.'
    } else if (errorMsg.includes('JSON')) {
      userFriendlyError = 'Invalid response format from LLM. Please try again.'
    }
    
    error.value = userFriendlyError
    addLog(`✗ Exception in handleNewProject: ${userFriendlyError}`)
    addLog(`Technical details: ${errorMsg}`)
    
    // 记录原始错误用于调试
    console.error('handleNewProject error:', {
      message: errorMsg,
      originalError: err,
      attempts: ONTOLOGY_GENERATION_MAX_RETRIES
    })
    
  } finally {
    loading.value = false
  }
}

const loadProject = async () => {
  try {
    loading.value = true
    addLog(`Loading project ${currentProjectId.value}...`)
    const res = await getProject(currentProjectId.value)
    if (res.success) {
      projectData.value = res.data
      updatePhaseByStatus(res.data.status)
      addLog(`Project loaded. Status: ${res.data.status}`)
      
      if (res.data.status === 'ontology_generating') {
        graphData.value = null
        if (res.data.ontology_progress) {
          ontologyProgress.value = displayOntologyProgress(res.data.ontology_progress)
        }
        startOntologyPolling(res.data.project_id)
        addLog('Ontology generation is still running; resumed progress polling.')
      } else if (res.data.status === 'ontology_generated' && !res.data.graph_id) {
        graphData.value = null
        addLog(`项目已生成本体，推荐实体节点数: ${res.data.recommended_entity_node_count || res.data.entity_node_limit || 60}，推荐关系边数: ${res.data.recommended_edge_count || res.data.target_edge_count || 180}，达标后迭代: ${res.data.recommended_post_target_edge_iterations ?? res.data.post_target_edge_iterations ?? 2}`)
      } else if (res.data.status === 'graph_building' && res.data.graph_build_task_id) {
        const runningStage = res.data.graph_build_stage || 'base'
        currentPhase.value = runningStage === 'professional' ? 3 : 1
        baseNodesConfirmed.value = runningStage === 'professional'
        startPollingTask(res.data.graph_build_task_id, runningStage)
        startGraphPolling()
      } else if (res.data.status === 'graph_completed' && res.data.graph_id) {
        const completedStage = res.data.graph_build_stage || 'base'
        currentPhase.value = completedStage === 'professional' ? 4 : 2
        baseNodesConfirmed.value = completedStage === 'professional'
        await loadGraph(res.data.graph_id)
        if (completedStage === 'base') {
          baseProjectData.value = res.data
          baseProjectId.value = res.data.project_id
          baseGraphData.value = graphData.value
          baseMetadataPath.value = res.data.base_metadata_file || res.data.latest_graph_metadata_file || ''
        } else {
          baseProjectId.value = res.data.base_project_id || baseProjectId.value
          baseMetadataPath.value = res.data.base_metadata_path || baseMetadataPath.value
        }
      }
    } else {
      error.value = res.error
      addLog(`Error loading project: ${res.error}`)
    }
  } catch (err) {
    error.value = err.message
    addLog(`Exception in loadProject: ${err.message}`)
  } finally {
    loading.value = false
  }
}

const updatePhaseByStatus = (status) => {
  switch (status) {
    case 'created':
    case 'ontology_generating':
    case 'ontology_generated':
      currentPhase.value = projectData.value?.graph_build_stage === 'professional' ? 3 : 0
      break;
    case 'graph_building':
      currentPhase.value = projectData.value?.graph_build_stage === 'professional' ? 3 : 1
      break;
    case 'graph_completed':
      currentPhase.value = projectData.value?.graph_build_stage === 'professional' ? 4 : 2
      break;
    case 'failed':
      currentPhase.value = projectData.value?.ontology ? 0 : -1
      error.value = 'Project failed'
      break;
  }
}

const startBuildGraph = async (options = {}) => {
  if (!canBuildGraphProject(projectData.value)) {
    error.value = GRAPH_BUILD_RESEARCH_QUESTION_ERROR
    addLog('Graph build blocked: project research question is empty after normalization.')
    return
  }

  try {
    error.value = ''
    const buildStage = options.build_stage || projectData.value?.graph_build_stage || pendingBuildOptions.value.build_stage || 'base'
    const sourceCorpusType = options.source_corpus_type || projectData.value?.source_corpus_type || pendingBuildOptions.value.source_corpus_type || (buildStage === 'professional' ? 'research' : 'survey')
    const effectiveBaseMetadataPath = options.base_metadata_path || projectData.value?.base_metadata_path || pendingBuildOptions.value.base_metadata_path || ''
    const effectiveBaseProjectId = importedBaseMetadata.value
      ? ''
      : (options.base_project_id || projectData.value?.base_project_id || baseProjectId.value || baseProjectData.value?.project_id || '')
    const entityNodeLimit = Number(options.entity_node_limit || projectData.value?.entity_node_limit || projectData.value?.recommended_entity_node_count || 60)
    const targetEdgeCount = Number(options.target_edge_count || projectData.value?.target_edge_count || projectData.value?.recommended_edge_count || 180)
    const postTargetEdgeIterations = Number(options.post_target_edge_iterations ?? projectData.value?.post_target_edge_iterations ?? projectData.value?.recommended_post_target_edge_iterations ?? 2)
    currentPhase.value = buildStage === 'professional' ? 3 : 1
    projectData.value = {
      ...(projectData.value || {}),
      status: 'graph_building',
      graph_id: null,
      graph_build_task_id: null,
      graph_build_stage: buildStage,
      entity_node_limit: entityNodeLimit,
      target_edge_count: targetEdgeCount,
      post_target_edge_iterations: postTargetEdgeIterations
    }
    graphData.value = null
    if (buildStage === 'base') {
      baseNodesConfirmed.value = false
      baseGraphData.value = null
      baseProjectData.value = null
      baseProjectId.value = ''
      baseMetadataPath.value = ''
      importedBaseMetadata.value = null
      graphData.value = null
    }
    buildProgress.value = { progress: 0, message: `Starting ${stageDisplayName(buildStage)} build...` }
    const buildLimitText = buildStage === 'professional'
      ? `new professional nodes: ${entityNodeLimit}, new professional edges: ${targetEdgeCount}`
      : `entity node limit: ${entityNodeLimit}, target edges: ${targetEdgeCount}`
    addLog(`Initiating ${stageDisplayName(buildStage)} graph build with ${buildLimitText}, post-target iterations: ${postTargetEdgeIterations}`)
    
    const payload = {
      project_id: currentProjectId.value,
      entity_node_limit: entityNodeLimit,
      target_edge_count: targetEdgeCount,
      post_target_edge_iterations: postTargetEdgeIterations,
      build_stage: buildStage,
      source_corpus_type: sourceCorpusType
    }
    if (buildStage === 'professional') {
      payload.base_metadata_path = effectiveBaseMetadataPath
      payload.base_project_id = effectiveBaseProjectId
      payload.professional_new_node_count = entityNodeLimit
      payload.professional_new_edge_count = targetEdgeCount
    }
    const graphBuildResult = await runGraphBuildProjectRequest({
      project: projectData.value,
      payload,
      buildGraph
    })
    const res = graphBuildResult.response
    if (res.success) {
      addLog(`Graph build task started. Task ID: ${res.data.task_id}`)
      startGraphPolling()
      startPollingTask(res.data.task_id, buildStage)
    } else {
      error.value = res.error
      addLog(`Error starting build: ${res.error}`)
    }
  } catch (err) {
    error.value = err.message
    addLog(`Exception in startBuildGraph: ${err.message}`)
  }
}

const nodeIdOf = (node) => node?.uuid || node?.id

const replaceNodeInGraph = (graph, updatedNode) => {
  const updatedId = nodeIdOf(updatedNode)
  if (!graph || !updatedId || !Array.isArray(graph.nodes)) return graph
  let changed = false
  const nodes = graph.nodes.map((node) => {
    if (nodeIdOf(node) !== updatedId) return node
    changed = true
    return { ...node, ...updatedNode }
  })
  return changed ? { ...graph, nodes } : graph
}

const handleBaseNodeUpdated = async (updatedNode) => {
  baseGraphData.value = replaceNodeInGraph(baseGraphData.value, updatedNode)
  graphData.value = replaceNodeInGraph(graphData.value, updatedNode)
  addLog(`Base Node metadata updated: ${updatedNode?.name || updatedNode?.name_zh || nodeIdOf(updatedNode)}`)
  if (projectData.value?.graph_id) {
    await loadGraph(projectData.value.graph_id)
    baseGraphData.value = graphData.value
  }
}

const handleBaseNodesConfirmed = () => {
  baseNodesConfirmed.value = true
  addLog('Base Node expert review confirmed. Step 03 Professional Research is now unlocked.')
}

const handleBaseMetadataImported = (metadata) => {
  if (!metadata?.path || !metadata?.graph) {
    error.value = '导入的 Base Graph JSON 缺少可用图数据。'
    addLog('Base Graph JSON import rejected: missing path or graph payload.')
    return
  }
  importedBaseMetadata.value = metadata
  baseMetadataPath.value = metadata.path
  baseProjectId.value = ''
  baseGraphData.value = metadata.graph
  graphData.value = metadata.graph
  error.value = ''
  addLog(`Base Node metadata imported: ${metadata.node_count} nodes updated; ${metadata.edge_count} existing edges preserved for Professional Research.`)
}

const handleProfessionalFilesSelected = (files) => {
  professionalUploadFiles.value = Array.from(files || [])
  if (professionalUploadFiles.value.length) {
    addLog(`Professional Research files selected in Step 03: ${professionalUploadFiles.value.length}`)
  } else {
    addLog('Professional Research file selection cleared or no Markdown files detected.')
  }
}

const startProfessionalGraphBuild = async (options = {}) => {
  if (!baseNodesConfirmed.value) {
    error.value = '请先完成 Step 02 的 Base Node 人工校准。'
    addLog('Professional Research build blocked: Base Node review is not confirmed.')
    return
  }
  if (!professionalUploadFiles.value.length) {
    error.value = '缺少 Professional Research 导入文件。'
    addLog('Professional Research build blocked: no research files were loaded.')
    return
  }
  const effectiveBaseMetadataPath = (
    baseMetadataPath.value ||
    baseProjectData.value?.base_metadata_file ||
    baseProjectData.value?.latest_graph_metadata_file ||
    projectData.value?.base_metadata_file ||
    projectData.value?.latest_graph_metadata_file ||
    ''
  )
  const effectiveBaseProjectId = importedBaseMetadata.value
    ? ''
    : (
        baseProjectId.value ||
        baseProjectData.value?.project_id ||
        projectData.value?.base_project_id ||
        currentProjectId.value ||
        ''
      )
  if (!effectiveBaseMetadataPath) {
    error.value = '缺少 base_*.json 元数据，无法进行 Professional Research 构建。'
    addLog('Professional Research build blocked: missing base metadata.')
    return
  }
  const researchQuestion = normalizeResearchQuestion(
    queryPromptForProfessional.value || projectData.value?.query_prompt || projectData.value?.simulation_requirement || ''
  )
  if (!researchQuestion) {
    error.value = '请先填写研究问题。'
    addLog('Professional Research build blocked: a research question is required before ontology generation.')
    return
  }

  try {
    error.value = ''
    currentPhase.value = 3
    ontologyProgress.value = { message: '正在为 Professional Research 文件生成本体...' }
    buildProgress.value = { progress: 0, message: 'Generating Professional Research ontology...' }
    addLog(`Creating Professional Research project with ${professionalUploadFiles.value.length} file(s).`)

    const requestResult = await runProfessionalResearchRequests({
      question: researchQuestion,
      files: professionalUploadFiles.value,
      baseMetadataPath: effectiveBaseMetadataPath,
      baseProjectId: effectiveBaseProjectId,
      prepareOntologyProject,
      generateOntology,
      maxRetries: ONTOLOGY_GENERATION_MAX_RETRIES,
      waitForRetry: waitForOntologyRetry,
      onPrepared: async (prepareRes) => {
        currentProjectId.value = prepareRes.data.project_id
        projectData.value = prepareRes.data
        graphData.value = null
        router.replace({ name: 'Process', params: { projectId: prepareRes.data.project_id } })
        startOntologyPolling(prepareRes.data.project_id)
        addLog(`Professional ontology project prepared: ${prepareRes.data.project_id}`)
      },
      onAttempt: (attempt, maxRetries) => {
        addLog(`Attempt ${attempt}/${maxRetries}: Sending Professional Research ontology generation request...`)
      },
      onAttemptError: ({ attempt, error: requestError, isNetworkError, retrying }) => {
        if (isNetworkError && retrying) {
          addLog(`⚠ Professional Research network error: ${requestError.message || String(requestError)}`)
          addLog(`Retrying Professional Research ontology generation in 3 seconds... (${attempt}/${ONTOLOGY_GENERATION_MAX_RETRIES})`)
        }
      },
      onFailure: ({ stage, error: requestError }) => {
        if (stage === 'generate') {
          error.value = requestError.message || 'Professional Research ontology generation failed'
          addLog(`Professional ontology generation failed: ${error.value}`)
        }
      }
    })
    const prepareRes = requestResult.prepareResponse
    if (!prepareRes.success) {
      error.value = prepareRes.error || 'Professional Research 项目预创建失败'
      addLog(`Professional project preparation failed: ${error.value}`)
      return
    }
    const res = requestResult.generationResponse
    if (!res.success) {
      error.value = res.error || 'Professional Research 本体生成失败'
      addLog(`Professional ontology generation failed: ${error.value}`)
      return
    }

    currentProjectId.value = res.data.project_id
    projectData.value = res.data
    baseMetadataPath.value = effectiveBaseMetadataPath
    baseProjectId.value = effectiveBaseProjectId
    graphData.value = null
    stopOntologyPolling()
    ontologyProgress.value = null
    router.replace({ name: 'Process', params: { projectId: res.data.project_id } })
    addLog(`Professional Research project created: ${res.data.project_id}`)

    await startBuildGraph({
      build_stage: 'professional',
      source_corpus_type: 'research',
      base_metadata_path: effectiveBaseMetadataPath,
      base_project_id: effectiveBaseProjectId,
      entity_node_limit: options.entity_node_limit || res.data.entity_node_limit || res.data.recommended_entity_node_count,
      target_edge_count: options.target_edge_count || res.data.target_edge_count || res.data.recommended_edge_count,
      post_target_edge_iterations: options.post_target_edge_iterations ?? res.data.post_target_edge_iterations ?? res.data.recommended_post_target_edge_iterations
    })
  } catch (err) {
    error.value = err.message || 'Professional Research 构建启动失败'
    addLog(`Exception in startProfessionalGraphBuild: ${error.value}`)
  } finally {
    ontologyProgress.value = null
  }
}

const startGraphPolling = () => {
  stopGraphPolling()
  addLog('Started polling for graph data...')
  fetchGraphData()
  graphPollTimer = setInterval(fetchGraphData, GRAPH_VISUAL_POLL_INTERVAL_MS)
}

const fetchGraphData = async () => {
  if (graphFetchInFlight) return
  graphFetchInFlight = true
  try {
    // Refresh project info to check for graph_id
    const projRes = await getProject(currentProjectId.value)
    if (projRes.success) {
      projectData.value = projRes.data
      updatePhaseByStatus(projRes.data.status)
    }
    if (projRes.success && projRes.data.graph_id) {
      const gRes = await getGraphData(projRes.data.graph_id)
      if (gRes.success) {
        const oldNodeCount = graphData.value?.node_count || graphData.value?.nodes?.length || 0
        const oldEdgeCount = graphData.value?.edge_count || graphData.value?.edges?.length || 0
        const oldRealtimeRound = graphData.value?.professional_realtime_round ?? null
        const nodeCount = gRes.data.node_count || gRes.data.nodes?.length || 0
        const edgeCount = gRes.data.edge_count || gRes.data.edges?.length || 0
        const realtimeRound = gRes.data.professional_realtime_round ?? null
        const changed = graphDataSignature(gRes.data) !== graphDataSignature(graphData.value)
        if (changed || !graphData.value) {
          graphData.value = gRes.data
        }
        if (
          changed && (
            nodeCount !== oldNodeCount ||
            edgeCount !== oldEdgeCount ||
            realtimeRound !== oldRealtimeRound
          )
        ) {
          addLog(`Graph data refreshed. Nodes: ${nodeCount}, Edges: ${edgeCount}${realtimeRound !== null ? `, Round: ${realtimeRound}` : ''}`)
        }
      }
    }
  } catch (err) {
    console.warn('Graph fetch error:', err)
  } finally {
    graphFetchInFlight = false
  }
}

const startPollingTask = (taskId, buildStage = 'base') => {
  taskMissingLogged.value = false
  pollTaskStatus(taskId, buildStage)
  pollTimer = setInterval(() => pollTaskStatus(taskId, buildStage), TASK_STATUS_POLL_INTERVAL_MS)
}

const pollTaskStatus = async (taskId, buildStage = 'base') => {
  try {
    const res = await getTaskStatus(taskId)
    if (res.success) {
      const task = res.data
      
      // Log progress message if it changed
      if (task.message && task.message !== buildProgress.value?.message) {
        addLog(task.message)
      }
      
      buildProgress.value = { progress: task.progress || 0, message: task.message }
      
      if (task.status === 'completed') {
        addLog('Graph build task completed.')
        stopPolling()
        stopGraphPolling() // Stop polling, do final load

        const completion = await completeTaskGraphForQa({
          projectId: currentProjectId.value,
          getProject,
          loadGraph,
          onReady: (project) => applyCompletedGraphState(project, buildStage),
          navigateWhenReady: false
        })
        reportGraphCompletionFailure(completion)
      } else if (task.status === 'failed') {
        stopPolling()
        error.value = task.error
        addLog(`Graph build task failed: ${task.error}`)
      }
    }
  } catch (e) {
    const message = String(e?.message || '')
    if (message.includes('任务不存在') || message.includes('404')) {
      if (!taskMissingLogged.value) {
        addLog('Task status is unavailable; continuing project and graph polling.')
        taskMissingLogged.value = true
      }
      const completion = await completeMissingTaskGraphForQa({
        projectId: currentProjectId.value,
        getProject,
        loadGraph,
        onCompletedProject: () => {
          stopPolling()
          stopGraphPolling()
        },
        onReady: (project) => applyCompletedGraphState(project, buildStage),
        navigateWhenReady: false
      })
      if (completion.status === 'pending') {
        projectData.value = completion.project
        updatePhaseByStatus(completion.project.status)
        if (completion.project.graph_id) await fetchGraphData()
      } else if (completion.status === 'error') {
        if (completion.project?.status === 'graph_completed') {
          stopPolling()
          stopGraphPolling()
        }
        reportGraphCompletionFailure(completion)
      }
      return
    }
    console.error(e)
  }
}

const loadGraph = async (graphId) => {
  graphLoading.value = true
  addLog(`Loading full graph data: ${graphId}`)
  try {
    const res = await getGraphData(graphId)
    if (res.success) {
      graphData.value = res.data
      addLog('Graph data loaded successfully.')
      return true
    } else {
      addLog(`Failed to load graph data: ${res.error}`)
      return false
    }
  } catch (e) {
    addLog(`Exception loading graph: ${e.message}`)
    return false
  } finally {
    graphLoading.value = false
  }
}

const refreshGraph = () => {
  if (projectData.value?.graph_id) {
    addLog('Manual graph refresh triggered.')
    loadGraph(projectData.value.graph_id)
  }
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const stopGraphPolling = () => {
  if (graphPollTimer) {
    clearInterval(graphPollTimer)
    graphPollTimer = null
    addLog('Graph polling stopped.')
  }
}

const stopOntologyPolling = () => {
  if (ontologyPollTimer) {
    clearInterval(ontologyPollTimer)
    ontologyPollTimer = null
  }
}

onMounted(() => {
  initProject()
})

onUnmounted(() => {
  stopOntologyPolling()
  stopPolling()
  stopGraphPolling()
})
</script>

<style scoped>
.main-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #FFF;
  overflow: hidden;
  font-family: 'Space Grotesk', 'Noto Sans SC', system-ui, sans-serif;
}

/* Header */
.app-header {
  height: 60px;
  border-bottom: 1px solid #EAEAEA;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #FFF;
  z-index: 100;
  position: relative;
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.brand {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 1px;
  cursor: pointer;
}

.view-switcher {
  display: flex;
  background: #F5F5F5;
  padding: 4px;
  border-radius: 6px;
  gap: 4px;
}

.switch-btn {
  border: none;
  background: transparent;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.switch-btn.active {
  background: #FFF;
  color: #000;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.global-error-banner {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid #F4B8B0;
  border-radius: 6px;
  background: #FFF4F2;
  color: #A33A2D;
  font-size: 13px;
  line-height: 1.5;
}

.qa-entry-button {
  border: 1px solid #111;
  background: #111;
  color: #FFF;
  padding: 7px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.qa-entry-button:hover {
  background: #333;
}

.qa-entry-button:focus-visible {
  outline: 3px solid #4C9AFF;
  outline-offset: 2px;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.step-num {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #999;
}

.step-name {
  font-weight: 700;
  color: #000;
}

.step-divider {
  width: 1px;
  height: 14px;
  background-color: #E0E0E0;
}

@media (max-width: 860px) {
  .app-header {
    padding: 0 12px;
  }

  .header-center {
    position: static;
    transform: none;
  }

  .workflow-step,
  .step-divider {
    display: none;
  }

  .header-right {
    gap: 8px;
  }
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #CCC;
}

.status-indicator.processing .dot { background: #FF5722; animation: pulse 1s infinite; }
.status-indicator.completed .dot { background: #4CAF50; }
.status-indicator.error .dot { background: #F44336; }

@keyframes pulse { 50% { opacity: 0.5; } }

/* Content */
.content-area {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.panel-wrapper {
  height: 100%;
  overflow: hidden;
  transition: width 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease, transform 0.3s ease;
  will-change: width, opacity, transform;
}

.panel-wrapper.left {
  border-right: 1px solid #EAEAEA;
}
</style>
