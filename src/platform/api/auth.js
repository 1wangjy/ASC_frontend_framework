import request from './request'

/** @param {{ username: string, password: string }} data */
export function login(data) {
  return request.post('/api/auth/login', data)
}

export function logout() {
  return request.post('/api/auth/logout')
}