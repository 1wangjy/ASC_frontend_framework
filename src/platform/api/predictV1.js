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
import { unwrapApiResult } from './request'

// 模型元数据：properties(含 trained_conditions/unit)、component_feature_names、global_feature_names、metrics
export function getPredictMetadata(params) {
  return request.get('/api/v1/model/metadata', { params })
}

// material_id -> 可显示名称(base) 映射：{materials:[{material_id,name,samples}]}
export function getPredictMaterials() {
  return request.get('/api/v1/model/materials')
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

/**
 * 自然语言配方 → 材料代号 + 百分比。
 * Node 侧新增的解析能力（规则优先 + 模型兜底），响应是 {code,data} 包装。
 * data: { items:[{materialId,name,ratioPct,source}], unmatched, reasoning, method }
 */
export function encodeMaterials(text, options = {}) {
  return request
    .post('/api/material-encoder/encode', { text, useLlm: options.useLlm !== false })
    .then(unwrapApiResult)
}
