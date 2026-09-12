const database = require('../config/database');
const vectorService = require('../services/vectorService');
const localModelService = require('../services/localModelService');
const model1PredictionService = require('../services/model1PredictionService');

/**
 * ⚠️ DEPRECATED (废弃)：listMaterials/predictProperties 属旧占位预测（recipe_opt 96 原料）。
 * 规范预测请走 /api/v1/*（example 模型服务）。submitRecipe 亦为旧占位（外部 :8000）。
 */
class Model1Controller {
  // 列出性能预测器的 96 原料空间
  async listMaterials(req, res) {
    try {
      const data = await model1PredictionService.listMaterials();
      res.json({ code: 200, data });
    } catch (error) {
      console.error('Error listing model1 materials:', error);
      res.status(500).json({ code: 500, message: error.message || 'Internal server error' });
    }
  }

  // 配方 -> 19 项性能预测 (真实 recipe_opt RecipePredictor)
  async predictProperties(req, res) {
    try {
      const { recipe } = req.body || {};
      const data = await model1PredictionService.predictRecipe(recipe);
      res.json({ code: 200, data });
    } catch (error) {
      console.error('Error predicting properties:', error);
      res.status(500).json({ code: 500, message: error.message || 'Internal server error' });
    }
  }
  // 提交配方信息
  async submitRecipe(req, res) {
    try {
      const { content } = req.body;
      
      // 存储配方到数据库
      let recipeId;
      if (database.dbType === 'sqlite') {
        const result = await database.execute(
          'INSERT INTO recipes (name, content) VALUES (?, ?)',
          ['Recipe ' + new Date().getTime(), content]
        );
        recipeId = result.lastID;
      } else if (database.dbType === 'mongodb') {
        const { Recipe } = require('../models/mongodb');
        const recipe = await Recipe.create({ name: 'Recipe ' + new Date().getTime(), content });
        recipeId = recipe._id;
      }
      
      // 生成配方向量
      const vector = await vectorService.generateEmbedding(content);
      
      // 存储向量到数据库
      await vectorService.storeEmbedding('recipe', recipeId, vector);
      
      // 与本地性能预测模型通信
      const modelResult = await localModelService.communicateWithModel1({ content, vector });
      
      res.json({
        code: 200,
        message: 'Recipe submitted successfully',
        data: {
          recipeId,
          vector: vector.slice(0, 10), // 只返回前10个元素
          modelResult
        }
      });
    } catch (error) {
      console.error('Error submitting recipe:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new Model1Controller();
