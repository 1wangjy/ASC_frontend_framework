import request from './request.js'
import { unwrapApiSuccess } from './request.js'

const LITERATURE_FIELDS = [
  'title',
  'authors',
  'journal',
  'year',
  'volume',
  'number',
  'pages',
  'doi',
  'abstract',
  'note',
  'entry_type',
]

export function toLiteraturePayload(data = {}) {
  return Object.fromEntries(LITERATURE_FIELDS.map((field) => [field, data[field] ?? '']))
}

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
