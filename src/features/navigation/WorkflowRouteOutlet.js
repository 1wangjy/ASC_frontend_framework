import { KeepAlive, defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

export const WORKFLOW_VIEW_NAMES = Object.freeze([
  'AscQaView',
  'DocumentLibraryView',
  'GraphProjectWorkspaceView',
  'SimulationView',
  'SimulationRunView',
  'ReportCenterView',
  'ReportView',
  'InteractionView'
])

const SINGLETON_WORKFLOW_ROUTE_NAMES = new Set(['AscQa', 'Documents', 'Process', 'Reports'])
const SCOPED_WORKFLOW_ROUTE_PARAMS = Object.freeze({
  Simulation: 'simulationId',
  SimulationRun: 'simulationId',
  Report: 'reportId',
  Interaction: 'reportId'
})

function routeParam(route, key) {
  const value = route?.params?.[key]
  return String(Array.isArray(value) ? value[0] : value || '').trim()
}

export function workflowRouteViewKey(route = {}) {
  const name = String(route?.name || '')
  if (SINGLETON_WORKFLOW_ROUTE_NAMES.has(name)) return `workflow:${name}`

  const scopeParam = SCOPED_WORKFLOW_ROUTE_PARAMS[name]
  if (scopeParam) {
    const scopeId = routeParam(route, scopeParam)
    return `workflow:${name}:${scopeId || 'unknown'}`
  }

  return String(route?.fullPath || name)
}

export const WorkflowRouteOutlet = defineComponent({
  name: 'WorkflowRouteOutlet',
  setup() {
    return () => h(RouterView, null, {
      default: ({ Component, route }) => h(
        KeepAlive,
        { include: WORKFLOW_VIEW_NAMES, max: 12 },
        () => Component
          ? h(Component, { key: workflowRouteViewKey(route) })
          : null
      )
    })
  }
})
