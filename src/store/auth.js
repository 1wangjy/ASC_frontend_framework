import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 全局用户认证 Store (Pinia)
 * 支持登录/登出/本地持久化，覆盖整个应用（知识图谱 + 数据平台）
 */
export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref(null)
  const showLoginModal = ref(false)

  const isLoggedIn = computed(() => !!currentUser.value)
  const username = computed(() => currentUser.value?.username || '')
  const avatarText = computed(() => {
    if (!currentUser.value?.username) return '?'
    return currentUser.value.username.charAt(0).toUpperCase()
  })

  function restoreLogin() {
    try {
      const raw = localStorage.getItem('asc_user')
      if (raw) currentUser.value = JSON.parse(raw)
    } catch { localStorage.removeItem('asc_user') }
  }

  /** 设置登录状态（后端验证成功后由 login 组件调用） */
  function setUser(user) {
    currentUser.value = user
    localStorage.setItem('asc_user', JSON.stringify(user))
  }

  function logout() {
    currentUser.value = null
    localStorage.removeItem('asc_user')
  }

  function openLoginModal() { showLoginModal.value = true }
  function closeLoginModal() { showLoginModal.value = false }

  return {
    currentUser, showLoginModal, isLoggedIn, username, avatarText,
    restoreLogin, setUser, logout, openLoginModal, closeLoginModal,
  }
})