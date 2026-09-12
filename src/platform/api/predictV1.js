/**
 * 规范预测 API 客户端 —— 对齐 example 模型服务契约（长期稳定）。
 * 后端：backend_impl 反向代理 /api/v1/* → model_predict(example 推理, :8100)。
 * 注意：/api/v1 响应体即业务负载本身（非 {code,data}），因此不解包。
 *
 * 数据格式（一条 yangquan.npy samples[] 样本）：
 *   X_comp: 二维数组，列顺序=component_feature_names(51)；允许短行[material_id, ratio_pct]
 *   X_global: [water_amount, hardening_time, hardening_time_uncertainty]
 *   conditions: e.g. ["110℃","1500℃"]；properties: e.g. ["bulk_density"]
 */
import request from './request'

// 模型元数据：properties(含 trained_conditions/unit)、component_feature_names、global_feature_names、metrics
export function getPredictMetadata(params) {
  return request.get('/api/v1/model/metadata', { params })
}

// 最简预测：{ X_comp, X_global, conditions?, properties? }
export function predictSimple(data) {
  return request.post('/api/v1/predict/simple', data)
}

// 标准预测：{ request_id?, sample, conditions?, properties? }
export function predictStandard(data) {
  return request.post('/api/v1/predict', data)
}

// 批量预测：{ request_id?, items:[{sample,...}] }
export function predictBatch(data) {
  return request.post('/api/v1/predict/batch', data)
}
