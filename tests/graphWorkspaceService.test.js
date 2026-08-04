import test from 'node:test'
import assert from 'node:assert/strict'

import {
  loadGraphForProject,
  loadGraphWorkspace
} from '../src/features/knowledge/graphWorkspaceService.js'

test('loads usable projects, restores the preferred project, and fetches its graph', async () => {
  const graphCalls = []
  const api = {
    listProjects: async () => ({
      success: true,
      data: [
        { project_id: 'p1', graph_id: 'g1', updated_at: '2026-08-01T00:00:00Z' },
        { project_id: 'p2', graph_id: 'g2', updated_at: '2026-08-02T00:00:00Z' },
        { project_id: 'draft', graph_id: null }
      ]
    }),
    getGraphData: async (graphId) => {
      graphCalls.push(graphId)
      return {
        success: true,
        data: {
          nodes: [{ uuid: 'n1', name_zh: '碳化硅' }],
          edges: []
        }
      }
    }
  }

  const workspace = await loadGraphWorkspace(api, 'p1')

  assert.deepEqual(workspace.projects.map((project) => project.project_id), ['p2', 'p1'])
  assert.equal(workspace.activeProject.project_id, 'p1')
  assert.deepEqual(graphCalls, ['g1'])
  assert.equal(workspace.graph.nodes[0].label, '碳化硅')
})

test('does not request graph data when no project has a graph id', async () => {
  let graphRequested = false
  const workspace = await loadGraphWorkspace({
    listProjects: async () => ({ data: [{ project_id: 'draft', graph_id: null }] }),
    getGraphData: async () => {
      graphRequested = true
    }
  })

  assert.equal(graphRequested, false)
  assert.deepEqual(workspace, { projects: [], activeProject: null, graph: { nodes: [], edges: [] } })
})

test('loads a newly selected project graph', async () => {
  const graph = await loadGraphForProject(
    async (graphId) => ({ data: { nodes: [{ id: graphId, name: '节点' }], edges: [] } }),
    { project_id: 'p3', graph_id: 'g3' }
  )

  assert.equal(graph.nodes[0].nodeId, 'g3')
})
