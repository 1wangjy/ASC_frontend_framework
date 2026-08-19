/**
 * Platform API request module — independent axios instance for the data platform backend.
 * Targets http://localhost:3000 (separate from the existing ASC backend at :5002).
 */
import axios from 'axios'

const request = axios.create({
  baseURL: '/',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
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