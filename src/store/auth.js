import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import { me as apiMe, logout as apiLogout } from '../platform/api/auth.js'
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../config/authStorage.js'

/**
 * 全局用户认证 Store（Pinia）——多用户体系下的唯一登录态来源。
 *
 * 持久化两个键：`asc_token`（JWT，请求时注入 Authorization）+ `asc_user`（展示用用户对象）。
 * 二者必须同时存在才算已登录：旧版本只存了 user 没存 token，会被视为未登录并要求重新登录
 * （否则会带着"已登录"外观发不出鉴权请求）。
 */
export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref(null)
  const token = ref('')
  const showLoginModal = ref(false)

  const isLoggedIn = computed(() => !!currentUser.value && !!token.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const role = computed(() => currentUser.value?.role || '')
  const username = computed(() => currentUser.value?.username || '')
  const avatarText = computed(() => {
    if (!currentUser.value?.username) return '?'
    return currentUser.value.username.charAt(0).toUpperCase()
  })

  /** 从 localStorage 恢复（main.js 在安装 router 之前调用） */
  function restoreLogin({ repairStorage = true } = {}) {
    try {
      const rawToken = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
      const rawUser = localStorage.getItem(USER_STORAGE_KEY)
      if (!rawToken || !rawUser) {
        // 只存了一半（旧版本遗留）→ 清干净，按未登录处理
        if (repairStorage && (rawToken || rawUser)) clearStorage()
        currentUser.value = null
        token.value = ''
        return
      }
      currentUser.value = JSON.parse(rawUser)
      token.value = rawToken
    } catch {
      if (repairStorage) clearStorage()
      currentUser.value = null
      token.value = ''
    }
  }

  function clearStorage() {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(USER_STORAGE_KEY)
    } catch { /* 隐私模式：忽略 */ }
  }

  /** 写入登录态（登录成功 / 刷新会话后调用） */
  function setSession(user, nextToken) {
    currentUser.value = user || null
    token.value = nextToken || ''
    try {
      if (currentUser.value) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser.value))
      else localStorage.removeItem(USER_STORAGE_KEY)
      if (token.value) localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
      else localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch { /* 隐私模式：忽略持久化失败，仅保留内存态 */ }
  }

  /** 兼容旧调用：仅更新用户对象（token 不变） */
  function setUser(user) {
    setSession(user, token.value)
  }

  function logout() {
    apiLogout().catch(() => { /* 后端无状态，失败不影响本地登出 */ })
    setSession(null, '')
    showLoginModal.value = false
  }

  /**
   * 向后端刷新会话：账号被禁用/拒绝/删除后，令牌会立即失效。
   * 返回是否仍然有效；401/403 时自动登出。
   */
  async function refreshSession() {
    if (!token.value) return false
    try {
      const res = await apiMe()
      if (res?.code === 200 && res.data?.user) {
        setSession(res.data.user, token.value)
        return true
      }
      return false
    } catch (error) {
      const status = error?.response?.status
      if (status === 401 || status === 403) logout()
      return false
    }
  }

  function openLoginModal() { showLoginModal.value = true }
  function closeLoginModal() { showLoginModal.value = false }

  // Other open tabs must drop the previous account's cached pages as well.
  if (typeof window !== 'undefined' && window.addEventListener) {
    const syncAuthStorage = event => {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY && event.key !== USER_STORAGE_KEY) return
      // Storage keys are written separately: never delete a transient half-pair
      // in another tab, or the tabs can erase a login currently being saved.
      restoreLogin({ repairStorage: false })
      if (!isLoggedIn.value) showLoginModal.value = false
    }
    window.addEventListener('storage', syncAuthStorage)
    onScopeDispose(() => window.removeEventListener('storage', syncAuthStorage))
  }

  return {
    currentUser, token, showLoginModal,
    isLoggedIn, isAdmin, role, username, avatarText,
    restoreLogin, setSession, setUser, logout, refreshSession,
    openLoginModal, closeLoginModal,
  }
})
