const express = require('express');
const router = express.Router();
const model1Controller = require('../controllers/model1Controller');

// 提交配方信息
router.post('/submit', model1Controller.submitRecipe);

// 列出性能预测器的 96 原料空间
router.get('/materials', model1Controller.listMaterials);

// 配方性能预测 (真实 recipe_opt RecipePredictor)
router.post('/predict', model1Controller.predictProperties);

module.exports = router;
