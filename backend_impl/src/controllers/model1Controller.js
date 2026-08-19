const database = require('../config/database');
const vectorService = require('../services/vectorService');
const localModelService = require('../services/localModelService');

class Model1Controller {
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
