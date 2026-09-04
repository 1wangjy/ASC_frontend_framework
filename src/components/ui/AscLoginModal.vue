<template>
  <Teleport to="body">
    <div v-if="authStore.showLoginModal" class="asc-login-overlay" @click.self="authStore.closeLoginModal()">
      <div class="asc-login-card">
        <div class="asc-login-card__glow" aria-hidden="true"></div>
        <div class="asc-login-card__head">
          <span class="asc-login-card__mark">ASC</span>
          <h2>用户登录</h2>
          <p>欢迎使用 ASC 材料研究平台</p>
        </div>
        <div v-if="errorMsg" class="asc-login-error">{{ errorMsg }}</div>
        <div class="asc-login-field">
          <label for="asc-username">用户名</label>
          <input id="asc-username" v-model="username" type="text" placeholder="请输入用户名" @keyup.enter="handleLogin" />
        </div>
        <div class="asc-login-field">
          <label for="asc-password">密码</label>
          <input id="asc-password" v-model="password" type="password" placeholder="请输入密码" @keyup.enter="handleLogin" />
        </div>
        <button class="asc-login-btn" :disabled="loading" @click="handleLogin">
          <span>{{ loading ? '登录中...' : '登录' }}</span>
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
  position: fixed;
  z-index: 9999;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(7, 25, 43, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.asc-login-card {
  position: relative;
  width: min(420px, 100%);
  padding: 40px 40px 34px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 30px 80px rgba(4, 28, 49, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
/* top accent + soft glow */
.asc-login-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: linear-gradient(90deg, #0869ad, #12a1c7, #0869ad);
  background-size: 220% 100%;
  opacity: 0.9;
}
.asc-login-card__glow {
  position: absolute;
  top: -140px;
  left: 50%;
  width: 480px;
  height: 280px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(8, 105, 173, 0.16), transparent 72%);
  pointer-events: none;
}

.asc-login-card__head {
  position: relative;
  text-align: center;
  margin-bottom: 26px;
}
.asc-login-card__mark {
  display: inline-grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0a6fb8, #0869ad 55%, #0e5c94);
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 24px rgba(8, 105, 173, 0.35);
}
.asc-login-card__head h2 {
  margin: 0 0 6px;
  color: #102a43;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.3px;
}
.asc-login-card__head p {
  margin: 0;
  color: #6b7f93;
  font-size: 14px;
}

.asc-login-error {
  position: relative;
  color: #c34646;
  padding: 10px 14px;
  background: #fef3f2;
  border: 1px solid #f6d4d2;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}

.asc-login-field { position: relative; margin-bottom: 16px; }
.asc-login-field label {
  display: block;
  margin-bottom: 7px;
  font-weight: 650;
  color: #102a43;
  font-size: 13px;
}
.asc-login-field input {
  width: 100%;
  padding: 12px 15px;
  border: 1.5px solid #d5e2ec;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  color: #1d2a38;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.asc-login-field input:focus {
  outline: none;
  border-color: #0a94c0;
  box-shadow: 0 0 0 4px rgba(8, 105, 173, 0.12);
}

.asc-login-btn {
  position: relative;
  width: 100%;
  margin-top: 6px;
  padding: 13px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, #0a6fb8 0%, #0869ad 55%, #0e5c94 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(8, 105, 173, 0.32);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
.asc-login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
  box-shadow: 0 16px 34px rgba(8, 105, 173, 0.4);
}
.asc-login-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}
.asc-login-hint {
  position: relative;
  text-align: center;
  margin: 18px 0 0;
  color: #8296a8;
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .asc-login-card::before { animation: none; }
}
</style>
