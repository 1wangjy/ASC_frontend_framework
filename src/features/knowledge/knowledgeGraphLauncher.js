export function getGraphNavigationTarget(value, currentUrl = 'http://localhost/') {
  const candidate = String(value ?? '').trim()
  if (!candidate) return null

  try {
    const base = new URL(currentUrl)
    const resolved = new URL(candidate, base)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null

    if (resolved.origin === base.origin) {
      return {
        kind: 'internal',
        target: `${resolved.pathname}${resolved.search}${resolved.hash}`
      }
    }

    return {
      kind: 'external',
      target: resolved.href
    }
  } catch {
    return null
  }
}

export function isSafeGraphRedirect(value, currentUrl = 'http://localhost/') {
  return Boolean(getGraphNavigationTarget(value, currentUrl))
}

export function getGraphRedirectUrl(payload = {}) {
  if (!payload || typeof payload !== 'object') return ''
  return String(payload.redirectUrl ?? payload.redirect_url ?? payload.url ?? '').trim()
}

export function getGraphLaunchErrorMessage(error) {
  const message = error instanceof Error ? error.message.trim() : ''

  if (error?.code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return '图谱准备时间过长，请稍后重试'
  }

  if (!message || message === 'Network Error' || /^Request failed with status code \d+$/i.test(message)) {
    return '图谱服务暂时不可用，请稍后重试'
  }

  return message
}

export async function requestGraphLaunch({
  endpoint = '/api/graph/launch',
  launchApi,
  currentUrl = 'http://localhost/'
} = {}) {
  if (typeof launchApi !== 'function') {
    throw new Error('当前浏览器无法连接图谱服务')
  }

  const normalizedEndpoint = String(endpoint ?? '').trim() || '/api/graph/launch'
  const payload = await launchApi(normalizedEndpoint)
  const redirectUrl = getGraphRedirectUrl(payload)
  if (!isSafeGraphRedirect(redirectUrl, currentUrl)) {
    throw new Error('无效的图谱跳转地址')
  }

  const graphSessionId = payload?.graphSessionId ?? payload?.graph_session_id
  return {
    redirectUrl,
    ...(graphSessionId ? { graphSessionId } : {})
  }
}
