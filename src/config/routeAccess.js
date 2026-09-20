/**
 * 路由访问权限：未登录时只允许驻留首页展示页（AscHome），其余功能均需登录。
 * 单一判据由 router 守卫与侧边栏锁态共用，避免两处各写一套规则。
 */
export const PUBLIC_ROUTE_NAMES = new Set(['AscHome'])

/** 该路由是否需要登录。展示页（meta.public 或 PUBLIC_ROUTE_NAMES）放行。 */
export function routeRequiresAuth(route = {}) {
  if (route?.meta?.public) return false
  const name = route?.name
  if (name && PUBLIC_ROUTE_NAMES.has(name)) return false
  return true
}

/** 当前登录状态能否访问该路由。 */
export function canAccessRoute(isLoggedIn, route) {
  return Boolean(isLoggedIn) || !routeRequiresAuth(route)
}

/**
 * 侧边栏条目 -> 是否锁定（未登录且目标路由需要登录）。
 * 用目标路径在 router 里解析出真实路由，从而与守卫使用同一份路由配置。
 */
export function navigationItemLocked(isLoggedIn, router, path) {
  if (isLoggedIn) return false
  try {
    const resolved = router.resolve(path)
    const target = resolved.matched[resolved.matched.length - 1] || {}
    return routeRequiresAuth({ name: target.name, meta: target.meta })
  } catch {
    // 解析失败（路径本身有问题）按需要登录处理，宁可多要一次登录
    return true
  }
}

const PENDING_PATH_KEY = 'asc_pending_path'

/** 记住被拦截的目标路径，登录成功后跳回；仅存会话级。 */
export function rememberIntendedPath(path) {
  try {
    const target = String(path || '').trim()
    if (!target || target === '/') sessionStorage.removeItem(PENDING_PATH_KEY)
    else sessionStorage.setItem(PENDING_PATH_KEY, target)
  } catch { /* 隐私模式下 sessionStorage 不可用：忽略，登录后停在首页 */ }
}

/** 取出并清空目标路径（一次性）。 */
export function consumeIntendedPath() {
  try {
    const target = sessionStorage.getItem(PENDING_PATH_KEY) || ''
    sessionStorage.removeItem(PENDING_PATH_KEY)
    return target
  } catch {
    return ''
  }
}
