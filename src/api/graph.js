import service, { requestWithRetry } from './index'
import { buildListProjectsRequest } from './requestContracts'

const DEFAULT_GRAPH_LAUNCH_ENDPOINT = '/api/graph/launch'

/**
 * 同步启动知识图谱页面。后端完成准备后直接返回页面地址。
 * @param {String} endpoint - 可由 VITE_GRAPH_LAUNCH_API 覆盖
 * @returns {Promise<Object>}
 */
export function launchKnowledgeGraph(endpoint = DEFAULT_GRAPH_LAUNCH_ENDPOINT) {
  const normalizedEndpoint = String(endpoint ?? '').trim() || DEFAULT_GRAPH_LAUNCH_ENDPOINT

  return service({
    url: normalizedEndpoint,
    method: 'post',
    timeout: 15 * 60 * 1000
  })
}

/**
 * 预创建本体生成项目，用于长时间 LLM 调用期间轮询进度
 * @param {Object} data
 * @returns {Promise}
 */
export function prepareOntologyProject(data = {}) {
  return service({
    url: '/api/graph/ontology/prepare',
    method: 'post',
    data
  })
}

/**
 * 生成本体（上传文档和查询 Prompt；KG Prompt 由后端固定加载）
 * @param {Object} data - 包含files, query_prompt, project_name等
 * @returns {Promise}
 */
export function generateOntology(formData) {
  return requestWithRetry(() => 
    service({
      url: '/api/graph/ontology/generate',
      method: 'post',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  )
}

/**
 * 构建图谱
 * @param {Object} data - 包含project_id, graph_name等
 * @returns {Promise}
 */
export function buildGraph(data) {
  return requestWithRetry(() =>
    service({
      url: '/api/graph/build',
      method: 'post',
      data
    })
  )
}

/**
 * 列出可用于第二阶段导入的 base_*.json 元数据
 * @returns {Promise}
 */
export function listBaseMetadata() {
  return service({
    url: '/api/graph/base-metadata',
    method: 'get'
  })
}

/**
 * 导入用户本地的 Base Node 四字段元数据，供 Professional Research 阶段使用
 * @param {FormData} formData - file + base_metadata_path
 * @returns {Promise}
 */
export function importBaseMetadata(formData) {
  return service({
    url: '/api/graph/base-metadata/import',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

/**
 * 编辑本地图谱节点元数据
 * @param {String} projectId
 * @param {String} nodeId
 * @param {Object} data - { name, entity_type, summary, node_weight }
 * @returns {Promise}
 */
export function updateGraphNodeMetadata(projectId, nodeId, data) {
  return service({
    url: `/api/graph/project/${projectId}/metadata/node/${encodeURIComponent(nodeId)}`,
    method: 'patch',
    data
  })
}

/**
 * 查询任务状态
 * @param {String} taskId - 任务ID
 * @returns {Promise}
 */
export function getTaskStatus(taskId) {
  return service({
    url: `/api/graph/task/${taskId}`,
    method: 'get'
  })
}

/**
 * 获取图谱数据
 * @param {String} graphId - 图谱ID
 * @returns {Promise}
 */
export function getGraphData(graphId) {
  return service({
    url: `/api/graph/data/${graphId}`,
    method: 'get'
  })
}

/**
 * 获取项目信息
 * @param {String} projectId - 项目ID
 * @returns {Promise}
 */
export function getProject(projectId) {
  return service({
    url: `/api/graph/project/${projectId}`,
    method: 'get'
  })
}

/**
 * 获取当前用户可用的知识图谱项目。
 * @param {Object} params - 后端支持的可选筛选参数
 * @returns {Promise}
 */
export function listProjects(params = {}) {
  return service(buildListProjectsRequest(params))
}

/**
 * CoD-style GraphRAG path-level query
 * @param {Object} data - { question, project_id?, graph_id?, simulation_id?, top_k_subgraphs?, top_k_paths?, show_audit_appendix? }
 * @returns {Promise}
 */
export function codGraphRAGQuery(data) {
  return requestWithRetry(() =>
    service({
      url: '/api/graphrag/cod-query',
      method: 'post',
      data,
      // CoD may include an initial LLM answer plus multiple constrained repair
      // attempts. Keep this endpoint above the shared five-minute timeout.
      timeout: 15 * 60 * 1000
    }),
    1,
    1000
  )
}

/**
 * 提交 CoD QA 专家反馈，写入 Feedback Memory
 * @param {Object} data - { qa_run_id?, qa_result, scores, error_types?, correction_suggestions?, comments? }
 * @returns {Promise}
 */
export function submitQAFeedback(data) {
  return service({
    url: '/api/graphrag/feedback',
    method: 'post',
    data
  })
}

/**
 * 使用 LLM as Judge 评价 CoD QA 结果
 * @param {Object} data - { question, final_answer, qa_result, qa_metrics? }
 * @returns {Promise}
 */
export function judgeQAWithLLM(data) {
  return service({
    url: '/api/graphrag/judge',
    method: 'post',
    data
  })
}

/**
 * 导出 QA Feedback Memory 数据集
 * @param {Object} params - { limit?, quality_band? }
 * @returns {Promise}
 */
export function getQAFeedbackDataset(params = {}) {
  return service({
    url: '/api/graphrag/feedback/dataset',
    method: 'get',
    params
  })
}
