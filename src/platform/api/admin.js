import request from './request'

/**
 * 获取表数据。后端 `/api/admin/data/:table` 直接返回裸数组。
 */
export function getTableData(table) {
  return request.get(`/api/admin/data/${table}`)
}

export function addTableData(table, data) {
  return request.post(`/api/admin/data/${table}`, data)
}

export function updateTableData(table, id, data) {
  return request.put(`/api/admin/data/${table}/${id}`, data)
}

export function deleteTableData(table, id) {
  return request.delete(`/api/admin/data/${table}/${id}`)
}

export function getMcMaterials() {
  return getTableData('mc_material')
}

export function getMpProperties() {
  return getTableData('mp_properties')
}