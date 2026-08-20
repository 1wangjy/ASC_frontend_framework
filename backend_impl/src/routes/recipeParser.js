const express = require('express');
const router = express.Router();
const recipeParserController = require('../controllers/recipeParserController');

// 解析材料配方
router.post('/parse', recipeParserController.parseRecipe);

// 提交最终配方
router.post('/submit', recipeParserController.submitFinalRecipe);

// 批量导入 private_data 中的 txt 配方文件
const batchRecipeController = require('../controllers/batchRecipeController');
router.post('/import-batch', batchRecipeController.importBatch);

module.exports = router;
