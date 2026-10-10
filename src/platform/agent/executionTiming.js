// Durations at completion come from the server's monotonic clock.
// Running seconds use the local deployment's wall clock; never a completion percentage.
export function elapsedLabel(startedAt, now = Date.now()) {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '等待时长未知'
  return `已等待 ${Math.floor(Math.max(0, now - startedAt) / 1000)} 秒`
}

export function waitingDetail(tool, now = Date.now()) {
  const knowledge = tool?.name === 'kg_search' || tool?.name === 'rag_search'
  const elapsed = elapsedLabel(tool?.startedAt, now)
  const long = Number.isFinite(tool?.startedAt) && now - tool.startedAt >= 30000
  return `${knowledge ? '知识服务' : '工具'} ${tool?.name || ''} · ${elapsed}；${long
    ? '尚未返回，不代表失败。可停止本端等待，远端计算是否取消未知。'
    : '等待实际结果，不提供估算进度。'}`
}

export function timingLabel(timing) {
  if (timing?.schema !== 'agent.timing.v1') return ''
  const seconds = key => Number.isFinite(timing[key]) ? `${(timing[key] / 1000).toFixed(1)} 秒` : '未知'
  return `本轮总耗时 ${seconds('totalMs')} · 模型决策/生成 ${seconds('modelMs')} · 知识工具 ${seconds('knowledgeToolMs')} · 其他工具 ${seconds('otherToolMs')} · 本端其他处理 ${seconds('otherMs')}`
}
