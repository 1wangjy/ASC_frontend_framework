<template>
  <div class="modal" :class="{ active: auth.showLoginModal }" @click.self="auth.closeLoginModal">
    <div class="modal-content">
      <h2>用户登录</h2>
      <p class="modal-subtitle">欢迎回来！请登录您的账号</p>
      <div v-if="errorMsg" class="error-message" style="display:block;">{{ errorMsg }}</div>
      <div class="form-group"><label>用户名</label><input v-model="username" type="text" placeholder="请输入用户名" @keyup.enter="handleLogin"></div>
      <div class="form-group"><label>密码</label><input v-model="password" type="password" placeholder="请输入密码" @keyup.enter="handleLogin"></div>
      <button class="btn" :disabled="loading" @click="handleLogin"><span v-if="loading" class="loading" />{{ loading ? '登录中...' : '登录' }}</button>
      <p class="modal-hint">首次启动密码请查看服务启动日志</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { usePlatformAuthStore } from '../stores/auth'

const auth = usePlatformAuthStore()
const username = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

watch(() => auth.showLoginModal, (v) => { if (v) { errorMsg.value = ''; username.value = ''; password.value = '' } })

async function handleLogin() {
  if (!username.value || !password.value) { errorMsg.value = '请输入用户名和密码'; return }
  loading.value = true; errorMsg.value = ''
  try {
    await auth.login(username.value, password.value)
    auth.closeLoginModal()
  } catch (e) { errorMsg.value = e.message || '登录失败' }
  finally { loading.value = false }
}
</script>