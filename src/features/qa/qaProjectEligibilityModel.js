function text(value) {
  return String(value ?? '').trim()
}

function projectIdOf(project = {}) {
  return text(project?.projectId || project?.project_id)
}

function graphIdOf(project = {}) {
  return text(project?.graphId || project?.graph_id)
}

function simulationIdOf(project = {}) {
  return text(project?.simulationId || project?.simulation_id)
}

function projectNameOf(project = {}) {
  return text(project?.name || project?.projectName || project?.project_name)
}

function hasCompletedSimulation(project = {}) {
  const evolutionStatus = text(
    project?.evolutionStatus || project?.evolution_status
  ).toLowerCase()
  const runnerStatus = text(
    project?.runnerStatus || project?.runner_status
  ).toLowerCase()
  return evolutionStatus === 'evolution_completed' || runnerStatus === 'completed'
}

export function buildQualifiedQaProjects(projects = []) {
  const candidates = (Array.isArray(projects) ? projects : [])
    .filter(project => (
      projectIdOf(project)
      && graphIdOf(project)
      && simulationIdOf(project)
      && hasCompletedSimulation(project)
    ))
    .slice()
    .sort((left, right) => projectIdOf(left).localeCompare(projectIdOf(right)))

  const scopesByProject = new Map()
  const ownersByGraph = new Map()
  const ownersBySimulation = new Map()
  const conflictingProjects = new Set()

  candidates.forEach(project => {
    const projectId = projectIdOf(project)
    const graphId = graphIdOf(project)
    const simulationId = simulationIdOf(project)
    const scope = `${graphId}\u0000${simulationId}`
    const previousScope = scopesByProject.get(projectId)
    if (previousScope && previousScope !== scope) conflictingProjects.add(projectId)
    else if (!previousScope) scopesByProject.set(projectId, scope)

    const graphOwners = ownersByGraph.get(graphId) || new Set()
    graphOwners.add(projectId)
    ownersByGraph.set(graphId, graphOwners)

    const simulationOwners = ownersBySimulation.get(simulationId) || new Set()
    simulationOwners.add(projectId)
    ownersBySimulation.set(simulationId, simulationOwners)
  })

  const uniqueProjects = new Map()
  candidates.forEach(project => {
    const projectId = projectIdOf(project)
    if (
      conflictingProjects.has(projectId)
      || ownersByGraph.get(graphIdOf(project))?.size !== 1
      || ownersBySimulation.get(simulationIdOf(project))?.size !== 1
    ) return
    if (!uniqueProjects.has(projectId)) uniqueProjects.set(projectId, project)
  })

  return [...uniqueProjects.entries()].map(([projectId, project]) => ({
    projectId,
    graphId: graphIdOf(project),
    simulationId: simulationIdOf(project),
    projectName: projectNameOf(project) || projectId,
    project
  }))
}

export function resolveQualifiedQaSelection(records = [], request = {}) {
  const qualified = Array.isArray(records) ? records : []
  const routeProjectId = text(request?.routeProjectId)
  const routeReportId = text(request?.routeReportId)

  if (routeProjectId || routeReportId) {
    if (!routeProjectId) return null
    return qualified.find(record => text(record?.projectId) === routeProjectId) || null
  }

  const storedProjectId = text(request?.storedProjectId)
  if (!storedProjectId) return null
  return qualified.find(record => text(record?.projectId) === storedProjectId) || null
}
