import { isFinalGraphProject } from '../projects/logicalGraphProjectModel.js'

const ACTIVE_STATUSES = new Set(['ontology_generating', 'graph_building'])

const EVOLUTION_STATUS_COPY = {
  professional_completed: 'Professional 构建完成，等待环境搭建',
  environment_preparing: '正在环境搭建',
  evolution_ready: '环境搭建完成，等待开始模拟',
  evolution_running: '正在模拟组会',
  evolution_completed: '模拟组会已完成',
  evolution_failed: '模拟组会失败',
  evolution_stopped: '模拟组会已停止'
}

export function graphEvolutionStatusCopy(item = {}) {
  return EVOLUTION_STATUS_COPY[item?.evolutionStatus] || ''
}

export function graphTaskStageCopy(item = {}) {
  const evolutionCopy = graphEvolutionStatusCopy(item)
  if (evolutionCopy) return evolutionCopy

  if (item?.status === 'graph_building') {
    return item?.stage === 'professional' ? '正在 Professional 构建' : '正在 Base 构建'
  }

  if (item?.status === 'graph_completed') {
    return item?.stage === 'professional'
      ? 'Professional 构建完成，等待环境搭建'
      : 'Base 构建完成，等待 Professional 构建'
  }

  return {
    created: '等待图谱初始化',
    ontology_generating: '正在图谱初始化',
    ontology_generated: '等待 Base 构建',
    base_completed: 'Base 构建完成，等待 Professional 构建',
    failed: '图谱构建失败'
  }[item?.status] || '等待开始'
}

export function unwrapGraphProjects(response = []) {
  if (Array.isArray(response)) return response
  return Array.isArray(response?.data) ? response.data : []
}

export function unwrapSimulationHistory(response = []) {
  if (Array.isArray(response)) return response
  return Array.isArray(response?.data) ? response.data : []
}

function numericProgress(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0
}

function text(value) {
  return String(value ?? '').trim()
}

function recordTimestamp(record = {}) {
  return Math.max(
    Date.parse(record.updated_at || '') || 0,
    Date.parse(record.recorded_at || '') || 0,
    Date.parse(record.created_at || '') || 0
  )
}

function simulationProgress(record = {}) {
  const currentRound = Number(record.current_round)
  const totalRounds = Number(record.total_rounds)
  if (!Number.isFinite(currentRound) || !Number.isFinite(totalRounds) || totalRounds <= 0) return 0
  return numericProgress(Math.round((currentRound / totalRounds) * 100))
}

function evolutionStatusOf(record = {}) {
  const runnerStatus = text(record.runner_status || record.status).toLowerCase()
  const simulationStatus = text(record.status).toLowerCase()
  if (runnerStatus === 'completed') return 'evolution_completed'
  if (runnerStatus === 'failed') return 'evolution_failed'
  if (runnerStatus === 'stopped') return 'evolution_stopped'
  if (['running', 'starting', 'processing'].includes(runnerStatus)) return 'evolution_running'
  if (simulationStatus === 'preparing') return 'environment_preparing'
  return 'evolution_ready'
}

export function mergeGraphEvolutionState(items = [], history = []) {
  const latestByProject = new Map()

  unwrapSimulationHistory(history).forEach(record => {
    const projectId = text(record?.project_id)
    const simulationId = text(record?.simulation_id)
    if (!projectId || !simulationId) return

    const previous = latestByProject.get(projectId)
    if (!previous || recordTimestamp(record) > recordTimestamp(previous)) {
      latestByProject.set(projectId, record)
    }
  })

  return items.map(item => {
    const isProfessional = item?.stage === 'professional' || Boolean(text(item?.baseProjectId))
    if (item?.status !== 'graph_completed' || !isProfessional) return item

    const simulation = latestByProject.get(text(item.projectId))
    if (!simulation) {
      return {
        ...item,
        evolutionStatus: 'professional_completed'
      }
    }

    const evolutionStatus = evolutionStatusOf(simulation)
    const roundProgress = simulationProgress(simulation)
    const progress = evolutionStatus === 'evolution_completed'
      ? 100
      : (evolutionStatus === 'evolution_ready' ? 0 : Math.min(99, roundProgress))

    return {
      ...item,
      simulationId: text(simulation.simulation_id),
      evolutionStatus,
      progress,
      active: ['environment_preparing', 'evolution_running'].includes(evolutionStatus)
    }
  })
}

export function normalizeGraphTaskItems(projects = [], taskById = new Map()) {
  return unwrapGraphProjects(projects)
    .filter(project => String(project?.project_id || '').trim())
    .map(project => {
      const projectId = String(project.project_id).trim()
      const graphId = String(project.graph_id || '').trim()
      const baseProjectId = String(project.base_project_id || '').trim()
      const taskId = String(project.graph_build_task_id || '').trim()
      const task = taskId ? taskById.get(taskId) : null
      const projectStatus = String(project.status || 'created')
      const status = projectStatus === 'graph_building' && task?.status === 'failed'
        ? 'failed'
        : projectStatus
      const ontology = project.ontology_progress || {}
      const progress = status === 'graph_completed'
        ? 100
        : numericProgress(status === 'graph_building' ? task?.progress : ontology.progress)

      const item = {
        id: taskId || `project:${project.project_id}`,
        projectId,
        graphId,
        baseProjectId,
        taskId,
        name: project.project_name || project.name || project.project_id,
        status,
        stage: project.graph_build_stage || (status.startsWith('ontology_') ? 'ontology' : 'base'),
        progress,
        message: task?.error || task?.message || ontology.message || project.error || '',
        updatedAt: Date.parse(project.updated_at || project.created_at || '') || 0,
        active: ACTIVE_STATUSES.has(status),
        canOpenQa: false
      }
      item.canOpenQa = isFinalGraphProject(item)
      return item
    })
    .sort((left, right) => Number(right.active) - Number(left.active) || right.updatedAt - left.updatedAt)
}

export function selectVisibleGraphTasks(items = []) {
  const active = items.filter(item => item.active)
  const terminal = items.filter(item => !item.active)
  return [...active, ...terminal]
}

export function getGraphMonitorDelay(items = [], { activeMs = 1500, idleMs = 12000 } = {}) {
  return items.some(item => item.active) ? activeMs : idleMs
}
