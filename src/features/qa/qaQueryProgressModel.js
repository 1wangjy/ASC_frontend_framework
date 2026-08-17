export const QA_QUERY_PROGRESS_STEPS = Object.freeze([
  {
    key: 'llm_initial_question_answer',
    label: 'LLM Initial Answer（初步回答）',
    detail: '先调用 LLM 分析输入问题并生成初步回答，作为后续 CoD 检索融合的起点'
  },
  {
    key: 'query_decomposition',
    label: 'Query Decomposition',
    detail: '规则解析实体、材料体系、性能目标、机理目标和约束条件'
  },
  {
    key: 'llm_free_subgraph_retrieval',
    label: 'LLM-free Subgraph Retrieval',
    detail: '基于实体匹配、关系意图、证据质量和图扩展召回相关子图'
  },
  {
    key: 'adaptive_reasoning_routing',
    label: 'Adaptive Reasoning Router',
    detail: '使用当前推理模式，并记录结构与语义复杂度评分'
  },
  {
    key: 'candidate_path_reconstruction',
    label: 'Candidate Path Reconstruction',
    detail: '把子图重构为配方、工艺、机理和证据候选路径'
  },
  {
    key: 'lightweight_path_verification',
    label: 'Lightweight Path Verification',
    detail: '启发式验证路径方向、证据充分性、条件匹配和冲突风险'
  },
  {
    key: 'reasoning_path_selection',
    label: 'Reasoning Path Selection',
    detail: '根据路由结果筛选进入 CoT 线性验证或 ToT 多分支比较的 KG 路径'
  },
  {
    key: 'path_grounded_answer_generation',
    label: 'Path-grounded Answer Generation',
    detail: '只基于 keep/revise 路径生成回答和 graph mutation proposals'
  },
  {
    key: 'llm_answer_refinement',
    label: 'Answer Synthesis（受约束综合）',
    detail: '融合 LLM 初步回答、CoD 检索路径、accepted claims 和 OMD metrics，生成最终 LLMs + CoD 主回答'
  }
])

const STEP_THRESHOLDS_MS = Object.freeze([
  800,
  1800,
  2800,
  4000,
  5300,
  6700,
  8200,
  10000
])

export function buildQaQueryProgress(elapsedMs = 0) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0)
  const nextThresholdIndex = STEP_THRESHOLDS_MS.findIndex(threshold => elapsed < threshold)
  const activeIndex = nextThresholdIndex >= 0
    ? Math.min(nextThresholdIndex, QA_QUERY_PROGRESS_STEPS.length - 1)
    : QA_QUERY_PROGRESS_STEPS.length - 1

  const steps = QA_QUERY_PROGRESS_STEPS.map((step, index) => {
    const status = index < activeIndex
      ? 'completed'
      : index === activeIndex
        ? 'in_progress'
        : 'pending'
    return {
      ...step,
      status,
      statusText: status === 'completed'
        ? '已完成'
        : status === 'in_progress'
          ? '执行中'
          : '等待中'
    }
  })

  const completed = steps.filter(step => step.status === 'completed').length
  const percent = Math.min(100, Math.round(((completed + 0.5) / steps.length) * 100))

  return {
    elapsedSeconds: Math.floor(elapsed / 1000),
    percent,
    steps
  }
}
