<template>
  <Teleport to="body">
    <div v-if="authStore.showLoginModal" class="asc-login-overlay" @click.self="authStore.closeLoginModal()">
      <div class="asc-login-card">
        <div class="asc-login-card__glow" aria-hidden="true"></div>
        <div class="asc-login-card__head">
          <span class="asc-login-card__mark">ASC</span>
          <h2>{{ isRegister ? '注册账号' : '用户登录' }}</h2>
          <p>{{ isRegister ? '注册后需管理员审批，通过即可登录' : '欢迎使用 ASC 材料研究平台' }}</p>
        </div>

        <div class="asc-login-tabs" role="tablist">
          <button
            class="asc-login-tab"
            :class="{ 'is-active': !isRegister }"
            role="tab"
            :aria-selected="!isRegister"
            @click="switchMode(false)"
          >登录</button>
          <button
            class="asc-login-tab"
            :class="{ 'is-active': isRegister }"
            role="tab"
            :aria-selected="isRegister"
            @click="switchMode(true)"
          >注册</button>
        </div>

        <div v-if="errorMsg" class="asc-login-error">{{ errorMsg }}</div>
        <div v-if="noticeMsg" class="asc-login-notice">{{ noticeMsg }}</div>

        <div class="asc-login-field">
          <label for="asc-username">{{ isRegister ? '用户名' : '用户名 / 邮箱' }}</label>
          <input
            id="asc-username"
            v-model="username"
            type="text"
            :placeholder="isRegister ? '3-32 位字母、数字、下划线' : '请输入用户名或邮箱'"
            @keyup.enter="submit"
          />
        </div>

        <template v-if="isRegister">
          <div class="asc-login-field">
            <label for="asc-email">邮箱（用于账号唯一标识）</label>
            <input id="asc-email" v-model="email" type="email" placeholder="name@example.com" @keyup.enter="submit" />
          </div>
          <div class="asc-login-field">
            <label for="asc-realname">姓名（选填）</label>
            <input id="asc-realname" v-model="realName" type="text" placeholder="真实姓名" @keyup.enter="submit" />
          </div>
        </template>

        <div class="asc-login-field">
          <label for="asc-password">密码</label>
          <input
            id="asc-password"
            v-model="password"
            type="password"
            :placeholder="isRegister ? '至少 8 位，含字母和数字' : '请输入密码'"
            @keyup.enter="submit"
          />
        </div>

        <div v-if="isRegister" class="asc-login-field">
          <label for="asc-password2">确认密码</label>
          <input id="asc-password2" v-model="password2" type="password" placeholder="再次输入密码" @keyup.enter="submit" />
        </div>

        <button class="asc-login-btn" :disabled="loading" @click="submit">
          <span>{{ loading ? (isRegister ? '提交中...' : '登录中...') : (isRegister ? '提交注册' : '登录') }}</span>
        </button>
        <p class="asc-login-hint">
          {{ isRegister ? '已有账号？点上方「登录」' : '首次使用请先注册，等待管理员审批通过' }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../store/auth.js'
import { consumeIntendedPath } from '../../config/routeAccess.js'
import { login as apiLogin, register as apiRegister } from '../../platform/api/auth.js'

const authStore = useAuthStore()
const router = useRouter()

const isRegister = ref(false)
const username = ref('')
const email = ref('')
const realName = ref('')
const password = ref('')
const password2 = ref('')
const errorMsg = ref('')
const noticeMsg = ref('')
const loading = ref(false)

/** 后端 error_code -> 中文提示（后端 message 已是中文，这里补足前端特有的引导语） */
const ERROR_TEXT = {
  PENDING_APPROVAL: '账号待管理员审批，通过后即可登录',
  REJECTED: '注册申请未通过，请联系管理员',
  DISABLED: '账号已被禁用，请联系管理员',
  USER_NOT_FOUND: '用户名或密码错误',
  BAD_PASSWORD: '用户名或密码错误',
  USERNAME_TAKEN: '该用户名已被占用',
  EMAIL_TAKEN: '该邮箱已被注册',
}

function describeError(error) {
  const payload = error?.response?.data
  if (!payload) return '无法连接到服务器，请检查后端服务是否启动'
  if (payload.error_code === 'LOCKED') {
    return `登录失败次数过多，请 ${payload.retry_after_minutes || 15} 分钟后重试`
  }
  return ERROR_TEXT[payload.error_code] || payload.message || '操作失败'
}

function switchMode(toRegister) {
  isRegister.value = toRegister
  errorMsg.value = ''
  noticeMsg.value = ''
}

function validate() {
  if (!username.value || !password.value) return '请输入用户名和密码'
  if (isRegister.value) {
    if (!email.value) return '请输入邮箱'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) return '邮箱格式不正确'
    if (password.value.length < 8) return '密码至少 8 位'
    if (password.value !== password2.value) return '两次输入的密码不一致'
  }
  return ''
}

async function submit() {
  const invalid = validate()
  if (invalid) {
    errorMsg.value = invalid
    return
  }
  loading.value = true
  errorMsg.value = ''
  noticeMsg.value = ''
  try {
    if (isRegister.value) {
      const res = await apiRegister({
        username: username.value,
        email: email.value,
        password: password.value,
        real_name: realName.value,
      })
      if (res?.code === 200) {
        switchMode(false)
        noticeMsg.value = '注册成功，等待管理员审批通过后即可登录'
        password.value = ''
        password2.value = ''
      } else {
        errorMsg.value = describeError({ response: { data: res } })
      }
      return
    }

    const res = await apiLogin({ username: username.value, password: password.value })
    if (res?.code === 200 && res.data?.token) {
      authStore.setSession(res.data.user || { username: username.value }, res.data.token)
      authStore.closeLoginModal()
      username.value = ''
      password.value = ''
      // 登录前被拦截的目标页，登录成功后直接送达
      const intended = consumeIntendedPath()
      if (intended) router.replace(intended)
    } else {
      errorMsg.value = describeError({ response: { data: res } })
    }
  } catch (error) {
    errorMsg.value = describeError(error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.asc-login-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: var(--asc-sp-5, 24px);
  background: rgba(8, 12, 22, 0.68);
  backdrop-filter: blur(6px);
}

.asc-login-card {
  position: relative;
  width: min(420px, 100%);
  padding: var(--asc-sp-6, 32px) var(--asc-sp-5, 24px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--asc-radius, 16px);
  background: var(--asc-surface, #101828);
  box-shadow: var(--asc-shadow, 0 24px 64px rgba(0, 0, 0, 0.45));
  overflow: hidden;
}

.asc-login-card__glow {
  position: absolute;
  inset: -40% -20% auto;
  height: 240px;
  background: radial-gradient(circle at 50% 40%, rgba(56, 148, 255, 0.35), transparent 70%);
  pointer-events: none;
}

.asc-login-card__head {
  position: relative;
  text-align: center;
  margin-bottom: var(--asc-sp-4, 16px);
}

.asc-login-card__mark {
  display: inline-block;
  margin-bottom: var(--asc-sp-2, 8px);
  font-family: var(--asc-font-mono, monospace);
  letter-spacing: 0.18em;
  color: var(--asc-primary, #3894ff);
}

.asc-login-card__head h2 {
  margin: 0 0 var(--asc-sp-1, 4px);
  font-size: var(--asc-fs-h3, 20px);
  color: var(--asc-heading, #f5f7fa);
}

.asc-login-card__head p {
  margin: 0;
  font-size: var(--asc-fs-small, 13px);
  color: var(--asc-muted, #94a3b8);
}

.asc-login-tabs {
  position: relative;
  display: flex;
  gap: var(--asc-sp-1, 4px);
  padding: var(--asc-sp-1, 4px);
  margin-bottom: var(--asc-sp-4, 16px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.12));
  border-radius: var(--asc-control-radius, 10px);
  background: var(--asc-surface-soft, rgba(255, 255, 255, 0.04));
}

.asc-login-tab {
  flex: 1;
  padding: var(--asc-sp-2, 8px) 0;
  border: 0;
  border-radius: calc(var(--asc-control-radius, 10px) - 2px);
  background: transparent;
  color: var(--asc-muted, #94a3b8);
  font-size: var(--asc-fs-small, 13px);
  cursor: pointer;
  transition: var(--asc-transition-base, all 0.2s ease);
}

.asc-login-tab.is-active {
  background: var(--asc-primary-soft, rgba(56, 148, 255, 0.16));
  color: var(--asc-heading, #f5f7fa);
}

.asc-login-error,
.asc-login-notice {
  position: relative;
  margin-bottom: var(--asc-sp-3, 12px);
  padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px);
  border-radius: var(--asc-control-radius, 10px);
  font-size: var(--asc-fs-small, 13px);
}

.asc-login-error {
  border: 1px solid var(--asc-danger, #ff5d5d);
  background: rgba(255, 93, 93, 0.12);
  color: var(--asc-danger, #ff5d5d);
}

.asc-login-notice {
  border: 1px solid var(--asc-success, #35d07f);
  background: var(--asc-success-soft, rgba(53, 208, 127, 0.12));
  color: var(--asc-success, #35d07f);
}

.asc-login-field {
  position: relative;
  margin-bottom: var(--asc-sp-3, 12px);
}

.asc-login-field label {
  display: block;
  margin-bottom: var(--asc-sp-1, 4px);
  font-size: var(--asc-fs-caption, 12px);
  color: var(--asc-muted, #94a3b8);
}

.asc-login-field input {
  width: 100%;
  padding: var(--asc-sp-2, 8px) var(--asc-sp-3, 12px);
  border: 1px solid var(--asc-border, rgba(255, 255, 255, 0.14));
  border-radius: var(--asc-control-radius, 10px);
  background: var(--asc-canvas, #0b1120);
  color: var(--asc-text, #e6ebf2);
  font-size: var(--asc-fs-body, 14px);
  outline: none;
}

.asc-login-field input:focus {
  border-color: var(--asc-primary, #3894ff);
}

.asc-login-btn {
  width: 100%;
  margin-top: var(--asc-sp-2, 8px);
  padding: var(--asc-sp-3, 12px) 0;
  border: 0;
  border-radius: var(--asc-control-radius, 10px);
  background: var(--asc-primary, #3894ff);
  color: #fff;
  font-size: var(--asc-fs-body, 14px);
  cursor: pointer;
  transition: var(--asc-transition-base, all 0.2s ease);
}

.asc-login-btn:hover:not(:disabled) {
  background: var(--asc-primary-hover, #1f7ae0);
}

.asc-login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.asc-login-hint {
  margin: var(--asc-sp-3, 12px) 0 0;
  text-align: center;
  font-size: var(--asc-fs-caption, 12px);
  color: var(--asc-muted, #94a3b8);
}
</style>
