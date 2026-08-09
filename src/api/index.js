import axios from 'axios'
import { API_BASE_URL } from './runtime.js'
import { readBrowserStorageItem } from '../utils/browserStorage.js'

// 创建axios实例
const service = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5分钟超时（本体生成可能需要较长时间）
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
service.interceptors.request.use(
  config => {
    config.headers['X-NEXUS-USER'] = readBrowserStorageItem('nexus_user_id') || 'local-asc-analyst'
    return config
  },
  error => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器（容错重试机制）
service.interceptors.response.use(
  response => {
    const res = response.data
    
    // 如果返回的状态码不是success，则抛出错误
    if (!res.success && res.success !== undefined) {
      console.error('API Error:', res.error || res.message || 'Unknown error')
      return Promise.reject(new Error(res.error || res.message || 'Error'))
    }
    
    return res
  },
  error => {
    console.error('Response error:', error)
    const apiMessage = error.response?.data?.error || error.response?.data?.message
    if (apiMessage) {
      const apiError = new Error(apiMessage)
      apiError.response = error.response
      return Promise.reject(apiError)
    }
    if (error.response?.status === 413) {
      return Promise.reject(new Error('上传内容过大，请减少单次上传文件数量或调高后端 MAX_CONTENT_LENGTH_MB 配置'))
    }
    
    // 处理超时
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      console.error('Request timeout')
    }
    
    // 处理网络错误
    if (error.message === 'Network Error') {
      console.error('Network error - please check your connection')
      const networkError = new Error(
        '后端连接在返回结果前中断。请确认 NEXUS Backend 正在运行；开发环境请设置 FLASK_AUTO_RELOAD=False，重启后端后再试'
      )
      networkError.code = error.code || 'ERR_NETWORK'
      networkError.cause = error
      return Promise.reject(networkError)
    }
    
    return Promise.reject(error)
  }
)

// 带重试的请求函数
export const requestWithRetry = async (requestFn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      console.warn(`Request failed, retrying (${i + 1}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
}

export default service
