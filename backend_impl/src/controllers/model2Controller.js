const database = require('../config/database');
const vectorService = require('../services/vectorService');
const localModelService = require('../services/localModelService');
const model2OptimizationService = require('../services/model2OptimizationService');

class Model2Controller {
  // 提交测试指标
  async submitTestMetrics(req, res) {
    try {
      const { metrics, loadEmbedding } = req.body;
      
      // 存储测试指标到数据库
      let metricId;
      if (database.dbType === 'sqlite') {
        const result = await database.execute(
          'INSERT INTO test_indicators (recipe_id, value, type) VALUES (?, ?, ?)',
          [null, metrics.value, metrics.type]
        );
        metricId = result.lastID;
      } else if (database.dbType === 'mongodb') {
        const { TestMetric } = require('../models/mongodb');
        const metric = await TestMetric.create({ value: metrics.value, type: metrics.type });
        metricId = metric._id;
      }
      
      // 处理embedding文件加载
      let embeddingData = null;
      if (loadEmbedding) {
        embeddingData = await vectorService.loadEmbeddingFile('./embeddings/environment.emb');
      }
      
      // 与本地配方优化模型通信
      const modelResult = await localModelService.communicateWithModel2({
        metrics,
        embeddingData
      });
      
      res.json({
        code: 200,
        message: 'Test metrics submitted successfully',
        data: {
          metricId,
          loadEmbedding,
          modelResult
        }
      });
    } catch (error) {
      console.error('Error submitting test metrics:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 配方优化 (POST /api/model2/optimize)
  async optimizeRecipe(req, res) {
    try {
      const { targets, algorithm, budget } = req.body || {};

      const payload = {
        algorithm: (typeof algorithm === 'string' && algorithm) || 'nsga2',
        budget: (typeof budget === 'number' && Number.isFinite(budget) && budget > 0)
          ? Math.round(budget)
          : 60
      };
      if (Array.isArray(targets)) {
        payload.targets = targets;
      }

      const data = await model2OptimizationService.optimizeRecipe(payload);

      if (!data || data.ok !== true) {
        res.status(500).json({
          code: 500,
          message: (data && (data.message || data.error)) || '配方优化失败'
        });
        return;
      }

      res.json({ code: 200, data });
    } catch (error) {
      console.error('Error optimizing recipe:', error);
      res.status(500).json({
        code: 500,
        message: error.message || '配方优化失败'
      });
    }
  }
}

module.exports = new Model2Controller();
