export function normalizeApiBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env?.VITE_API_BASE_URL || ''
)

export function buildApiUrl(path = '', base = API_BASE_URL) {
  const value = String(path || '')
  const normalizedPath = value.startsWith('/') ? value : `/${value}`
  return `${normalizeApiBaseUrl(base)}${normalizedPath}`
}
