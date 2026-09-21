const express = require('express');
const router = express.Router();
const model2Controller = require('../controllers/model2Controller');

// 提交测试指标
router.post('/submit', model2Controller.submitTestMetrics);

// 配方优化
router.post('/optimize', model2Controller.optimizeRecipe);

// 可优化原料清单（供"逐成分约束"编辑器使用）
router.get('/materials', model2Controller.listMaterials);

// 流式配方优化 (SSE)
router.post('/optimize/stream', model2Controller.streamOptimizeRecipe);

module.exports = router;
