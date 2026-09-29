/**
 * 原料 base 注册表 / 解析规则 / 覆盖报告 API 客户端。
 * 后端：backend_impl /api/material-base/*（见 routes/materialBase.js）。
 */
import request from './request'

// 注意：request 的响应拦截器已返回 body（{code, message, data}）；
// 这里统一解到业务负载 data，调用方直接拿到 {bases, stats} / {rules} / {variants} 等。
const payloadOf = (body) => (body && typeof body === 'object' && 'data' in body ? body.data : body)

/** 列表 + 统计：{bases, stats} */
export function listMaterialBases(params) {
  return request.get('/api/material-base', { params }).then(payloadOf)
}

/** 新增/更新 base：{base_name, material_id?, aliases?, category?} */
export function upsertMaterialBase(data) {
  return request.post('/api/material-base', data).then(payloadOf)
}

/** 启停 base */
export function setMaterialBaseEnabled(baseId, enabled) {
  return request.put(`/api/material-base/${baseId}`, { enabled }).then(payloadOf)
}

export function listMaterialBaseRules() {
  return request.get('/api/material-base/rules').then(payloadOf)
}

/** 新增规则 {kind, pattern, target_base_id, priority?} —— 建完即可入库 */
export function addMaterialBaseRule(data) {
  return request.post('/api/material-base/rules', data).then(payloadOf)
}

export function setMaterialBaseRuleEnabled(ruleId, enabled) {
  return request.put(`/api/material-base/rules/${ruleId}`, { enabled }).then(payloadOf)
}

export function removeMaterialBaseRule(ruleId) {
  return request.delete(`/api/material-base/rules/${ruleId}`).then(payloadOf)
}

/** 解析名称：返回 {resolved, via, base, suggestions, suggestedRules} */
export function resolveMaterialName(name) {
  return request.post('/api/material-base/resolve', { name }).then(payloadOf)
}

/** 变体词表规模：[{variant, size}] */
export function listMaterialVocab() {
  return request.get('/api/material-base/vocab').then(payloadOf)
}

export function refreshMaterialVocab(variants) {
  return request.post('/api/material-base/vocab/refresh', variants ? { variants } : {}).then(payloadOf)
}

/** 覆盖报告：{variant, coverage, coverageByVariant, recommendedVariant} */
export function materialCoverage(data) {
  return request.post('/api/material-base/coverage', data).then(payloadOf)
}

/** 从配方/组件直接预测（含覆盖报告与告警） */
export function predictFromFormula(data) {
  return request.post('/api/predict/from-formula', data).then(payloadOf)
}
