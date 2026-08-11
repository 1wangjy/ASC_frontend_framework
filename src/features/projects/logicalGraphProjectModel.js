function text(value) {
  return String(value ?? '').trim()
}

function projectIdOf(project = {}) {
  return text(project?.projectId || project?.project_id)
}

function graphIdOf(project = {}) {
  return text(project?.graphId || project?.graph_id)
}

function baseProjectIdOf(project = {}) {
  return text(project?.baseProjectId || project?.base_project_id)
}

function projectNameOf(project = {}) {
  return text(project?.name || project?.project_name)
}

function workflowNameOf(project = {}) {
  return projectNameOf(project)
    .replace(/\s*[·\-–—:]?\s*Professional Research(?:\s+Graph Project)?\s*$/i, '')
    .trim()
    .toLocaleLowerCase()
}

export function isProfessionalGraphProject(project = {}) {
  const stage = text(
    project?.stage || project?.graph_build_stage || project?.build_stage
  ).toLowerCase()
  return stage === 'professional'
    || Boolean(baseProjectIdOf(project))
    || /Professional Research/i.test(projectNameOf(project))
}

export function isFinalGraphProject(project = {}) {
  return isProfessionalGraphProject(project)
    && project?.status === 'graph_completed'
    && Boolean(projectIdOf(project))
    && Boolean(graphIdOf(project))
}

export function buildLogicalGraphProjects(items = []) {
  const projects = Array.isArray(items)
    ? items.filter(item => projectIdOf(item))
    : []
  const byId = new Map(projects.map(item => [projectIdOf(item), item]))
  const childrenByRoot = new Map()
  const linkedChildren = new Set()

  projects.forEach(item => {
    const projectId = projectIdOf(item)
    const baseProjectId = baseProjectIdOf(item)
    if (!baseProjectId || baseProjectId === projectId || !byId.has(baseProjectId)) return
    const siblings = childrenByRoot.get(baseProjectId) || []
    siblings.push(item)
    childrenByRoot.set(baseProjectId, siblings)
    linkedChildren.add(projectId)
  })

  projects.forEach(item => {
    const projectId = projectIdOf(item)
    if (linkedChildren.has(projectId) || !isProfessionalGraphProject(item)) return
    const workflowName = workflowNameOf(item)
    if (!workflowName) return
    const candidates = projects.filter(candidate => (
      !isProfessionalGraphProject(candidate)
      && workflowNameOf(candidate) === workflowName
    ))
    if (candidates.length !== 1) return
    const rootProjectId = projectIdOf(candidates[0])
    const siblings = childrenByRoot.get(rootProjectId) || []
    siblings.push(item)
    childrenByRoot.set(rootProjectId, siblings)
    linkedChildren.add(projectId)
  })

  return projects
    .filter(item => !linkedChildren.has(projectIdOf(item)))
    .map(root => {
      const rootProjectId = projectIdOf(root)
      const children = (childrenByRoot.get(rootProjectId) || [])
        .slice()
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
      const operational = children[0] || root
      const members = [...children, root]
      const final = isFinalGraphProject(operational)
      const rootIsBaseComplete = !isProfessionalGraphProject(root) && root.status === 'graph_completed'

      return {
        ...operational,
        id: `logical:${rootProjectId}`,
        rootProjectId,
        projectId: projectIdOf(operational),
        graphId: graphIdOf(operational),
        name: text(root.name || root.project_name) || rootProjectId,
        status: final
          ? 'graph_completed'
          : (children.length ? operational.status : (rootIsBaseComplete ? 'base_completed' : root.status)),
        stage: isProfessionalGraphProject(operational) ? 'professional' : 'base',
        active: members.some(item => item.active === true),
        canOpenQa: final,
        updatedAt: Math.max(...members.map(item => Number(item.updatedAt || 0)), 0),
        memberProjectIds: members.map(projectIdOf),
        resources: members.map(item => ({
          projectId: projectIdOf(item),
          graphId: graphIdOf(item)
        }))
      }
    })
    .sort((left, right) => Number(right.active) - Number(left.active) || right.updatedAt - left.updatedAt)
}
