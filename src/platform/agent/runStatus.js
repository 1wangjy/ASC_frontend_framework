// UI labels derived only from received events / saved messages, never fake progress.
import { elapsedLabel, waitingDetail } from './executionTiming.js'

export function describeRun({ message, streaming = false, creating = false, now = Date.now() } = {}) {
  const tools = message?.toolCalls || []
  const running = tools.filter(tool => tool.status === 'running')
  const counts = { total: tools.length, completed: tools.filter(tool => tool.status === 'ok').length,
    failed: tools.filter(tool => tool.status === 'error').length,
    denied: tools.filter(tool => tool.status === 'budget_denied').length }
  const result = (title, detail, tone = 'idle') => ({ title, detail, tone, counts })
  if (creating) return result('正在创建会话', '准备保存本轮问题与执行记录。', 'live')
  if (streaming && running.length) return result('工具执行中',
    running.map(tool => waitingDetail(tool, now)).join('；'), 'live')
  if (streaming) return result('模型处理中', `等待模型响应、选择下一步工具或整理已有结果。${elapsedLabel(message?.modelStatus?.startedAt, now)}。`, 'live')
  if (message?.stopped) return result('已停止', '本端已停止等待；远端计算是否取消未知，未完成工具不计为成功。', 'warning')
  if (message?.error) return result('执行异常', '请查看消息中的错误提示；不要把调用失败当作没有证据。', 'error')
  const status = message?.answer_check?.status
  if (status === 'knowledge_service_answer') return result('知识服务回答已返回',
    '沿用知识服务原答案与引用；Agent 未二次改写。', 'idle')
  if (status === 'no_service_answer') return result('知识服务未返回答案',
    '本轮未生成替代结论，请查看工具状态或重新提问。', 'warning')
  if (status === 'incomplete') return result('回答未完成',
    '模型未完整结束回答，本轮没有发布已完成草稿；可查看工具结果并继续追问。', 'warning')
  if (status === 'blocked') return result('引用检查未通过', '当前没有发布带证据的研究结论，可补充原文或继续检索。', 'error')
  if (status === 'citations_valid_support_unverified') return result('待核验草稿已生成',
    '引用完整性已检查，但原文是否支持结论、实验条件是否一致，仍需核验。', 'warning')
  if (message?.content) return result('本轮已结束', '请结合回答检查状态判断可用性；结束不等于科学结论已验证。', 'idle')
  return result('等待提问', '围绕当前图谱提问；执行中可展开工具、查看返回内容。')
}
