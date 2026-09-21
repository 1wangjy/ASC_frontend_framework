/**
 * 智能会话（多轮讨论）的模型模式选择。
 *
 * 为什么需要它：模式下拉的选项来自后端 `/api/multi-discussion/capabilities`，
 * 而"当前选择"存在 QA settings 里。直接以 `?mode=multi` 打开页面时，之前不会去拉
 * 那份能力清单，于是：
 *   1. 下拉是空的（看起来"模型不可选"）；
 *   2. settings 里仍是"深度研究"用的模型标签（例如 'DeepSeek · V4 Flash'），
 *      发送时被当作 model_mode 传给后端 —— 后端不认识这个值，直接报错。
 * 这里把"什么时候必须加载选项"和"最终发送哪个模式"收敛成两个纯函数，便于单测。
 */

/** 选项为空时必须去拉能力清单（否则下拉不可用）。 */
export function needsModelModeOptions(options = []) {
  return !Array.isArray(options) || options.length === 0
}

/**
 * 把任意来源的值收敛成合法的模式 id。
 * 不在选项里（例如残留的单模式模型标签、旧模式名被下架）时退回默认模式，
 * 绝不把不认识的值透传给后端。
 */
export function modelModeValue(option) {
  // 选项有两种来源形状：{value,label}（QA 视图）与能力接口原样 {mode,label,model}（讨论面板）。
  // 只认 value/mode/id 这类标识字段，绝不能把整个对象 String() 成 "[object Object]" 发出去。
  if (typeof option === 'string') return option.trim()
  if (!option || typeof option !== 'object') return ''
  for (const key of ['value', 'mode', 'id', 'model']) {
    const candidate = option[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

export function resolveModelModeSelection({ requested = '', options = [], fallback = 'default' } = {}) {
  const values = (Array.isArray(options) ? options : [])
    .map(modelModeValue)
    .filter(Boolean)
  const wanted = String(requested ?? '').trim()
  if (wanted && values.includes(wanted)) return wanted
  if (values.includes(fallback)) return fallback
  return values[0] || fallback
}
