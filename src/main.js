import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './store/auth.js'
import './styles/tokens.css'
import './styles/global.css'
import './platform/styles/platform.css'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

// 路由守卫在首次导航前就需要知道登录态，因此先于 router 安装，从 localStorage 恢复
useAuthStore(pinia).restoreLogin()

app.use(router)

app.mount('#app')
