/**
 * Platform API request module — 数据平台后端的 axios 实例（经 vite 代理到 3001）。
 *
 * 约定：
 * - baseURL `/`，由 `vite.config.js` 的 proxy 决定各 `/api/*` 前缀的去向；
 * - 响应拦截器直接返回 `response.data`（`{ code, message, data }`），业务代码用 `unwrapApiResult` 取值；
 * - 请求拦截器注入 `Authorization: Bearer <token>`（从 localStorage 读，避免与 pinia store 形成循环依赖）。
 */
import axios from 'axios'
import { TOKEN_STORAGE_KEY } from '../../config/authStorage.js'

const request = axios.create({
  baseURL: '/',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use((config) => {
  let token = ''
  try {
    token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
  } catch { /* 隐私模式：忽略 */ }
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('Platform API Error:', error)
    return Promise.reject(error)
  },
)

/**
 * Unwrap `{ code, data, message }`-style API responses.
 */
export function unwrapApiResult(res) {
  return res.data
}

/**
 * Unwrap `{ success, data, error, message }`-style API responses.
 */
export function unwrapApiSuccess(res) {
  if (!res.success) {
    throw new Error(res.error || res.message || 'Operation failed')
  }
  return res.data
}

export default request
