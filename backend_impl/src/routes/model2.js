const express = require('express');
const router = express.Router();
const model2Controller = require('../controllers/model2Controller');

// 提交测试指标
router.post('/submit', model2Controller.submitTestMetrics);

// 配方优化
router.post('/optimize', model2Controller.optimizeRecipe);

module.exports = router;
