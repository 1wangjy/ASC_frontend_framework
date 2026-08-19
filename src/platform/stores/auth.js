import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout } from '../api/auth'

export const usePlatformAuthStore = defineStore('platformAuth', () => {
  const currentUser = ref(null)
  const isCollapsed = ref(false)
  const showLoginModal = ref(false)

  const isLoggedIn = computed(() => !!currentUser.value)
  const username = computed(() => currentUser.value?.username || '未登录')
  const avatarText = computed(() => {
    if (!currentUser.value?.username) return '👤'
    return currentUser.value.username.charAt(0).toUpperCase()
  })

  function restoreLogin() {
    const savedUser = localStorage.getItem('platformCurrentUser')
    if (savedUser) {
      try {
        currentUser.value = JSON.parse(savedUser)
      } catch {
        localStorage.removeItem('platformCurrentUser')
      }
    }
  }

  async function login(username, password) {
    const res = await apiLogin({ username, password })
    if (res.code === 200) {
      currentUser.value = res.data
      localStorage.setItem('platformCurrentUser', JSON.stringify(currentUser.value))
    } else {
      throw new Error(res.message || '登录失败')
    }
  }

  async function logout() {
    try {
      await apiLogout()
    } catch (e) {
      console.error('Logout error:', e)
    }
    currentUser.value = null
    localStorage.removeItem('platformCurrentUser')
  }

  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
  }

  function openLoginModal() {
    showLoginModal.value = true
  }

  function closeLoginModal() {
    showLoginModal.value = false
  }

  return {
    currentUser, isCollapsed, showLoginModal,
    isLoggedIn, username, avatarText,
    restoreLogin, login, logout, toggleCollapse,
    openLoginModal, closeLoginModal,
  }
})