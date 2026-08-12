import test from 'node:test'
import assert from 'node:assert/strict'

import { createQaProjectContextController } from '../src/features/qa/qaProjectContextController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function graphProject({
  projectId = 'p1',
  graphId = 'g1',
  simulationId = 's1',
  name = 'Project one'
} = {}) {
  return {
    projectId,
    graphId,
    simulationId,
    name,
    status: 'graph_completed',
    stage: 'professional',
    updatedAt: Date.parse('2026-08-12T09:00:00Z')
  }
}

function completedReport({
  projectId = 'p1',
  graphId = 'g1',
  simulationId = 's1',
  reportId = 'r1'
} = {}) {
  return {
    project_id: projectId,
    graph_id: graphId,
    simulation_id: simulationId,
    report_id: reportId,
    status: 'completed',
    completed_at: '2026-08-12T10:00:00Z'
  }
}

function memoryStorage(initialProjectId = '') {
  const values = new Map()
  if (initialProjectId) values.set('nexus_active_project_id', initialProjectId)
  const writes = []
  return {
    writes,
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      writes.push(['set', key, value])
      values.set(key, value)
    },
    removeItem(key) {
      writes.push(['remove', key])
      values.delete(key)
    }
  }
}

function createDependencies({ projects, reports, storage, onChange } = {}) {
  let monitorItems = projects || [graphProject()]
  return {
    dependencies: {
      async refreshProjects() {},
      getProjects: () => monitorItems,
      async listReports() {
        return { success: true, data: reports || [completedReport()] }
      },
      storage: storage || memoryStorage(),
      onChange
    },
    setProjects(nextProjects) {
      monitorItems = nextProjects
    }
  }
}

test('keeps the previous qualified project after a background refresh', async () => {
  const { dependencies } = createDependencies()
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  await controller.refresh()

  assert.equal(controller.snapshot().selected.projectId, 'p1')
  assert.equal(controller.snapshot().selected.reportId, 'r1')
})

test('does not automatically select the newest qualified project', async () => {
  const { dependencies } = createDependencies({
    projects: [
      graphProject({ projectId: 'newer', graphId: 'g-new', simulationId: 's-new' }),
      graphProject({ projectId: 'older', graphId: 'g-old', simulationId: 's-old' })
    ],
    reports: [
      completedReport({ projectId: 'newer', graphId: 'g-new', simulationId: 's-new', reportId: 'r-new' }),
      completedReport({ projectId: 'older', graphId: 'g-old', simulationId: 's-old', reportId: 'r-old' })
    ]
  })
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh()

  assert.equal(controller.snapshot().records.length, 2)
  assert.equal(controller.snapshot().selected, null)
})

test('leaves a mismatched route project and report unselected instead of using saved state', async () => {
  const storage = memoryStorage('p1')
  const { dependencies } = createDependencies({ storage })
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'wrong-report' })

  assert.equal(controller.snapshot().selected, null)
  assert.deepEqual(storage.writes, [])
})

test('publishes only the newest joined project and report refresh generation', async () => {
  const projectRefreshes = [deferred(), deferred()]
  const reportRefreshes = [deferred(), deferred()]
  let monitorItems = []
  let projectCall = 0
  let reportCall = 0
  const controller = createQaProjectContextController({
    refreshProjects() {
      const call = projectCall++
      return projectRefreshes[call].promise.then((projects) => {
        monitorItems = projects
      })
    },
    getProjects: () => monitorItems,
    listReports() {
      return reportRefreshes[reportCall++].promise
    },
    storage: memoryStorage()
  })

  const olderRefresh = controller.refresh({ routeProjectId: 'old', routeReportId: 'r-old' })
  const newerRefresh = controller.refresh({ routeProjectId: 'new', routeReportId: 'r-new' })

  projectRefreshes[1].resolve([
    graphProject({ projectId: 'new', graphId: 'g-new', simulationId: 's-new' })
  ])
  reportRefreshes[1].resolve({
    success: true,
    data: [completedReport({ projectId: 'new', graphId: 'g-new', simulationId: 's-new', reportId: 'r-new' })]
  })
  await newerRefresh

  projectRefreshes[0].resolve([
    graphProject({ projectId: 'old', graphId: 'g-old', simulationId: 's-old' })
  ])
  reportRefreshes[0].resolve({
    success: true,
    data: [completedReport({ projectId: 'old', graphId: 'g-old', simulationId: 's-old', reportId: 'r-old' })]
  })
  await olderRefresh

  assert.deepEqual(controller.snapshot().records.map(record => record.projectId), ['new'])
  assert.equal(controller.snapshot().selected.projectId, 'new')
  assert.equal(controller.snapshot().loading, false)
  assert.equal(controller.snapshot().requestVersion, 2)
})

test('keeps a manual selection made while a background refresh is in flight', async () => {
  const nextProjects = deferred()
  const nextReports = deferred()
  const projects = [
    graphProject(),
    graphProject({ projectId: 'p2', graphId: 'g2', simulationId: 's2', name: 'Project two' })
  ]
  const reports = [
    completedReport(),
    completedReport({ projectId: 'p2', graphId: 'g2', simulationId: 's2', reportId: 'r2' })
  ]
  let monitorItems = projects
  let refreshCount = 0
  let reportCount = 0
  const controller = createQaProjectContextController({
    refreshProjects() {
      if (refreshCount++ === 0) return Promise.resolve()
      return nextProjects.promise.then((items) => { monitorItems = items })
    },
    getProjects: () => monitorItems,
    listReports() {
      if (reportCount++ === 0) return Promise.resolve({ success: true, data: reports })
      return nextReports.promise
    },
    storage: memoryStorage()
  })
  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  const backgroundRefresh = controller.refresh()
  assert.equal(controller.select('p2'), true)
  nextProjects.resolve(projects)
  nextReports.resolve({ success: true, data: reports })
  await backgroundRefresh

  assert.equal(controller.snapshot().selected.projectId, 'p2')
})

test('does not revive an explicit route after a manual selection during its delayed refresh', async () => {
  const delayedProjects = deferred()
  const delayedReports = deferred()
  const projects = [
    graphProject(),
    graphProject({ projectId: 'p2', graphId: 'g2', simulationId: 's2', name: 'Project two' })
  ]
  const reports = [
    completedReport(),
    completedReport({ projectId: 'p2', graphId: 'g2', simulationId: 's2', reportId: 'r2' })
  ]
  let monitorItems = projects
  let projectRefreshCount = 0
  let reportRefreshCount = 0
  const storage = memoryStorage('p2')
  const controller = createQaProjectContextController({
    refreshProjects() {
      if (projectRefreshCount++ === 0) return Promise.resolve()
      return delayedProjects.promise.then((items) => { monitorItems = items })
    },
    getProjects: () => monitorItems,
    listReports() {
      if (reportRefreshCount++ === 0) return Promise.resolve({ success: true, data: reports })
      return delayedReports.promise
    },
    storage
  })

  await controller.refresh()

  const refresh = controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  assert.equal(controller.select('p2'), true)
  delayedProjects.resolve(projects)
  delayedReports.resolve({ success: true, data: reports })
  await refresh

  assert.equal(controller.snapshot().selected?.projectId, 'p2')
  assert.equal(storage.getItem('nexus_active_project_id'), 'p2')
  assert.equal(storage.writes.some(([, , value]) => value === 'p1'), false)
})

test('does not revive an explicit route after clear during its delayed refresh', async () => {
  const delayedProjects = deferred()
  const delayedReports = deferred()
  let monitorItems = [graphProject()]
  let projectRefreshCount = 0
  let reportRefreshCount = 0
  const storage = memoryStorage('p1')
  const controller = createQaProjectContextController({
    refreshProjects() {
      if (projectRefreshCount++ === 0) return Promise.resolve()
      return delayedProjects.promise.then((items) => { monitorItems = items })
    },
    getProjects: () => monitorItems,
    listReports() {
      if (reportRefreshCount++ === 0) {
        return Promise.resolve({ success: true, data: [completedReport()] })
      }
      return delayedReports.promise
    },
    storage
  })

  await controller.refresh()

  const refresh = controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  controller.clear()
  delayedProjects.resolve([graphProject()])
  delayedReports.resolve({ success: true, data: [completedReport()] })
  await refresh

  assert.equal(controller.snapshot().selected, null)
  assert.equal(storage.getItem('nexus_active_project_id'), null)
})

test('returns shape-compatible detached snapshots that cannot mutate nested controller data', async () => {
  const generatedAt = new Date('2026-08-12T10:30:00Z')
  const project = {
    ...graphProject(),
    metadata: { generatedAt }
  }
  const { dependencies } = createDependencies({ projects: [project] })
  const controller = createQaProjectContextController(dependencies)
  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  const external = controller.snapshot()
  external.records[0].projectName = 'tampered record'
  external.records[0].project.name = 'tampered nested project'
  external.selected.reportId = 'tampered report'

  const internal = controller.snapshot()
  assert.equal(internal.records[0].projectName, 'Project one')
  assert.equal(internal.records[0].project.name, 'Project one')
  assert.equal(internal.selected.reportId, 'r1')
  assert.ok(internal.records[0].project.metadata.generatedAt instanceof Date)
  assert.equal(internal.records[0].project.metadata.generatedAt.toISOString(), generatedAt.toISOString())
})

test('isolates onChange snapshots from callback mutation', async () => {
  const changes = []
  const { dependencies } = createDependencies({
    onChange(snapshot) {
      changes.push(snapshot)
      if (snapshot.records[0]) {
        snapshot.records[0].projectName = 'callback tampering'
        snapshot.records[0].project.name = 'callback nested tampering'
      }
      if (snapshot.selected) snapshot.selected.reportId = 'callback report tampering'
    }
  })
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  assert.ok(changes.length > 0)
  assert.equal(controller.snapshot().records[0].projectName, 'Project one')
  assert.equal(controller.snapshot().records[0].project.name, 'Project one')
  assert.equal(controller.snapshot().selected.reportId, 'r1')
})

test('does not write stale storage when publish callback starts a newer refresh', async () => {
  const storage = memoryStorage()
  const projects = [
    graphProject(),
    graphProject({ projectId: 'p2', graphId: 'g2', simulationId: 's2', name: 'Project two' })
  ]
  const reports = [
    completedReport(),
    completedReport({ projectId: 'p2', graphId: 'g2', simulationId: 's2', reportId: 'r2' })
  ]
  let monitorItems = projects
  let controller
  let startedNewerRefresh = false
  controller = createQaProjectContextController({
    async refreshProjects() {},
    getProjects: () => monitorItems,
    async listReports() {
      return { success: true, data: reports }
    },
    storage,
    onChange(snapshot) {
      if (!startedNewerRefresh && snapshot.selected?.projectId === 'p1') {
        startedNewerRefresh = true
        void controller.refresh({ routeProjectId: 'p2', routeReportId: 'r2' })
      }
    }
  })

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(controller.snapshot().selected.projectId, 'p2')
  assert.deepEqual(
    storage.writes.filter(([operation]) => operation === 'set').map(([, , value]) => value),
    ['p2']
  )
})

test('does not write stale storage when publish callback selects another project', async () => {
  const storage = memoryStorage()
  const projects = [
    graphProject(),
    graphProject({ projectId: 'p2', graphId: 'g2', simulationId: 's2', name: 'Project two' })
  ]
  const reports = [
    completedReport(),
    completedReport({ projectId: 'p2', graphId: 'g2', simulationId: 's2', reportId: 'r2' })
  ]
  let controller
  controller = createQaProjectContextController({
    async refreshProjects() {},
    getProjects: () => projects,
    async listReports() {
      return { success: true, data: reports }
    },
    storage,
    onChange(snapshot) {
      if (snapshot.selected?.projectId === 'p1') controller.select('p2')
    }
  })

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  assert.equal(controller.snapshot().selected.projectId, 'p2')
  assert.deepEqual(
    storage.writes.filter(([operation]) => operation === 'set').map(([, , value]) => value),
    ['p2']
  )
})

test('does not write storage after publish callback stops the controller', async () => {
  const storage = memoryStorage()
  let stopped = false
  let controller
  controller = createQaProjectContextController({
    async refreshProjects() {},
    getProjects: () => [graphProject()],
    async listReports() {
      return { success: true, data: [completedReport()] }
    },
    storage,
    onChange(snapshot) {
      if (!stopped && snapshot.selected?.projectId === 'p1') {
        stopped = true
        controller.stop()
      }
    }
  })

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  assert.deepEqual(storage.writes, [])
})

test('clears stale qualification and exposes the current endpoint failure', async () => {
  let failReports = false
  const { dependencies } = createDependencies()
  const originalListReports = dependencies.listReports
  dependencies.listReports = async () => {
    if (failReports) throw new Error('report service unavailable')
    return originalListReports()
  }
  const controller = createQaProjectContextController(dependencies)
  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  failReports = true
  await controller.refresh()

  assert.deepEqual(controller.snapshot().records, [])
  assert.equal(controller.snapshot().selected, null)
  assert.equal(controller.snapshot().error, 'report service unavailable')
  assert.equal(controller.snapshot().loading, false)
})

test('uses safe storage helpers so throwing storage cannot block backend qualification', async () => {
  const storage = {
    getItem() {
      throw new DOMException('Storage access denied', 'SecurityError')
    },
    setItem() {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    }
  }
  const { dependencies } = createDependencies({ storage })
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })

  assert.equal(controller.snapshot().selected.projectId, 'p1')
  assert.equal(controller.snapshot().error, '')
})

test('stop suppresses every late success and finalizer mutation', async () => {
  const projectResult = deferred()
  const reportResult = deferred()
  let monitorItems = []
  const changes = []
  const controller = createQaProjectContextController({
    refreshProjects: () => projectResult.promise.then((projects) => { monitorItems = projects }),
    getProjects: () => monitorItems,
    listReports: () => reportResult.promise,
    storage: memoryStorage(),
    onChange: snapshot => changes.push(snapshot)
  })

  const refresh = controller.refresh({ routeProjectId: 'p1', routeReportId: 'r1' })
  controller.stop()
  const stoppedSnapshot = controller.snapshot()
  const changeCountAfterStop = changes.length
  projectResult.resolve([graphProject()])
  reportResult.resolve({ success: true, data: [completedReport()] })
  await refresh

  assert.deepEqual(controller.snapshot(), stoppedSnapshot)
  assert.equal(changes.length, changeCountAfterStop)
  assert.equal(controller.snapshot().loading, false)
  assert.deepEqual(controller.snapshot().records, [])
})

test('rejects an unqualified manual selection without writing storage', async () => {
  const storage = memoryStorage()
  const { dependencies } = createDependencies({ storage })
  const controller = createQaProjectContextController(dependencies)
  await controller.refresh()

  assert.equal(controller.select('missing-project'), false)
  assert.equal(controller.snapshot().selected, null)
  assert.deepEqual(storage.writes, [])
})

test('collapses monitor rows once before joining the completed report', async () => {
  const { dependencies } = createDependencies({
    projects: [
      {
        projectId: 'base', graphId: 'g-base', name: 'Named project', status: 'graph_completed',
        stage: 'base', updatedAt: 1
      },
      {
        projectId: 'professional', graphId: 'g-pro', baseProjectId: 'base',
        name: 'Named project - Professional Research', status: 'graph_completed',
        stage: 'professional', simulationId: 's-pro', updatedAt: 2
      }
    ],
    reports: [completedReport({
      projectId: 'professional', graphId: 'g-pro', simulationId: 's-pro', reportId: 'r-pro'
    })]
  })
  const controller = createQaProjectContextController(dependencies)

  await controller.refresh({ routeProjectId: 'professional', routeReportId: 'r-pro' })

  assert.equal(controller.snapshot().records.length, 1)
  assert.equal(controller.snapshot().records[0].projectName, 'Named project')
})
