export function isSafeGraphRedirect(value, currentOrigin = 'http://localhost') {
  const candidate = String(value ?? '').trim()
  if (!candidate) return false

  try {
    const resolved = new URL(candidate, currentOrigin)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
  } catch {
    return false
  }
}

export function getGraphRedirectUrl(payload = {}) {
  if (!payload || typeof payload !== 'object') return ''
  return String(payload.redirectUrl ?? payload.redirect_url ?? payload.url ?? '').trim()
}

export async function requestGraphLaunch({
  endpoint = '/api/graph/launch',
  launchApi,
  currentOrigin = 'http://localhost'
} = {}) {
  if (typeof launchApi !== 'function') {
    throw new Error('当前浏览器无法连接图谱服务')
  }

  const normalizedEndpoint = String(endpoint ?? '').trim() || '/api/graph/launch'
  const payload = await launchApi(normalizedEndpoint)
  const redirectUrl = getGraphRedirectUrl(payload)
  if (!isSafeGraphRedirect(redirectUrl, currentOrigin)) {
    throw new Error('无效的图谱跳转地址')
  }

  const graphSessionId = payload?.graphSessionId ?? payload?.graph_session_id
  return {
    redirectUrl,
    ...(graphSessionId ? { graphSessionId } : {})
  }
}
