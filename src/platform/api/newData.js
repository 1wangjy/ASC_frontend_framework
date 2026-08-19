import request from './request'
import { unwrapApiSuccess } from './request'

/**
 * 获取整表数据。后端 `/api/new-data/:table` 返回裸数组。
 */
export function getAll(table) {
  return request.get(`/api/new-data/${table}`)
}

export function getOne(table, id) {
  return request.get(`/api/new-data/${table}/${id}`).then(unwrapApiSuccess)
}

export function create(table, data) {
  return request.post(`/api/new-data/${table}`, data).then(unwrapApiSuccess)
}

export function update(table, id, data) {
  return request.put(`/api/new-data/${table}/${id}`, data).then(unwrapApiSuccess)
}

export function remove(table, id) {
  return request.delete(`/api/new-data/${table}/${id}`).then(() => undefined)
}

export function getAllLiterature() {
  return request.get('/api/new-data/literature/all')
}