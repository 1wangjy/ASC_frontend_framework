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

export async function requestGraphLaunch({
  endpoint = '',
  fetchImpl = globalThis.fetch,
  fallbackUrl = '/knowledge/explorer',
  currentOrigin = 'http://localhost'
} = {}) {
  const normalizedEndpoint = String(endpoint ?? '').trim()

  if (!normalizedEndpoint) {
    if (!isSafeGraphRedirect(fallbackUrl, currentOrigin)) {
      throw new Error('无效的图谱跳转地址')
    }
    return { redirectUrl: fallbackUrl }
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('当前浏览器无法连接图谱服务')
  }

  const response = await fetchImpl(normalizedEndpoint, {
    method: 'POST',
    headers: { Accept: 'application/json' }
  })

  if (!response?.ok) {
    throw new Error('图谱服务暂时不可用，请稍后重试')
  }

  const payload = await response.json()
  if (!isSafeGraphRedirect(payload?.redirectUrl, currentOrigin)) {
    throw new Error('无效的图谱跳转地址')
  }

  return {
    redirectUrl: payload.redirectUrl,
    ...(payload.graphSessionId ? { graphSessionId: payload.graphSessionId } : {})
  }
}
