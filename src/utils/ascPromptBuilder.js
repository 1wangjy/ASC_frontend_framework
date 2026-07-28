const normalize = (value) => String(value || '').trim()

export const DEFAULT_ASC_QUERY_PROMPT = [
  '请基于已构建的 ASC 耐火材料知识图谱和原文证据，回答以下问题：',
  '',
  '1. 该文献或数据中，成分-工艺-物相/显微结构-性能之间的关键关系是什么？',
  '2. 哪些结论有明确的表格、图谱、测试条件或原文句子支持？',
  '3. 这些关系的表征验证锚点、适用工况边界和后续图谱拓展方向是什么？',
].join('\n')

export function buildAscQueryPrompt(queryPrompt) {
  return normalize(queryPrompt) || DEFAULT_ASC_QUERY_PROMPT
}
