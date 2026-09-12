/**
 * ⚠️ DEPRECATED (废弃) — 旧占位预测模型后端。
 *
 * 本路由提供的是旧 recipe_opt(96 原料空间) 占位预测，已被 example 模型服务取代。
 * 请改用规范 API（与 example 一致，长期稳定）：
 *   GET  /api/v1/model/metadata
 *   POST /api/v1/predict/simple    { X_comp, X_global, conditions, properties }
 *   POST /api/v1/predict  /  /api/v1/predict/batch
 * 旧接口暂时保留仅为兼容，随时可能移除；所有响应带 Deprecation 头。
 */
const express = require('express');
const router = express.Router();
const model1Controller = require('../controllers/model1Controller');

// 旧接口统一废弃标记：Deprecation + successor 链接。
router.use((req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/v1/predict/simple>; rel="successor-version"');
  res.setHeader('Warning', '299 - "Deprecated: use /api/v1/predict/simple (example model contract)"');
  next();
});

// 提交配方信息
router.post('/submit', model1Controller.submitRecipe);

// 列出性能预测器的 96 原料空间
router.get('/materials', model1Controller.listMaterials);

// 配方性能预测 (真实 recipe_opt RecipePredictor)
router.post('/predict', model1Controller.predictProperties);

module.exports = router;
