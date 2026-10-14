import request, { unwrapApiResult } from './request'

/**
 * 用户管理 API（需管理员令牌；`request` 拦截器自动注入 Authorization）。
 * 自助接口（改密）任意已登录用户可调。
 */

/** 列表：`{ status, keyword, page, pageSize }` -> `{ items, total, counts, page, pageSize }` */
export function getUsers(params = {}) {
  return request.get('/api/user/users', { params }).then(unwrapApiResult)
}

/** 各状态计数（供管理页徽章） */
export function getUserStats() {
  return request.get('/api/user/users/stats').then(unwrapApiResult)
}

/** 管理员创建用户（默认直接 approved；role=admin 需显式传） */
export function createUser(data) {
  return request.post('/api/user/users', data).then(unwrapApiResult)
}

/** 改资料 / 角色 / 状态（status: approved | pending | rejected | disabled） */
export function updateUser(id, data) {
  return request.put(`/api/user/users/${id}`, data).then(unwrapApiResult)
}

/** 审批通过 */
export function approveUser(id, note = '') {
  return request.post(`/api/user/users/${id}/approve`, { note }).then(unwrapApiResult)
}

/** 审批拒绝 */
export function rejectUser(id, note = '') {
  return request.post(`/api/user/users/${id}/reject`, { note }).then(unwrapApiResult)
}

/** 重置密码（不传 password 则由后端生成并返回） */
export function resetUserPassword(id, password = '') {
  return request.post(`/api/user/users/${id}/reset-password`, { password }).then(unwrapApiResult)
}

/** 软删除 */
export function deleteUser(id) {
  return request.delete(`/api/user/users/${id}`).then(unwrapApiResult)
}

/** 自助改密 */
export function changeOwnPassword(data) {
  return request.post('/api/user/password/change', data).then(unwrapApiResult)
}

/** 随机密码生成 */
export function generatePassword(body = {}) {
  return request.post('/api/user/generate-password', body).then(unwrapApiResult)
}
