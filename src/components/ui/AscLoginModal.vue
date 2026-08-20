<template>
  <Teleport to="body">
    <div v-if="authStore.showLoginModal" class="asc-login-overlay" @click.self="authStore.closeLoginModal()">
      <div class="asc-login-modal">
        <h2>用户登录</h2>
        <p class="asc-login-subtitle">欢迎使用 ASC 材料研究平台</p>
        <div v-if="errorMsg" class="asc-login-error">{{ errorMsg }}</div>
        <div class="asc-login-field">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="请输入用户名" @keyup.enter="handleLogin" />
        </div>
        <div class="asc-login-field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" @keyup.enter="handleLogin" />
        </div>
        <button class="asc-login-btn" :disabled="loading" @click="handleLogin">
          {{ loading ? '登录中...' : '登录' }}
        </button>
        <p class="asc-login-hint">首次使用请联系管理员获取账号</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../store/auth.js'

const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

/** 直接调用后端 /api/auth/login 验证 */
async function handleLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const { default: axios } = await import('axios')
    const res = await axios.post('/api/auth/login', {
      username: username.value,
      password: password.value,
    })
    if (res.data?.code === 200) {
      authStore.setUser(res.data.data?.user || { username: username.value })
      authStore.closeLoginModal()
      username.value = ''
      password.value = ''
    } else {
      errorMsg.value = res.data?.message || '登录失败'
    }
  } catch (e) {
    errorMsg.value = e.response?.data?.message || '无法连接到服务器'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.asc-login-overlay {
  position: fixed; z-index: 9999; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.asc-login-modal {
  background: #fff; border-radius: 12px; padding: 40px;
  width: 90%; max-width: 400px; box-shadow: 0 25px 80px rgba(0,0,0,0.3);
}
.asc-login-modal h2 { text-align: center; font-size: 22px; color: #102a43; margin-bottom: 4px; }
.asc-login-subtitle { text-align: center; color: #6b7f93; font-size: 14px; margin-bottom: 28px; }
.asc-login-error {
  color: #c34646; padding: 10px 14px; background: #fef2f2; border-radius: 6px;
  font-size: 13px; margin-bottom: 16px; text-align: center;
}
.asc-login-field { margin-bottom: 18px; }
.asc-login-field label { display: block; margin-bottom: 6px; font-weight: 600; color: #102a43; font-size: 13px; }
.asc-login-field input {
  width: 100%; padding: 10px 14px; border: 2px solid #d8e3ed; border-radius: 6px;
  font-size: 14px; transition: border-color 0.15s;
}
.asc-login-field input:focus { outline: none; border-color: #0869ad; }
.asc-login-btn {
  width: 100%; padding: 12px; background: #0869ad; color: #fff; border: none;
  border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer;
  transition: background 0.15s;
}
.asc-login-btn:hover { background: #05588f; }
.asc-login-btn:disabled { background: #bfd1df; cursor: not-allowed; }
.asc-login-hint { text-align: center; margin-top: 20px; color: #6b7f93; font-size: 12px; }
</style>