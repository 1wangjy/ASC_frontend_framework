/**
 * 智能体工具授权偏好（纯逻辑，无 UI、无网络）。
 *
 * 默认行为必须与加入本模块之前完全一致：
 *   - 未做任何改动时 `resolveToolSelection().allowTools === undefined`，
 *     请求体里不会出现 options.allowTools（服务端白名单全量生效）。
 *   - allowTools 只能在用户显式关闭某些工具或开启只读模式时收取，
 *     且只针对已注册工具列表求交集 —— 永远不会放大服务端权限。
 */

export const AGENT_TOOL_PREFS_KEY = 'asc-agent-tool-prefs'

/** 会产生副作用或高开销的工具：只读模式下自动排除。 */
export const MUTATING_TOOLS = ['recipe_optimize']

export function createDefaultToolPrefs() {
  return { disabled: [], readOnly: false }
}

/** 防御式解析：非法输入一律回落到默认值，未知工具名在求交集时自然被忽略。 */
export function parseToolPrefs(raw) {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch (_error) {
      return createDefaultToolPrefs()
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultToolPrefs()
  }
  const disabled = Array.isArray(value.disabled)
    ? [...new Set(
        value.disabled
          .filter(name => typeof name === 'string')
          .map(name => name.trim())
          .filter(Boolean)
      )]
    : []
  return { disabled, readOnly: value.readOnly === true }
}

export function loadToolPrefs(storage = safeStorage()) {
  try {
    return parseToolPrefs(storage?.getItem(AGENT_TOOL_PREFS_KEY))
  } catch (_error) {
    return createDefaultToolPrefs()
  }
}

export function saveToolPrefs(prefs, storage = safeStorage()) {
  try {
    storage?.setItem(
      AGENT_TOOL_PREFS_KEY,
      JSON.stringify({ disabled: [...prefs.disabled], readOnly: prefs.readOnly })
    )
    return true
  } catch (_error) {
    return false
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage || null
  } catch (_error) {
    return null
  }
}

export function isToolEnabled(prefs, name) {
  if (prefs.disabled.includes(name)) return false
  if (prefs.readOnly && MUTATING_TOOLS.includes(name)) return false
  return true
}

export function toggleTool(prefs, name) {
  const disabled = prefs.disabled.includes(name)
    ? prefs.disabled.filter(item => item !== name)
    : [...prefs.disabled, name]
  return { ...prefs, disabled }
}

export function setReadOnly(prefs, readOnly) {
  return { ...prefs, readOnly: readOnly === true }
}

/**
 * 把偏好映射为一次请求的 options.allowTools。
 * @param {{disabled:string[], readOnly:boolean}} prefs
 * @param {string[]} toolNames 已注册工具名（服务端 /api/agent/tools）
 * @returns {{enabled:string[], disabled:string[], total:number, blocked:boolean,
 *            allowTools:(string[]|undefined), readOnlyExcluded:string[]}}
 */
export function resolveToolSelection(prefs, toolNames) {
  const catalog = (Array.isArray(toolNames) ? toolNames : []).filter(name => typeof name === 'string')
  const enabled = catalog.filter(name => isToolEnabled(prefs, name))
  const readOnlyExcluded = prefs.readOnly
    ? catalog.filter(name => MUTATING_TOOLS.includes(name) && !prefs.disabled.includes(name))
    : []
  const allEnabled = catalog.length > 0 && enabled.length === catalog.length
  return {
    enabled,
    disabled: catalog.filter(name => !enabled.includes(name)),
    total: catalog.length,
    // 工具清单未知时无法枚举，保持默认请求（不下发 allowTools）
    blocked: catalog.length > 0 && enabled.length === 0,
    allowTools: allEnabled || catalog.length === 0 ? undefined : enabled,
    readOnlyExcluded
  }
}

/**
 * 选择结果 → 请求 options。默认（全开）时返回空对象，
 * 因此请求体与未引入本模块时逐字节一致。
 */
export function buildRequestOptions(selection) {
  return selection.allowTools ? { allowTools: [...selection.allowTools] } : {}
}
