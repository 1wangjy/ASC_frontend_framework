import { KeepAlive, defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

export const WORKFLOW_VIEW_NAMES = Object.freeze([
  'AscQaView',
  'GraphProjectWorkspaceView'
])

const WORKFLOW_ROUTE_NAMES = new Set(['AscQa', 'Process'])

export function workflowRouteViewKey(route = {}) {
  const name = String(route?.name || '')
  return WORKFLOW_ROUTE_NAMES.has(name)
    ? `workflow:${name}`
    : String(route?.fullPath || name)
}

export const WorkflowRouteOutlet = defineComponent({
  name: 'WorkflowRouteOutlet',
  setup() {
    return () => h(RouterView, null, {
      default: ({ Component, route }) => h(
        KeepAlive,
        { include: WORKFLOW_VIEW_NAMES },
        () => Component
          ? h(Component, { key: workflowRouteViewKey(route) })
          : null
      )
    })
  }
})
