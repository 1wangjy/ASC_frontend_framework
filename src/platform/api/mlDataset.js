import request from './request'
import { unwrapApiResult } from './request'

// 统一 ML 数据集 (ml_formula / ml_formula_component / ml_dataset_meta / ml_feature_stats)
export function getMlSummary() {
  return request.get('/api/ml-dataset/summary').then(unwrapApiResult)
}
export function getMlMeta() {
  return request.get('/api/ml-dataset/meta').then(unwrapApiResult)
}
export function getMlStats(params) {
  return request.get('/api/ml-dataset/stats', { params }).then(unwrapApiResult)
}
export function listMlFormulas(params) {
  return request.get('/api/ml-dataset/formulas', { params }).then(unwrapApiResult)
}
export function getMlComponents(params) {
  return request.get('/api/ml-dataset/components', { params }).then(unwrapApiResult)
}
// 一键把 ./private/*.npy 载入当前 sqlite（幂等）
export function loadMlDataset() {
  return request.post('/api/ml-dataset/load', {}).then(unwrapApiResult)
}
