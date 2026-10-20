import request from './request.js'

/** @param {{ username: string, password: string }} data —— username 可传用户名或邮箱 */
export function login(data) {
  return request.post('/api/auth/login', data)
}

export function logout() {
  return request.post('/api/auth/logout')
}

/** 注册（邮箱必填）；成功后账号为 pending，需管理员审批 */
export function register(data) {
  return request.post('/api/auth/register', data)
}

/** 当前登录用户（后端会校验账号状态：禁用/拒绝后令牌立即失效） */
export function me() {
  return request.get('/api/auth/me')
}
