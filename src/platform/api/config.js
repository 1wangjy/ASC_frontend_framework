import request from './request'

export function getPropertiesConfig() {
  return request.get('/config/properties-config.json')
}

export function healthCheck() {
  return request.get('/health')
}