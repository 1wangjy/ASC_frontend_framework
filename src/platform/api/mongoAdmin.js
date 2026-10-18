import request from './request'

/**
 * MongoDB 可视化管理 API（/api/mongo）。
 * 后端只读浏览 + 索引管理 + 聚合统计；所有响应形如 { success, data }。
 */
const BASE = '/api/mongo'

function unwrap(response) {
  return response?.data ?? response
}

export function getMongoStatus() {
  return request.get(`${BASE}/status`).then(unwrap)
}

export function getMongoCollections() {
  return request.get(`${BASE}/collections`).then(unwrap)
}

/** 文档查询：{ collection, q?, qFields?, filter?, sort?, limit?, skip?, projection? } */
export function findMongoDocs(body) {
  return request.post(`${BASE}/find`, body).then(unwrap)
}

export function getMongoIndexes(collection) {
  return request.get(`${BASE}/collections/${encodeURIComponent(collection)}/indexes`).then(unwrap)
}

export function createMongoIndex(collection, body) {
  return request.post(`${BASE}/collections/${encodeURIComponent(collection)}/indexes`, body).then(unwrap)
}

export function dropMongoIndex(collection, indexName) {
  return request.delete(`${BASE}/collections/${encodeURIComponent(collection)}/indexes/${encodeURIComponent(indexName)}`).then(unwrap)
}

export function runMongoAggregate(body) {
  return request.post(`${BASE}/aggregate`, body).then(unwrap)
}

/** 文件导航（file_meta）：{ q, visibility, kind, litId, doi, limit, skip } */
export function listMongoFiles(params = {}) {
  return request.get(`${BASE}/files`, { params }).then(unwrap)
}

/** GridFS bucket 浏览 */
export function listBucketFiles(bucket, params = {}) {
  return request.get(`${BASE}/buckets/${encodeURIComponent(bucket)}/files`, { params }).then(unwrap)
}
